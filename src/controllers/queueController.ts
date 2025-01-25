// src/controllers/queueController.ts
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";

export const bookCall = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const existingQueueEntry = await Queue.findOne({ user: userId });
    if (existingQueueEntry) {
      res.status(400).json({
        message: "You're already in the queue",
        state: existingQueueEntry.status,
        matchedWith: existingQueueEntry.matchedWith,
      });
      return;
    }

    const waitingQueueEntry = await Queue.findOneAndUpdate(
      { status: "waiting" },
      {
        status: "matched",
        matchedWith: userId,
        $setOnInsert: { user: userId }, // Prevent race condition
      },
      {
        new: true,
        sort: { createdAt: 1 }, // FIFO
        session,
      }
    ).populate("user");

    if (waitingQueueEntry?.user) {
      const waitingUser = waitingQueueEntry.user as IUser;

      // Create match entry for current user
      const currentUserQueue = new Queue({
        user: userId,
        status: "matched",
        matchedWith: waitingUser._id,
      });

      await currentUserQueue.save({ session });

      const matchedUser = await User.findById(waitingUser._id)
        .select("-password")
        .session(session);

      await session.commitTransaction();

      res.status(200).json({
        message: "Match found!",
        state: "matched",
        matchedUser: {
          id: matchedUser?._id,
          name: matchedUser?.name,
          email: matchedUser?.email,
          role: matchedUser?.role,
          profilePictureUrl: matchedUser?.profilePictureUrl,
        },
      });
    } else {
      const queueEntry = new Queue({
        user: userId,
        status: "waiting",
      });

      await queueEntry.save({ session });
      await session.commitTransaction();

      res.status(200).json({
        message: "Added to queue",
        state: "waiting",
      });
    }
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export const getQueueStatus = async (
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

    const queueEntry = await Queue.findOne({ user: userId }).populate({
      path: "matchedWith",
      select: "-password",
    });

    if (!queueEntry) {
      res.status(404).json({ message: "No active queue session" });
      return;
    }

    res.status(200).json({
      state: queueEntry.status,
      matchedWith: queueEntry.matchedWith || undefined,
    });
  } catch (error) {
    next(error);
  }
};
