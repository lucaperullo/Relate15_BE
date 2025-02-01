// src/middleware/authenticate.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Socket } from "socket.io";
import User, { IUser } from "../models/User";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

/**
 * Authenticate middleware that checks both cookies and Authorization headers.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
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
      res.status(401).json({ message: "Unauthorized: No token provided." });
      return; // Ensure the function exits after sending the response
    }

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    // Fetch the user from the database
    const user: IUser | null = await User.findById(decoded.id).select(
      "id name email role"
    );

    if (!user) {
      console.error("Unauthorized: User not found.");
      res.status(401).json({ message: "Unauthorized: User not found." });
      return; // Ensure the function exits after sending the response
    }

    // Attach user to request with all required properties
    req.user = {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error("Invalid token:", error);
    res.status(401).json({ message: "Unauthorized: Invalid token." });
    return; // Ensure the function exits after sending the response
  }
};

/**
 * Authenticate middleware for Socket.IO connections.
 */
export const authenticateSocket = async (
  socket: Socket,
  next: (err?: any) => void
) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error("Authentication required");

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    const user: IUser | null = await User.findById(decoded.id).select(
      "id name email role"
    );

    if (!user) throw new Error("User not found");

    // Attach user to socket data with all required properties
    socket.data.user = {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next(); // Proceed to establish the Socket.IO connection
  } catch (error) {
    console.error("Socket authentication error:", error);
    next(new Error("Authentication error"));
  }
};
