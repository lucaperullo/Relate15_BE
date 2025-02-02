import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Chat from "../models/ChatMessage";

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

    const senderObjectId = new mongoose.Types.ObjectId(userId);
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

    let chat = await Chat.findOne({
      participants: { $all: [senderObjectId, receiverObjectId] },
    });

    if (!chat) {
      chat = new Chat({
        participants: [senderObjectId, receiverObjectId],
        messages: [],
      });
    }

    const newMessage = {
      sender: senderObjectId, // ✅ Ensures sender is an ObjectId
      content,
      createdAt: new Date(),
      read: false,
    };

    chat.messages.push(newMessage);
    chat.lastMessageAt = new Date();

    await chat.save();

    res.status(200).json({ message: "Message sent successfully", newMessage });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Internal server error" });
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
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      res.status(400).json({ message: "Invalid receiver ID format" });
      return;
    }

    const chat = await Chat.findOne({
      participants: { $all: [userId, receiverId] },
    });

    if (!chat) {
      res.status(404).json({ message: "Chat not found" });
      return;
    }

    chat.messages.forEach((msg) => {
      if (msg.sender.toString() === receiverId) {
        msg.read = true;
      }
    });

    await chat.save();

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
