// src/routes/queueRoutes.ts
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  bookCall,
  getQueueStatus,
  resetMatches,
  getMatchHistory,
  getCurrentMatch,
  getMatchCounts,
  confirmParticipation,
} from "../controllers/queueController";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Queue
 *   description: Matchmaking and queue management
 */

/**
 * @swagger
 * /api/queue/book:
 *   post:
 *     tags: [Queue]
 *     summary: Book a call and find a match
 *     description: Add the authenticated user to the matchmaking queue and find a compatible match.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Match found or added to queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 state:
 *                   type: string
 *                 matchedUser:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: User already in queue or invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post("/book", authenticate, asyncHandler(bookCall));

/**
 * @swagger
 * /api/queue/status:
 *   get:
 *     tags: [Queue]
 *     summary: Get current queue status
 *     description: Retrieve the current queue status and matched user (if any) for the authenticated user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current queue status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 state:
 *                   type: string
 *                 matchedWith:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No active queue session
 *       500:
 *         description: Internal server error
 */
router.get("/status", authenticate, asyncHandler(getQueueStatus));

/**
 * @swagger
 * /api/queue/reset:
 *   post:
 *     tags: [Queue]
 *     summary: Reset match history
 *     description: Reset the authenticated user's match history.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Match history reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.post("/reset", authenticate, asyncHandler(resetMatches));

/**
 * @swagger
 * /api/queue/history:
 *   get:
 *     tags: [Queue]
 *     summary: Get match history
 *     description: Retrieve the authenticated user's match history.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of matched users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/history", authenticate, asyncHandler(getMatchHistory));

/**
 * @swagger
 * /api/queue/current:
 *   get:
 *     tags: [Queue]
 *     summary: Get current match
 *     description: Retrieve the authenticated user's current match.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current matched user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No current match found
 *       500:
 *         description: Internal server error
 */
router.get("/current", authenticate, asyncHandler(getCurrentMatch));

/**
 * @swagger
 * /api/queue/match-counts:
 *   get:
 *     tags: [Queue]
 *     summary: Get match counts
 *     description: Retrieve the number of times the authenticated user has matched with each user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Match counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get("/match-counts", authenticate, asyncHandler(getMatchCounts));

/**
 * @swagger
 * /api/queue/confirm:
 *   post:
 *     tags: [Queue]
 *     summary: Confirm participation in a match
 *     description: Confirm your participation in an active match.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Participation confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 state:
 *                   type: string
 *       400:
 *         description: No active match to confirm or other bad request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.post("/confirm", authenticate, asyncHandler(confirmParticipation));

export default router;
