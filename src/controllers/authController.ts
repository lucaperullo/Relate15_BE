// src/controllers/authController.ts
import { Request, Response } from "express";
import User from "../models/User";
import { hashPassword, comparePasswords, generateToken } from "../utils/auth";
import logger from "../utils/logger";

export const register = async (req: Request, res: Response) => {
  const startTime = Date.now();
  logger.info("Registration process started", {
    body: req.body,
    file: req.file,
  });

  try {
    const { email, password, name, role, interests, bio } = req.body;
    logger.debug("Extracted request body data", { email, name, role });

    // Check if user already exists
    logger.debug("Checking for existing user", { email });
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt with existing email", { email });
      return res.status(400).json({ message: "Email already in use." });
    }

    // Hash the password
    logger.debug("Hashing password");
    const hashedPassword = await hashPassword(password);
    logger.debug("Password hashed successfully");

    // Handle profile picture upload
    let profilePictureUrl = "";
    if (req.file) {
      logger.info("Processing profile picture upload", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      profilePictureUrl = req.file.path;
      logger.debug("Profile picture path set", { profilePictureUrl });
    }

    // Create new user
    logger.debug("Creating new user object");
    const newUser = new User({
      email,
      password: hashedPassword,
      name,
      role,
      interests: interests
        ? interests.split(",").map((i: string) => i.trim())
        : [],
      bio,
      profilePictureUrl,
    });

    logger.info("Saving user to database", { user: newUser.toObject() });
    await newUser.save();
    logger.info("User saved successfully", { userId: newUser._id });

    // Generate JWT Token
    logger.debug("Generating JWT token");
    const token = generateToken(newUser);
    logger.debug("Token generated successfully");

    logger.info("Registration completed successfully", {
      userId: newUser._id,
      duration: Date.now() - startTime,
    });

    return res.status(201).json({
      message: "User registered successfully.",
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        interests: newUser.interests,
        bio: newUser.bio,
        profilePictureUrl: newUser.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Registration failed", {
      //@ts-ignore
      error: error.message,
      //@ts-ignore
      stack: error.stack,
      body: req.body,
      file: req.file,
      duration: Date.now() - startTime,
    });

    return res.status(500).json({
      message: "Server error during registration",
      error:
        process.env.NODE_ENV === "development"
          ? {
              //@ts-ignore
              message: error.message,
              //@ts-ignore
              code: error.code,
              //@ts-ignore
              stack: error.stack,
            }
          : undefined,
    });
  }
};

export const login = async (req: Request, res: Response) => {
  const startTime = Date.now();
  logger.info("Login attempt started", { email: req.body.email });

  try {
    const { email, password } = req.body;
    logger.debug("Looking for user in database", { email });

    const user = await User.findOne({ email });
    if (!user) {
      logger.warn("Login attempt with non-existent email", { email });
      return res.status(400).json({ message: "Invalid credentials." });
    }

    logger.debug("Comparing passwords");
    const isMatch = await comparePasswords(password, user.password);
    if (!isMatch) {
      logger.warn("Password mismatch for user", { email });
      return res.status(400).json({ message: "Invalid credentials." });
    }

    logger.debug("Generating JWT token");
    const token = generateToken(user);
    logger.info("Login successful", { userId: user._id });

    return res.status(200).json({
      message: "Logged in successfully.",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        interests: user.interests,
        bio: user.bio,
        profilePictureUrl: user.profilePictureUrl,
      },
    });
  } catch (error) {
    logger.error("Login failed", {
      //@ts-ignore
      error: error.message,
      //@ts-ignore
      stack: error.stack,
      email: req.body.email,
      duration: Date.now() - startTime,
    });

    return res.status(500).json({
      message: "Server error during login",
      error:
        process.env.NODE_ENV === "development"
          ? {
              //@ts-ignore
              message: error.message,
              //@ts-ignore
              code: error.code,
              //@ts-ignore
              stack: error.stack,
            }
          : undefined,
    });
  }
};
