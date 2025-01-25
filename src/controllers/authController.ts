import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { hashPassword, comparePasswords, generateToken } from "../utils/auth";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import cloudinary from "../utils/cloudinary";

declare module "express" {
  interface Request {
    userId?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRATION = 3 * 24 * 60 * 60; // 3 days
const REFRESH_WINDOW = 30 * 60; // 30 minutes

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, interests, bio } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    // Handle file upload
    let profilePictureUrl = "";
    if (req.file) {
      // Upload to Cloudinary using existing configuration
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "relate15/profile_pictures",
        transformation: { width: 500, height: 500, crop: "limit" },
      });
      profilePictureUrl = result.secure_url;
    }

    // Create new user with Cloudinary URL
    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role: role || "user",
      interests: interests?.split(",").map((i: string) => i.trim()) || [],
      bio,
      profilePictureUrl, // Use Cloudinary URL
    });

    await newUser.save();

    // Generate token and respond
    const token = generateToken(newUser);
    return res.status(201).json({
      message: "User registered successfully.",
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        profilePictureUrl: newUser.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Registration failed", { error });
    return res.status(500).json({
      message: "Server error during registration",
      ...(process.env.NODE_ENV === "development" && { error }),
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await comparePasswords(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Logged in successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePictureUrl: user.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Login failed", { error });
    return res.status(500).json({ message: "Server error during login" });
  }
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "Invalid session" });
    }

    req.userId = user._id.toString();

    // Token refresh logic
    const payload = jwt.decode(token) as { exp?: number };
    if (payload.exp && payload.exp - Date.now() / 1000 < REFRESH_WINDOW) {
      const newToken = generateToken(user);
      res.header("Authorization", `Bearer ${newToken}`);
    }

    next();
  } catch (error) {
    logger.error("Authentication failed", { error });
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const verify = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Invalid session" });
    }

    return res.status(200).json({
      message: "Session verified",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePictureUrl: user.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Session verification failed", { error });
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
