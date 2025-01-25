import express from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  bookCall,
  getQueueStatus,
  getMatchHistory,
  getCurrentMatch,
  getMatchCounts,
} from "../controllers/queueController";

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

/**
 * @swagger
 * /api/queue/match-history:
 *   get:
 *     tags: [Queue]
 *     summary: Get match history
 *     description: Retrieve the user's match history
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
 */
router.get("/match-history", authenticate, asyncHandler(getMatchHistory));

/**
 * @swagger
 * /api/queue/current-match:
 *   get:
 *     tags: [Queue]
 *     summary: Get current match
 *     description: Retrieve the user's current match (most recent match)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current match details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No current match found
 */
router.get("/current-match", authenticate, asyncHandler(getCurrentMatch));

/**
 * @swagger
 * /api/queue/match-counts:
 *   get:
 *     tags: [Queue]
 *     summary: Get match counts
 *     description: Retrieve the number of times the user has matched with others
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Match counts with other users
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
 */
router.get("/match-counts", authenticate, asyncHandler(getMatchCounts));

export default router;
