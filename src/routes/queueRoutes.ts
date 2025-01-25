// src/routes/queueRoutes.ts
import express from "express";

import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import { bookCall } from "../controllers/queueController";

const router = express.Router();

/**
 * @swagger
 * /api/queue/book:
 *   post:
 *     summary: Book a 15-minute call with a random team member
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Call booked successfully or matched with a team member
 */
router.post("/book", authenticate, asyncHandler(bookCall));

export default router;
