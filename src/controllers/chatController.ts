// src/controllers/chatController.ts
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import ChatMessage from "../models/ChatMessage";

/**
 * Get all chat messages between the authenticated user and a specific receiver.
 */
export const getChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { receiverId } = req.params;
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);
    const userId = req.user?.id;

    // Validate user authentication
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Validate receiverId format
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: "Invalid receiver ID format" });
      return;
    }

    // Check if receiver is in user's matches
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.matches.includes(receiverObjectId)) {
      res.status(403).json({ message: "User is not in your matches" });
      return;
    }

    // Fetch chat messages between userId and receiverId
    const messages = await ChatMessage.find({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
    })
      .populate("sender receiver", "-password")
      .sort("createdAt");

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Internal server error" });
    }
  }
};

/**
 * Mark chat messages as read from a specific receiver.
 */
export const markChatMessagesAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { receiverId } = req.params;
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);
    const userId = req.user?.id;

    // Validate user authentication
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Validate receiverId format
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: "Invalid receiver ID format" });
      return;
    }

    // Check if receiver is in user's matches
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.matches.includes(receiverObjectId)) {
      res.status(403).json({ message: "User is not in your matches" });
      return;
    }

    // Update messages to mark them as read
    await ChatMessage.updateMany(
      { sender: receiverId, receiver: userId, read: false },
      { $set: { read: true } }
    );

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
    } else {
      res.status(500).json({ message: "Internal server error" });
    }
  }
};
/**
 * Send a message between matched users.
 */
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { receiverId, content } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: "Invalid receiver ID format" });
      return;
    }

    // Ensure the receiver is in the user's matches
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.matches.includes(receiverId)) {
      res.status(403).json({ message: "User is not in your matches" });
      return;
    }

    // Save message to database
    const newMessage = new ChatMessage({
      sender: userId,
      receiver: receiverId,
      content,
      read: false,
    });

    await newMessage.save();

    res.status(200).json({ message: "Message sent successfully", newMessage });
  } catch (error) {
    console.error("Error sending message:", error);
    next(error);
  }
};
