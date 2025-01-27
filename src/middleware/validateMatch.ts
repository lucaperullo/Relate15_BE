// src/middleware/validateMatch.ts
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User from "../models/User";

/**
 * Middleware to validate if the current user has a match with the receiver.
 */
export const validateMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { receiverId } = req.params;

    // Check if userId is present
    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID missing." });
      return;
    }

    // Validate receiverId as a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: "Invalid receiver ID format." });
      return;
    }

    // Fetch the user from the database
    const user = await User.findById(userId).select("matches");

    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    // Check if receiverId is in user's matches
    const isMatched = user.matches.some((id) => id.equals(receiverId));

    if (!isMatched) {
      res.status(403).json({ message: "Chat not available with this user." });
      return;
    }

    // If all validations pass, proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error("Error in validateMatch middleware:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
