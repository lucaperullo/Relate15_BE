import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { hashPassword, comparePasswords, generateToken } from "../utils/auth";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import cloudinary from "../utils/cloudinary";
import mongoose from "mongoose";

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
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "relate15/profile_pictures",
        transformation: { width: 500, height: 500, crop: "limit" },
      });
      profilePictureUrl = result.secure_url;
    }

    // Create new user
    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role: role || "user",
      interests: interests?.split(",").map((i: string) => i.trim()) || [],
      bio,
      profilePictureUrl,
    });

    await newUser.save();

    // Generate token
    const token = generateToken(newUser);
    return res.status(201).json({
      message: "User registered successfully.",
      token,
      expiresIn: TOKEN_EXPIRATION,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        profilePictureUrl: newUser.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Registration failed", { error });
    return res
      .status(500)
      .json({ message: "Server error during registration" });
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
      expiresIn: TOKEN_EXPIRATION,
      user: {
        id: user.id,
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

export const verify = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("❌ Authentication header missing or malformed.");
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    console.log("🔍 Verifying token:", token);
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      exp: number;
    };

    console.log("✅ Token decoded:", decoded);

    // ✅ FIX: Use `id` instead of `userId`
    if (!decoded.id) {
      console.error("❌ Invalid user ID format:", decoded.id);
      return res.status(401).json({ message: "Invalid token format" });
    }

    // ✅ Ensure ID is valid
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      console.error("❌ Malformed MongoDB ObjectId:", decoded.id);
      return res.status(401).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(decoded.id).select("-password");

    console.log("🔍 Database lookup result:", user);

    if (!user) {
      console.error("❌ User not found for ID:", decoded.id);
      return res.status(401).json({ message: "Invalid session" });
    }

    return res.status(200).json({
      message: "Session verified",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePictureUrl: user.profilePictureUrl,
      },
      expiresIn: decoded.exp - Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error("❌ Token verification error:", error);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
