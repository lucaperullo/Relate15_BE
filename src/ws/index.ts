import { Server as SocketIOServer } from "socket.io";
import http from "http";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import Chat, { IMessage } from "../models/ChatMessage";
import { authenticateSocket } from "../middleware/authenticate";

/**
 * Exported Socket.IO server instance
 */
export let io: SocketIOServer;

/**
 * Initialize and configure WebSocket server
 */
export const initializeWebSocket = (server: http.Server) => {
  if (io) {
    console.warn("⚠️ WebSocket already initialized. Skipping duplicate setup.");
    return;
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: ["http://localhost:3000", "https://relate15.vercel.app"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on("connection", async (socket) => {
    try {
      const user: IUser | undefined = socket.data?.user;

      if (!user || !user.id) {
        console.error("❌ WebSocket authentication failed: User not found");
        socket.disconnect();
        return;
      }

      console.log(`✅ User ${user.id} connected via WebSocket`);

      // Fetch matched users
      const userData = await User.findById(user.id)
        .populate("matches", "name email profilePictureUrl")
        .lean();

      if (!userData) {
        console.error(`❌ User ${user.id} not found in database`);
        socket.disconnect();
        return;
      }

      // Join user’s personal room
      socket.join(user.id.toString());

      // Join rooms for all matched users
      if (userData.matches?.length) {
        userData.matches.forEach((match: any) => {
          socket.join(match._id.toString()); // Ensure match ID is used
        });
      }

      console.log(
        `✅ User ${user.id} joined ${userData.matches.length} match rooms`
      );

      /**
       * Handle `joinRoom` event when a user opens a chat.
       */
      socket.on("joinRoom", async (roomId) => {
        console.log(`📢 User ${user.id} joined room: ${roomId}`);
        socket.join(roomId);

        try {
          const chat = await Chat.findOne({
            participants: { $all: [user.id, roomId] },
          }).populate({
            path: "messages.sender",
            select: "id name profilePictureUrl",
            model: "User", // Ensure it references User model
          });

          if (!chat) {
            socket.emit("chatHistory", []);
            return;
          }

          // Convert messages to proper JSON format
          const messages = chat.messages.map(
            (msg: IMessage & { _id: mongoose.Types.ObjectId }) => ({
              id: msg._id.toString(), // Convert `_id` to `id`
              sender: {
                id: (msg.sender as any)._id.toString(), // Explicitly cast sender to IUser
                name: (msg.sender as any).name || "Unknown",
                profilePictureUrl: (msg.sender as any).profilePictureUrl || "",
              },
              content: msg.content,
              createdAt: msg.createdAt,
              read: msg.read,
            })
          );

          console.log(
            `📜 Sending chat history to ${user.id}: ${messages.length} messages`
          );
          socket.emit("chatHistory", messages);
        } catch (error) {
          console.error("❌ Error fetching chat history:", error);
          socket.emit("error", "Failed to fetch chat history");
        }
      });

      /**
       * Handle sending messages between users.
       */
      socket.on("sendMessage", async ({ receiverId, content }) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            throw new Error("Invalid receiver ID format");
          }

          const senderId = user.id;
          let chat = await Chat.findOne({
            participants: { $all: [senderId, receiverId] },
          });

          if (!chat) {
            chat = new Chat({
              participants: [senderId, receiverId],
              messages: [],
            });
          }

          const newMessage = {
            sender: senderId,
            content,
            createdAt: new Date(),
            read: false,
            _id: new mongoose.Types.ObjectId(), // ✅ Ensure _id is assigned
          };

          chat.messages.push(newMessage);
          chat.lastMessageAt = new Date();
          await chat.save();

          // Populate sender info before sending
          const senderUser = await User.findById(senderId)
            .select("id name profilePictureUrl")
            .lean();

          const populatedMessage = {
            id: newMessage._id.toString(),
            sender: {
              id: senderUser?._id.toString() || senderId,
              name: senderUser?.name || "Unknown",
              profilePictureUrl: senderUser?.profilePictureUrl || "",
            },
            content: newMessage.content,
            createdAt: newMessage.createdAt,
            read: newMessage.read,
          };

          console.log(`📩 Message sent from ${senderId} to ${receiverId}`);

          // Broadcast the message to both sender and receiver rooms
          io.to(senderId).to(receiverId).emit("newMessage", populatedMessage);
        } catch (error) {
          console.error("❌ Error sending message via WebSocket:", error);
          socket.emit("error", "Failed to send message");
        }
      });

      /**
       * Handle disconnect
       */
      socket.on("disconnect", () => {
        console.log(`❌ User ${user.id} disconnected`);
      });
    } catch (error) {
      console.error("❌ WebSocket connection error:", error);
      socket.disconnect();
    }
  });

  console.log("✅ WebSocket initialized.");
};
