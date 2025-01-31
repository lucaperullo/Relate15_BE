// src/controllers/queueController.ts
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";
import Notification from "../models/Notifications";
import { io } from "../ws";

// Matchmaking configuration
const MAX_RETRIES = 3; // Maximum attempts to find a unique match
const MATCH_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours cooldown between matches

/**
 * Book a call and find a match for the user.
 */
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

    const currentUser = await User.findById(userId).session(session);
    if (!currentUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    let foundMatch = false;
    let retries = 0;

    while (retries < MAX_RETRIES && !foundMatch) {
      const waitingQueueEntry = await Queue.findOneAndUpdate(
        {
          status: "waiting",
          user: {
            $nin: [userId, ...currentUser.matches.map((id) => id.toString())],
          },
        },
        { status: "matched", matchedWith: userId },
        { new: true, sort: { createdAt: 1 }, session }
      ).populate("user");

      if (waitingQueueEntry?.user) {
        const matchedUser = waitingQueueEntry.user as IUser;

        // Ensure both users have each other in their matches array
        await User.findByIdAndUpdate(
          currentUser._id,
          {
            $addToSet: { matches: matchedUser._id },
          },
          { session }
        );

        await User.findByIdAndUpdate(
          matchedUser._id,
          {
            $addToSet: { matches: currentUser._id },
          },
          { session }
        );

        // Create queue entries for both users
        await Queue.create(
          [{ user: userId, status: "matched", matchedWith: matchedUser._id }],
          { session }
        );
        await Queue.create(
          [{ user: matchedUser._id, status: "matched", matchedWith: userId }],
          { session }
        );

        await session.commitTransaction();
        foundMatch = true;

        res
          .status(200)
          .json({
            message: "Match found!",
            state: "matched",
            matchedUser: matchedUser,
          });
        return;
      }

      retries++;
    }

    const queueEntry = new Queue({ user: userId, status: "waiting" });
    await queueEntry.save({ session });
    await session.commitTransaction();

    res.status(200).json({ message: "Added to queue", state: "waiting" });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error booking call:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get the current queue status for the user.
 */
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

    // Find the user's queue entry
    const queueEntry = await Queue.findOne({ user: userId }).populate({
      path: "matchedWith",
      select: "-password -__v",
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
    console.error("Error fetching queue status:", error);
    next(error);
  }
};

/**
 * Reset match history for a user (optional endpoint).
 */
export const resetMatches = async (
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

    // Reset matches and matchCount for the user
    await User.findByIdAndUpdate(
      userId,
      {
        $set: { matches: [], matchCount: {} },
      },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({ message: "Match history reset successfully" });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error resetting matches:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get match history for the user.
 */
export const getMatchHistory = async (
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

    // Find the user and populate the matches
    const user = await User.findById(userId).populate(
      "matches",
      "-password -__v"
    );

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user.matches);
  } catch (error) {
    console.error("Error fetching match history:", error);
    next(error);
  }
};

/**
 * Get the current match for the user.
 */
export const getCurrentMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Cerca prima nella Queue
    let queueEntry = await Queue.findOne({
      user: userId,
      status: "matched",
    }).populate({ path: "matchedWith", select: "-password -__v" });

    // Se non trova nulla, cerca direttamente in User.matches
    if (!queueEntry || !queueEntry.matchedWith) {
      const user = await User.findById(userId).populate(
        "matches",
        "-password -__v"
      );
      if (user?.matches?.length > 0) {
        res.status(200).json(user.matches);
        return;
      }
      res.status(404).json({ message: "No current match found" });
      return;
    }

    res.status(200).json(queueEntry.matchedWith);
  } catch (error) {
    console.error("Error fetching current match:", error);
    next(error);
  }
};

/**
 * Get match counts for the user.
 */
export const getMatchCounts = async (
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

    // Find the user and get match counts
    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user.matchCount);
  } catch (error) {
    console.error("Error fetching match counts:", error);
    next(error);
  }
};

/**
 * Confirm participation in a match.
 */
export const confirmParticipation = async (
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

    // Find the user's queue entry
    const queueEntry = await Queue.findOne({
      user: userId,
      status: "matched",
    }).session(session);
    if (!queueEntry || !queueEntry.matchedWith) {
      res.status(400).json({ message: "No active match to confirm" });
      return;
    }

    const matchedUserId = queueEntry.matchedWith.toString();

    // Optionally, perform additional actions like initiating a chat or event

    // Remove the queue entry as the match is confirmed
    await Queue.deleteOne({ user: userId, status: "matched" }).session(session);

    // Optionally, notify the matched user that the user has confirmed participation
    const matchedUser = await User.findById(matchedUserId).session(session);
    if (matchedUser) {
      const confirmationNotification = new Notification({
        user: matchedUser._id,
        message: `${req.user?.name} has confirmed the match.`,
        type: "match_confirmation",
      });
      await confirmationNotification.save({ session });
      io.to(matchedUser._id.toString()).emit(
        "notification",
        confirmationNotification
      );
    }

    await session.commitTransaction();

    res.status(200).json({
      message: "Participation confirmed. You can join the queue again.",
      state: "idle",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error confirming participation:", error);
    next(error);
  } finally {
    session.endSession();
  }
};
