import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

/**
 * Authenticate middleware that checks both cookies and Authorization headers.
 */
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  // Check for token in cookies first
  const tokenFromCookie = req.cookies?.token;

  // Fallback to Authorization header
  const tokenFromHeader = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;

  // Use token from cookie or header
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    console.error("Unauthorized: No token provided.");
    //@ts-ignore
    return res
      .status(401)
      .json({ message: "Unauthorized: No token provided." });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
    };

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Invalid token:", error);
    res.status(401).json({ message: "Unauthorized: Invalid token." });
  }
};
