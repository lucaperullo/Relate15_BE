// src/routes/queueRoutes.ts
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import { bookCall, getQueueStatus } from "../controllers/queueController";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Queue
 *   description: Team member matching queue management
 */

/**
 * @swagger
 * /api/queue/book:
 *   post:
 *     tags: [Queue]
 *     summary: Join the matching queue
 *     description: Book a 15-minute call with a random team member
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully joined queue or matched
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/QueueMatch'
 *                 - $ref: '#/components/schemas/QueueWaiting'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post("/book", authenticate, asyncHandler(bookCall));

/**
 * @swagger
 * /api/queue/status:
 *   get:
 *     tags: [Queue]
 *     summary: Get current queue status
 *     description: Check user's current position in the matching queue
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current queue status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueueStatus'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No queue entry found
 */
router.get("/status", authenticate, asyncHandler(getQueueStatus));

export default router;
