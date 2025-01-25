// src/controllers/queueController.ts
import { Request, Response, NextFunction } from "express";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";

export const bookCall = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: No user information." });
      return;
    }

    const existingQueueEntry = await Queue.findOne({ user: userId });
    if (existingQueueEntry) {
      res.status(400).json({ message: "You are already in the queue." });
      return;
    }

    const waitingQueueEntry = await Queue.findOne({
      status: "waiting",
    }).populate("user");

    if (waitingQueueEntry?.user) {
      const waitingUser = waitingQueueEntry.user as IUser;

      waitingQueueEntry.status = "matched";
      waitingQueueEntry.matchedWith = userId;
      await waitingQueueEntry.save();

      const currentUserQueue = new Queue({
        user: userId,
        status: "matched",
        matchedWith: waitingUser._id,
      });
      await currentUserQueue.save();

      const matchedUser = await User.findById(waitingUser._id).select(
        "-password"
      );

      res.status(200).json({
        message: "Successfully matched with a team member.",
        matchedUser,
      });
    } else {
      const queueEntry = new Queue({
        user: userId,
        status: "waiting",
      });
      await queueEntry.save();

      res.status(200).json({
        message: "You have been added to the queue. Waiting for a match...",
      });
    }
  } catch (error) {
    next(error); // 👈 Pass errors to Express error handler
  }
};
