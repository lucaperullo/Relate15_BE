import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import User, { IUser } from "../models/User";
import CalendarEvent from "../models/CalendarEvent";

// Create a new event (Book a call)
export const createEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id;
    const { start, end, matchedUserId } = req.body;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Check if the matched user exists
    const matchedUser = await User.findById(matchedUserId).session(session);
    if (!matchedUser) {
      res.status(404).json({ message: "Matched user not found" });
      return;
    }

    // Create the event
    const newEvent = new CalendarEvent({
      user: userId,
      matchedUser: matchedUserId,
      start,
      end,
      title: `Call with ${matchedUser.name}`,
    });

    await newEvent.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: "Event created successfully",
      event: newEvent,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Get all events for a user
export const getEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const events = await CalendarEvent.find({
      $or: [{ user: userId }, { matchedUser: userId }],
    }).populate("user matchedUser", "-password");

    res.status(200).json({ events });
  } catch (error) {
    next(error);
  }
};

// Update an event
export const updateEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id;
    const eventId = req.params.id;
    const { start, end } = req.body;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Find the event and ensure the user owns it
    const event = await CalendarEvent.findOne({
      _id: eventId,
      user: userId,
    }).session(session);

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    // Update the event
    event.start = start || event.start;
    event.end = end || event.end;

    await event.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Delete an event
export const deleteEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id;
    const eventId = req.params.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Find the event and ensure the user owns it
    const event = await CalendarEvent.findOneAndDelete({
      _id: eventId,
      user: userId,
    }).session(session);

    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    await session.commitTransaction();

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};
