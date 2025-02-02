import { Server as SocketIOServer } from "socket.io";
import http from "http";
import mongoose from "mongoose";
import User, { IUser } from "../models/User";
import Chat, { IMessage } from "../models/ChatMessage";
import { authenticateSocket } from "../middleware/authenticate";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();
const MESSAGE_SECRET_KEY = Buffer.from(process.env.MESSAGE_SECRET_KEY!, "hex");
const IV_LENGTH = 16;

// Funzione per crittografare il testo
function encryptText(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", MESSAGE_SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

// Funzione per decrittografare il testo
function decryptText(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    MESSAGE_SECRET_KEY,
    iv
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export let io: SocketIOServer;

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

      const userData = await User.findById(user.id)
        .populate("matches", "name email profilePictureUrl")
        .lean();

      if (!userData) {
        console.error(`❌ User ${user.id} not found in database`);
        socket.disconnect();
        return;
      }

      socket.join(user.id.toString());
      userData.matches?.forEach((match: any) => {
        socket.join(match._id.toString());
      });
      console.log(
        `✅ User ${user.id} joined ${userData.matches.length} match rooms`
      );

      socket.on("joinRoom", async (roomId) => {
        console.log(`📢 User ${user.id} joined room: ${roomId}`);
        socket.join(roomId);

        try {
          const chat = await Chat.findOne({
            participants: { $all: [user.id, roomId] },
          })
            .populate("messages.sender", "id name profilePictureUrl")
            .lean();

          if (!chat) {
            socket.emit("chatHistory", []);
            return;
          }

          const messages = chat.messages.map(
            (msg: IMessage & { _id: mongoose.Types.ObjectId }) => ({
              id: msg._id.toString(),
              sender: {
                id: (msg.sender as any)._id.toString(),
                name: (msg.sender as any).name || "Unknown",
                profilePictureUrl: (msg.sender as any).profilePictureUrl || "",
              },
              content: decryptText(msg.content),
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
            content: encryptText(content),
            createdAt: new Date(),
            read: false,
            _id: new mongoose.Types.ObjectId(),
          };

          chat.messages.push(newMessage);
          chat.lastMessageAt = new Date();
          await chat.save();

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
            content: content,
            createdAt: newMessage.createdAt,
            read: newMessage.read,
          };

          console.log(`📩 Message sent from ${senderId} to ${receiverId}`);
          io.to(senderId).to(receiverId).emit("newMessage", populatedMessage);
        } catch (error) {
          console.error("❌ Error sending message via WebSocket:", error);
          socket.emit("error", "Failed to send message");
        }
      });

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
