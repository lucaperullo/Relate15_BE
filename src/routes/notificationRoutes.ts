// src/routes/notificationRoutes.ts
import express, { NextFunction, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getNotifications,
  markNotificationsAsRead,
} from "../controllers/notificationController";
import { param, validationResult } from "express-validator";
import mongoose from "mongoose";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: User notifications management
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get user notifications
 *     description: Retrieve the latest 50 notifications for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, asyncHandler(getNotifications));

/**
 * @swagger
 * /api/notifications/mark-as-read/{notificationId}:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     description: Mark a specific notification as read.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the notification to mark as read
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 *       400:
 *         description: Invalid notification ID format
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/mark-as-read/:notificationId",
  authenticate,
  [
    param("notificationId")
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage("Invalid notification ID format"),
  ],
  //@ts-ignore
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  asyncHandler(markNotificationsAsRead)
);

export default router;
