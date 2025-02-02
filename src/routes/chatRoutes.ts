// src/routes/chatRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  markChatMessagesAsRead,
  sendMessage,
} from "../controllers/chatController";
import { body, param, validationResult } from "express-validator";
import mongoose from "mongoose";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Chat management and messaging
 */

/**
 * @swagger
 * /api/chat/mark-as-read/{receiverId}:
 *   post:
 *     tags: [Chat]
 *     summary: Mark chat messages as read from a specific user
 *     description: Mark all unread chat messages from a particular user as read.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: receiverId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the receiver user
 *     responses:
 *       200:
 *         description: Messages marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid receiver ID format
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: User is not in your matches
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/mark-as-read/:receiverId",
  authenticate,
  [
    param("receiverId")
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid receiver ID format"),
  ],
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    next();
  },
  asyncHandler(markChatMessagesAsRead)
);

/**
 * @swagger
 * /api/chat/send:
 *   post:
 *     tags: [Chat]
 *     summary: Send a message
 *     description: Send a message to a matched user.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: The ID of the receiver user
 *               content:
 *                 type: string
 *                 description: The content of the message
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: User is not in your matches
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/send",
  authenticate,
  [
    body("receiverId")
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid receiver ID format"),
    body("content").isString().notEmpty().withMessage("Content is required"),
  ],
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    next();
  },
  asyncHandler(sendMessage) // New handler function
);

export default router;
