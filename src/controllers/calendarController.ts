// src/controllers/calendarController.ts
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { io } from "../ws";
import User from "../models/User";
import CalendarEvent, { ICalendarEvent } from "../models/CalendarEvent";
import Notification from "../models/Notifications";

// Create a new video call event
export const createEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { participantId, scheduledTime } = req.body;

    // Validate participants are matched
    const organizer = await User.findById(user.id).session(session);
    if (!organizer?.matches.includes(participantId)) {
      res.status(400).json({ message: "Participant not in your matches" });
      return;
    }

    // Create the video call event
    const newEvent = new CalendarEvent({
      organizer: user.id,
      participant: participantId,
      scheduledTime,
      status: "pending",
      videoLink: generateUniqueVideoLink(),
      confirmedBy: [],
    });

    await newEvent.save({ session });

    // Send notification to participant
    const notification = new Notification({
      user: participantId,
      message: `New video call request from ${organizer.name}`,
      type: "call_request",
    });

    await notification.save({ session });
    io.to(participantId).emit("notification", notification);

    await session.commitTransaction();

    res.status(201).json({
      message: "Video call scheduled",
      event: newEvent,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Confirm a video call event
export const confirmEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { eventId } = req.params;
    const event = await CalendarEvent.findById(eventId).session(session);

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    // Validate participant
    if (
      ![event.organizer.toString(), event.participant.toString()].includes(
        user.id
      )
    ) {
      res.status(403).json({ message: "Not authorized to confirm this event" });
      return;
    }

    // Check if already confirmed using .some() and .equals()
    if (event.confirmedBy.some((id) => id.equals(user.id))) {
      res.status(400).json({ message: "Event already confirmed by this user" });
      return;
    }

    // Update confirmation by converting user.id to ObjectId
    event.confirmedBy.push(new mongoose.Types.ObjectId(user.id));

    if (event.confirmedBy.length === 2) {
      event.status = "confirmed";

      // Notify both participants
      const notificationMessage = `Video call confirmed for ${event.scheduledTime.toISOString()}`;

      const notifications = [
        new Notification({
          user: event.organizer,
          message: notificationMessage,
          type: "call_confirmation",
        }),
        new Notification({
          user: event.participant,
          message: notificationMessage,
          type: "call_confirmation",
        }),
      ];

      await Promise.all(notifications.map((n) => n.save({ session })));

      // Send real-time updates
      io.to(event.organizer.toString()).emit("callConfirmed", event);
      io.to(event.participant.toString()).emit("callConfirmed", event);
    }

    await event.save({ session });
    await session.commitTransaction();

    res.status(200).json(event);
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Get user's video call events
export const getEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const events = await CalendarEvent.find({
      $or: [{ organizer: user.id }, { participant: user.id }],
    })
      .populate("organizer participant", "-password")
      .sort("-scheduledTime");

    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

// Update event (only organizer can update)
export const updateEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { eventId } = req.params;
    const { scheduledTime } = req.body;

    const event = await CalendarEvent.findOne({
      id: eventId,
      organizer: user.id,
    }).session(session);

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (scheduledTime) {
      event.scheduledTime = scheduledTime;
      event.status = "pending";
      event.confirmedBy = [];
    }

    await event.save({ session });

    // Notify participant about update
    const notification = new Notification({
      user: event.participant,
      message: `Video call schedule updated by ${user.name}`,
      type: "call_update",
    });

    await notification.save({ session });
    io.to(event.participant.toString()).emit("notification", notification);

    await session.commitTransaction();
    res.status(200).json(event);
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Cancel an event
export const cancelEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { eventId } = req.params;
    const event = await CalendarEvent.findOneAndDelete({
      id: eventId,
      organizer: user.id,
    }).session(session);

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    // Notify participant
    const notification = new Notification({
      user: event.participant,
      message: `Video call canceled by ${user.name}`,
      type: "call_cancelation",
    });

    await notification.save({ session });
    io.to(event.participant.toString()).emit("notification", notification);

    await session.commitTransaction();
    res.status(200).json({ message: "Event canceled successfully" });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Helper function for video link generation
const generateUniqueVideoLink = (): string => {
  const randomId = Math.random().toString(36).substring(2, 15);
  return `${process.env.VIDEO_BASE_URL}/${randomId}`;
};
