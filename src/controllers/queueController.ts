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

    // Check if the user is already in the queue
    const existingQueueEntry = await Queue.findOne({ user: userId }).session(
      session
    );
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
              ...currentUser.matches.map((id) => id.toString()),
              ...(currentUser.matchCount
                ? Array.from(currentUser.matchCount.keys())
                : []),
            ],
          },
        },
        {
          status: "matched",
          matchedWith: userId,
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
        currentUser.matches.push(waitingUser._id as mongoose.Types.ObjectId);
        if (currentUser.matchCount) {
          const currentCount =
            currentUser.matchCount.get(waitingUser._id.toString()) || 0;
          currentUser.matchCount.set(
            waitingUser._id.toString(),
            currentCount + 1
          );
        }
        await currentUser.save({ session });

        currentUser.matches.push(waitingUser._id as mongoose.Types.ObjectId);
        if (waitingUser.matchCount) {
          const waitingCount =
            waitingUser.matchCount.get(currentUser._id.toString()) || 0;
          waitingUser.matchCount.set(
            currentUser._id.toString(),
            waitingCount + 1
          );
        }
        await waitingUser.save({ session });

        // Create a queue entry for the current user
        const currentUserQueue = new Queue({
          user: userId,
          status: "matched",
          matchedWith: waitingUser._id,
        });

        await currentUserQueue.save({ session });
        await session.commitTransaction();
        foundMatch = true;

        // Emit Socket.IO notifications to both users
        // Notification to current user
        const notificationForCurrentUser = new Notification({
          user: currentUser._id,
          message: `You've been matched with ${waitingUser.name}!`,
          type: "new_match",
        });
        await notificationForCurrentUser.save({ session });
        io.to(currentUser._id.toString()).emit(
          "notification",
          notificationForCurrentUser
        );

        // Notification to matched user
        const notificationForMatchedUser = new Notification({
          user: waitingUser._id,
          message: `You've been matched with ${currentUser.name}!`,
          type: "new_match",
        });
        await notificationForMatchedUser.save({ session });
        io.to(waitingUser._id.toString()).emit(
          "notification",
          notificationForMatchedUser
        );

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
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    // Find the user's queue entry with status "matched"
    const queueEntry = await Queue.findOne({
      user: userId,
      status: "matched",
    }).populate({
      path: "matchedWith",
      select: "-password -__v",
    });

    if (!queueEntry || !queueEntry.matchedWith) {
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
