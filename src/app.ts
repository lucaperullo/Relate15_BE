import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import queueRoutes from "./routes/queueRoutes";
import expressListEndpoints from "express-list-endpoints";
import errorHandler from "./middleware/errorHandler";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);

// Health Check Route
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});
app.use(errorHandler);
// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "", {
    // @ts-ignore
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected.");

    // Log registered endpoints table
    console.log("\nRegistered Endpoints:");
    const endpoints = expressListEndpoints(app);

    endpoints.forEach((endpoint) => {
      endpoint.methods.forEach((method) => {
        console.log(`${method.padEnd(6)} ${endpoint.path}`);
      });
    });
    console.log("\n");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

export default app;
