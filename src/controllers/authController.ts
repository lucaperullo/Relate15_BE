// src/controllers/authController.ts
import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { hashPassword, comparePasswords, generateToken } from "../utils/auth";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";

declare module "express" {
  interface Request {
    userId?: string;
  }
}

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRATION = 3 * 24 * 60 * 60; // 3 days in seconds
const REFRESH_WINDOW = 30 * 60; // 30 minutes before expiration

const setAuthCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: TOKEN_EXPIRATION * 1000,
    path: "/",
  });
};

export const register = async (req: Request, res: Response) => {
  logger.info("Registration process started", { body: req.body });

  try {
    const { email, password, name, role, interests, bio } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt with existing email", { email });
      return res.status(400).json({ message: "Email already in use." });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role: role || "user",
      interests: interests?.split(",").map((i: string) => i.trim()) || [],
      bio,
      profilePictureUrl: req.file?.path || "",
    });

    await newUser.save();

    const token = generateToken(newUser);
    setAuthCookie(res, token);

    logger.info("Registration completed successfully", { userId: newUser._id });

    return res.status(201).json({
      message: "User registered successfully.",
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
  logger.info("Login attempt started", { email: req.body.email });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await comparePasswords(password, user.password))) {
      logger.warn("Invalid login attempt", { email });
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    logger.info("Login successful", { userId: user._id });

    return res.status(200).json({
      message: "Logged in successfully.",
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
    return res.status(500).json({
      message: "Server error during login",
      ...(process.env.NODE_ENV === "development" && { error }),
    });
  }
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.token;

  if (!token) {
    logger.warn("Unauthorized access attempt - missing token");
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.warn("Invalid token - user not found");
      res.clearCookie("token");
      return res.status(401).json({ message: "Invalid session" });
    }

    req.userId = user._id.toString();

    // Token refresh logic
    const payload = jwt.decode(token) as { exp?: number };
    if (payload.exp && payload.exp - Date.now() / 1000 < REFRESH_WINDOW) {
      const newToken = generateToken(user);
      setAuthCookie(res, newToken);
      logger.info("Token refreshed", { userId: user._id });
    }

    next();
  } catch (error) {
    logger.error("Authentication failed", { error });
    res.clearCookie("token");
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
