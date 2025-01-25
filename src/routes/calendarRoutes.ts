import express from "express";
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} from "../controllers/calendarController";

import { asyncHandler } from "../utils/asyncHandler";
import { body, param } from "express-validator";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * /api/calendar/events:
 *   post:
 *     summary: Create a new calendar event (Book a call)
 *     description: Create a new event to schedule a call with a matched user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - start
 *               - end
 *               - matchedUserId
 *             properties:
 *               start:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-10-15T10:00:00Z"
 *                 description: The start time of the event.
 *               end:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-10-15T11:00:00Z"
 *                 description: The end time of the event.
 *               matchedUserId:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 description: The ID of the matched user.
 *     responses:
 *       201:
 *         description: Event created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Event created successfully"
 *                 event:
 *                   $ref: '#/components/schemas/CalendarEvent'
 *       400:
 *         description: Invalid input data.
 *       401:
 *         description: Unauthorized - Authentication required.
 *       404:
 *         description: Matched user not found.
 */
router.post(
  "/events",
  authenticate,
  [
    body("start").isISO8601().withMessage("Start time must be a valid date."),
    body("end")
      .isISO8601()
      .withMessage("End time must be a valid date.")
      .custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.start)) {
          throw new Error("End time must be after start time.");
        }
        return true;
      }),
    body("matchedUserId")
      .notEmpty()
      .withMessage("Matched user ID is required.")
      .isMongoId()
      .withMessage("Invalid matched user ID."),
  ],
  asyncHandler(createEvent)
);

/**
 * @swagger
 * /api/calendar/events:
 *   get:
 *     summary: Get all calendar events for the authenticated user
 *     description: Retrieve all events where the user is either the creator or the matched user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CalendarEvent'
 *       401:
 *         description: Unauthorized - Authentication required.
 */
router.get("/events", authenticate, asyncHandler(getEvents));

/**
 * @swagger
 * /api/calendar/events/{id}:
 *   put:
 *     summary: Update a calendar event
 *     description: Update the start and end times of an existing event.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the event to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               start:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-10-15T11:00:00Z"
 *                 description: The new start time of the event.
 *               end:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-10-15T12:00:00Z"
 *                 description: The new end time of the event.
 *     responses:
 *       200:
 *         description: Event updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Event updated successfully"
 *                 event:
 *                   $ref: '#/components/schemas/CalendarEvent'
 *       400:
 *         description: Invalid input data.
 *       401:
 *         description: Unauthorized - Authentication required.
 *       404:
 *         description: Event not found.
 */
router.put(
  "/events/:id",
  authenticate,
  [
    param("id").isMongoId().withMessage("Invalid event ID."),
    body("start")
      .optional()
      .isISO8601()
      .withMessage("Start time must be a valid date."),
    body("end")
      .optional()
      .isISO8601()
      .withMessage("End time must be a valid date.")
      .custom((value, { req }) => {
        if (new Date(value) <= new Date(req.body.start)) {
          throw new Error("End time must be after start time.");
        }
        return true;
      }),
  ],
  asyncHandler(updateEvent)
);

/**
 * @swagger
 * /api/calendar/events/{id}:
 *   delete:
 *     summary: Delete a calendar event
 *     description: Delete an event by its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the event to delete.
 *     responses:
 *       200:
 *         description: Event deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Event deleted successfully"
 *       401:
 *         description: Unauthorized - Authentication required.
 *       404:
 *         description: Event not found.
 */
router.delete(
  "/events/:id",
  authenticate,
  [param("id").isMongoId().withMessage("Invalid event ID.")],
  asyncHandler(deleteEvent)
);

export default router;
