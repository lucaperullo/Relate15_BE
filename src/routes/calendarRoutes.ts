// src/routes/calendarRoutes.ts
import express, { Request, Response, NextFunction } from "express";
import {
  createEvent,
  getEvents,
  updateEvent,
  cancelEvent,
} from "../controllers/calendarController";
import { asyncHandler } from "../utils/asyncHandler";
import { body, param, validationResult } from "express-validator";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Fixed validation middleware handler
const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

// POST /api/calendar/events
router.post(
  "/events",
  authenticate,
  [
    body("start")
      .isISO8601()
      .withMessage("Start time must be a valid date.")
      .custom((value, { req }) => {
        if (new Date(value) < new Date()) {
          throw new Error("Start time cannot be in the past.");
        }
        return true;
      }),
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
  validateRequest, // Use the fixed validation middleware
  asyncHandler(createEvent)
);

// GET /api/calendar/events
router.get("/events", authenticate, asyncHandler(getEvents));

// PUT /api/calendar/events/:id
router.put(
  "/events/:id",
  authenticate,
  [
    param("id").isMongoId().withMessage("Invalid event ID."),
    body("start")
      .optional()
      .isISO8601()
      .withMessage("Start time must be a valid date.")
      .custom((value, { req }) => {
        if (new Date(value) < new Date()) {
          throw new Error("Start time cannot be in the past.");
        }
        return true;
      }),
    body("end")
      .optional()
      .isISO8601()
      .withMessage("End time must be a valid date.")
      .custom((value, { req }) => {
        if (req.body.start && new Date(value) <= new Date(req.body.start)) {
          throw new Error("End time must be after start time.");
        }
        return true;
      }),
  ],
  validateRequest, // Use the fixed validation middleware
  asyncHandler(updateEvent)
);

// DELETE /api/calendar/events/:id
router.delete(
  "/events/:id",
  authenticate,
  [param("id").isMongoId().withMessage("Invalid event ID.")],
  validateRequest, // Use the fixed validation middleware
  asyncHandler(cancelEvent)
);

export default router;
