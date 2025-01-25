import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes";
import queueRoutes from "./routes/queueRoutes";
import errorHandler from "./middleware/errorHandler";
import expressListEndpoints from "express-list-endpoints";
import calendarRoutes from "./routes/calendarRoutes";

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
  origin: ["https://relate15.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
  credentials: true,
  maxAge: 600,
};
app.use(cors(corsOptions));

// 4. Body parsers
app.use(express.json());

// 5. Routes
app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/calendar", calendarRoutes);

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

export default app;
