import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User"; // Import your User model
import logger from "../utils/logger"; // Import your logger utility

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const REFRESH_WINDOW = 15 * 60; // 15 minutes (in seconds)

interface AuthRequest extends Request {
  userId?: string; // Attach userId to the request object
}

/**
 * Generate a new JWT token for the user.
 */
const generateToken = (user: { _id: string; email: string }): string => {
  return jwt.sign({ userId: user._id }, JWT_SECRET, {
    expiresIn: "1h", // Token expires in 1 hour
  });
};

/**
 * Authenticate middleware that verifies the token and implements token refresh logic.
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    logger.error("Unauthorized: No token provided.");
    res.status(401).json({ message: "Unauthorized: No token provided." });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Fetch the user from the database
    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.error("Invalid session: User not found.");
      res.status(401).json({ message: "Invalid session" });
      return;
    }

    // Attach the user ID to the request object
    req.userId = user._id.toString(); // Explicitly cast _id to string

    // Token refresh logic
    const payload = jwt.decode(token) as { exp?: number };
    if (payload.exp && payload.exp - Date.now() / 1000 < REFRESH_WINDOW) {
      const newToken = generateToken({
        _id: user._id.toString(), // Explicitly cast _id to string
        email: user.email,
      });
      res.header("Authorization", `Bearer ${newToken}`);
    }

    next();
  } catch (error) {
    logger.error("Authentication failed", { error });
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
