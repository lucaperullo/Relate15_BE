import express from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes";
import queueRoutes from "./routes/queueRoutes";
import errorHandler from "./middleware/errorHandler";
import expressListEndpoints from "express-list-endpoints";
import calendarRoutes from "./routes/calendarRoutes";
import chatRoutes from "./routes/chatRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { initializeWebSocket } from "./ws";

dotenv.config();
const app = express();

// 1. Trust proxy first
app.set("trust proxy", 1);

// 2. Security headers
app.use(helmet());
app.use(
  helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  })
);

// 3. CORS configuration
const corsOptions = {
  origin: ["http://localhost:3000", "https://relate15.vercel.app"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

// app.use(limiter);

// 4. Body parsers
app.use(express.json());

// 5. Routes
app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Error handling
app.use(errorHandler);

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "");
    console.log("MongoDB connected.");
    console.table(expressListEndpoints(app));
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

connectDB();

const server = http.createServer(app);

export { app, server };
