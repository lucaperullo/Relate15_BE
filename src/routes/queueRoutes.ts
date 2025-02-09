// src/routes/queueRoutes.ts
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  bookCall,
  resetMatches,
  getMatchHistory,
  getCurrentMatch,
  getMatchCounts,
  confirmAppointment, // New: Confirm appointment endpoint
  bookAppointment, // New: Book appointment endpoint
  skipAppointment, // New: Skip appointment endpoint
  confirmDate, // Import the new controller method
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
 * /api/queue/book-appointment:
 *   post:
 *     tags: [Queue]
 *     summary: Book an appointment
 *     description: Book an appointment with the matched user and update the queue accordingly.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Appointment booked successfully
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
 *         description: No active match to book an appointment
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.post("/book-appointment", authenticate, asyncHandler(bookAppointment));

/**
 * @swagger
 * /api/queue/skip-appointment:
 *   post:
 *     tags: [Queue]
 *     summary: Skip an appointment
 *     description: Skip the appointment, resetting the user to idle and updating the matched user's queue status.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Appointment skipped successfully
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
 *         description: No active match to skip an appointment
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.post("/skip-appointment", authenticate, asyncHandler(skipAppointment));

/**
 * @swagger
 * /api/queue/confirm-appointment:
 *   post:
 *     tags: [Queue]
 *     summary: Confirm an appointment
 *     description: Confirm an appointment with the matched user and remove both users from the queue.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Appointment confirmed successfully and both users removed from the queue.
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
 *         description: No active match to confirm an appointment
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error
 */
router.post(
  "/confirm-appointment",
  authenticate,
  asyncHandler(confirmAppointment)
);

/**
 * @swagger
 * /api/queue/confirm-date:
 *   post:
 *     tags: [Queue]
 *     summary: Confirm a proposed date
 *     description: Let both matched users confirm a proposed date. When both users confirm the same date, the queue state resets to idle.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       description: The proposed date to confirm (ISO8601 format).
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               confirmedDate:
 *                 type: string
 *                 format: date-time
 *                 description: The proposed confirmed date for the appointment.
 *     responses:
 *       200:
 *         description: Date confirmation result.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 state:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request or no active match.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Internal server error.
 */
router.post("/confirm-date", authenticate, asyncHandler(confirmDate));

export default router;
