// src/ws.ts
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import mongoose from "mongoose";
import { IUser } from "../models/User";
import { authenticateSocket } from "../middleware/authenticate";
import ChatMessage from "../models/ChatMessage";
import Notification from "../models/Notifications";

/**
 * Exported Socket.IO server instance
 */
export let io: SocketIOServer;

/**
 * Initialize and configure Socket.IO server.
 */
export const initializeWebSocket = (server: http.Server) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: ["http://localhost:3000", "https://relate15.vercel.app"],
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    },
  });

  // Middleware for authenticating socket connections
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user: IUser | undefined = socket.data.user;

    if (user && user.id) {
      // Join user's personal room for direct notifications and messages
      socket.join(user.id.toString());

      // Optionally, join rooms for each match
      if (user.matches && Array.isArray(user.matches)) {
        user.matches.forEach((matchId: mongoose.Types.ObjectId) => {
          socket.join(matchId.toString());
        });
      }
    }

    /**
     * Handle sending messages between users.
     * Payload should include: receiverId, content
     */
    socket.on("sendMessage", async ({ receiverId, content }) => {
      try {
        if (!user || !user.id) {
          throw new Error("Authentication required");
        }

        // Validate receiverId format
        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
          throw new Error("Invalid receiver ID format");
        }

        // Check if receiver is in user's matches
        if (!user.matches.includes(receiverId)) {
          throw new Error("User is not in your matches");
        }

        // Save message
        const message = new ChatMessage({
          sender: user.id,
          receiver: receiverId,
          content,
        });
        await message.save();

        // Populate sender and receiver fields
        await message.populate("sender receiver", "-password -__v");

        // Broadcast the message to both sender and receiver rooms
        io.to(user.id.toString()).to(receiverId).emit("newMessage", message);
        socket.emit("messageSent", message);
      } catch (error: any) {
        console.error("Error sending message via WebSocket:", error);
        socket.emit("error", error.message);
      }
    });

    /**
     * Handle disconnect
     */
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${user?.id}`);
    });
  });
};
