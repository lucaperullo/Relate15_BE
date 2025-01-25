import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";

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

    // Check if the user is already in the queue
    const existingQueueEntry = await Queue.findOne({ user: userId });
    if (existingQueueEntry) {
      res.status(400).json({
        message: "You're already in the queue",
        state: existingQueueEntry.status,
        matchedWith: existingQueueEntry.matchedWith,
      });
      return;
    }

    // Find the current user
    const currentUser = await User.findById(userId).session(session);
    if (!currentUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Find a compatible match (not in matches array and not recently matched)
    let retries = 0;
    let foundMatch = false;

    while (retries < MAX_RETRIES && !foundMatch) {
      // Find the oldest waiting user who hasn't been matched before
      const waitingQueueEntry = await Queue.findOneAndUpdate(
        {
          status: "waiting",
          user: {
            $nin: [
              userId,
              ...currentUser.matches,
              ...(currentUser.matchCount?.keys() || []),
            ],
          },
        },
        {
          status: "matched",
          matchedWith: userId,
          $setOnInsert: { user: userId },
        },
        {
          new: true,
          sort: { createdAt: 1 }, // FIFO (First In, First Out)
          session,
        }
      ).populate("user");

      if (waitingQueueEntry?.user) {
        const waitingUser = waitingQueueEntry.user as IUser;

        // Update both users' match history
        await User.findByIdAndUpdate(
          userId,
          {
            $addToSet: { matches: waitingUser._id }, // Add to matches array
            $inc: { [`matchCount.${waitingUser._id}`]: 1 }, // Increment match count
          },
          { session }
        );

        await User.findByIdAndUpdate(
          waitingUser._id,
          {
            $addToSet: { matches: userId }, // Add to matches array
            $inc: { [`matchCount.${userId}`]: 1 }, // Increment match count
          },
          { session }
        );

        // Create a queue entry for the current user
        const currentUserQueue = new Queue({
          user: userId,
          status: "matched",
          matchedWith: waitingUser._id,
        });

        await currentUserQueue.save({ session });
        await session.commitTransaction();
        foundMatch = true;

        res.status(200).json({
          message: "Match found!",
          state: "matched",
          matchedUser: {
            id: waitingUser._id,
            name: waitingUser.name,
            email: waitingUser.email,
            role: waitingUser.role,
            profilePictureUrl: waitingUser.profilePictureUrl,
            matchCount:
              currentUser.matchCount?.get(waitingUser._id.toString()) || 0,
          },
        });
        return; // Ensure we exit the function after sending the response
      }

      retries++;
    }

    // If no match is found after retries, add the user to the queue
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
  } catch (error) {
    await session.abortTransaction();
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
    const user = await User.findById(userId).populate("matches", "-password");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user.matches);
  } catch (error) {
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
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Find the user and get the last match
    const user = await User.findById(userId).populate("matches", "-password");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const currentMatch = user.matches[user.matches.length - 1]; // Assuming the last match is the current one

    if (!currentMatch) {
      res.status(404).json({ message: "No current match found" });
      return;
    }

    res.status(200).json(currentMatch);
  } catch (error) {
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
    next(error);
  }
};
