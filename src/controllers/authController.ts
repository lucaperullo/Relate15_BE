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

/**
 * Sets the authentication cookie with secure configurations.
 */
const setAuthCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true, // Prevent client-side JS access
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    sameSite: "none", // Allow cross-origin cookies
    domain: process.env.NODE_ENV === "production" ? ".onrender.com" : undefined, // Domain for production
    partitioned: true, // Required for Chrome's new cookie partitioning
    path: "/", // Accessible across all paths
    maxAge: TOKEN_EXPIRATION * 1000, // 3 days
  });

  // Add security headers for cross-origin isolation
  res.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.header("Cross-Origin-Embedder-Policy", "credentialless");
  res.header("Access-Control-Allow-Credentials", "true");
};

/**
 * Registers a new user.
 */
export const register = async (req: Request, res: Response) => {
  logger.info("Registration process started", { body: req.body });

  try {
    const { email, password, name, role, interests, bio } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt with existing email", { email });
      return res.status(400).json({ message: "Email already in use." });
    }

    // Hash password and create user
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

    // Generate token and set cookie
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

/**
 * Logs in a user.
 */
export const login = async (req: Request, res: Response) => {
  logger.info("Login attempt started", { email: req.body.email });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // Validate credentials
    if (!user || !(await comparePasswords(password, user.password))) {
      logger.warn("Invalid login attempt", { email });
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // Generate token and set cookie
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

/**
 * Middleware to authenticate requests.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check both cookies and Authorization header
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    logger.warn("Unauthorized access attempt - missing token");
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.warn("Invalid token - user not found");
      res.clearCookie("token");
      return res.status(401).json({ message: "Invalid session" });
    }

    // Attach user ID to request
    req.userId = user._id.toString();

    // Refresh token if near expiration
    const payload = jwt.decode(token) as { exp?: number };
    if (payload.exp && payload.exp - Date.now() / 1000 < REFRESH_WINDOW) {
      const newToken = generateToken(user);
      setAuthCookie(res, newToken);
      res.header("Authorization", `Bearer ${newToken}`); // Update header
      logger.info("Token refreshed", { userId: user._id });
    }

    next();
  } catch (error) {
    logger.error("Authentication failed", { error });
    res.clearCookie("token");
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Verifies the user's session.
 */
export const verify = async (req: Request, res: Response) => {
  // Check both cookies and Authorization header
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    logger.warn("Unauthorized access attempt - missing token");
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      logger.warn("Invalid token - user not found");
      res.clearCookie("token");
      return res.status(401).json({ message: "Invalid session" });
    }

    // Add security headers
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Expose-Headers", "Set-Cookie, Authorization");
    res.header("Cache-Control", "no-store, max-age=0");

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
    res.clearCookie("token");
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
