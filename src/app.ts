import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import queueRoutes from "./routes/queueRoutes";
import expressListEndpoints from "express-list-endpoints";
import errorHandler from "./middleware/errorHandler";
import session from "express-session";

dotenv.config();

const app = express();

// Configure CORS first
const corsOptions = {
  origin: ["https://relate15.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  credentials: true,
};

app.use(cors(corsOptions));

// Session configuration (if using cookies)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      domain: ".onrender.com", // Allow subdomains
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    },
  })
);

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);

// Health Check Route
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

    // Log registered endpoints
    console.log("\nRegistered Endpoints:");
    const endpoints = expressListEndpoints(app);
    endpoints.forEach((endpoint) => {
      endpoint.methods.forEach((method) => {
        console.log(`${method.padEnd(6)} ${endpoint.path}`);
      });
    });
    console.log("\n");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

connectDB();

export default app;
