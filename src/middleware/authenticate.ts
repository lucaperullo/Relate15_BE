import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
      };
      req.user = decoded;
      next();
    } catch (error) {
      console.error("Invalid token:", error);
      res.status(401).json({ message: "Unauthorized: Invalid token." });
      return; // Exit without returning the response object
    }
  } else {
    res.status(401).json({ message: "Unauthorized: No token provided." });
    return; // Exit without returning the response object
  }
};
