import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";
import Notification from "../models/Notifications";
import { io } from "../ws";

const MAX_RETRIES = 3;
const MATCH_COOLDOWN = 24 * 60 * 60 * 1000;

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

        await User.findByIdAndUpdate(
          userId,
          { $addToSet: { matches: matchedUser.id } },
          { session }
        );
        await User.findByIdAndUpdate(
          matchedUser.id,
          { $addToSet: { matches: userId } },
          { session }
        );

        await Queue.create(
          [{ user: userId, status: "matched", matchedWith: matchedUser.id }],
          { session }
        );
        await Queue.create(
          [{ user: matchedUser.id, status: "matched", matchedWith: userId }],
          { session }
        );

        await session.commitTransaction();
        foundMatch = true;

        // 🔥 Emit match event to both users
        io.to(userId)
          .to(matchedUser.id.toString())
          .emit("matchFound", { matchedUser });

        res
          .status(200)
          .json({ message: "Match found!", state: "matched", matchedUser });
        return;
      }

      retries++;
    }

    const queueEntry = new Queue({ user: userId, status: "waiting" });
    await queueEntry.save({ session });

    await session.commitTransaction();

    // 🔥 Emit queue update
    io.to(userId).emit("queueUpdated", { state: "waiting" });

    res.status(200).json({ message: "Added to queue", state: "waiting" });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Error booking call:", error);
    next(error);
  } finally {
    session.endSession();
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

    let queueEntry = await Queue.findOne({ user: userId, status: "matched" })
      .populate({ path: "matchedWith", select: "-password -__v" })
      .lean();

    if (queueEntry?.matchedWith) {
      res.status(200).json({
        ...queueEntry.matchedWith,
        id: queueEntry.matchedWith._id.toString(),
        _id: undefined,
      });
      return;
    }

    const user = await User.findById(userId)
      .populate("matches", "-password -__v")
      .lean();
    if (user?.matches?.length > 0) {
      res.status(200).json(
        user.matches.map((match: any) => ({
          ...match,
          id: match._id.toString(),
          _id: undefined,
        }))
      );
      return;
    }

    res.status(404).json({ message: "No current match found" });
  } catch (error) {
    console.error("Error fetching current match:", error);
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

    const queueEntry = await Queue.findOne({
      user: userId,
      status: "matched",
    }).session(session);
    if (!queueEntry || !queueEntry.matchedWith) {
      res.status(400).json({ message: "No active match to confirm" });
      return;
    }

    const matchedUserId = queueEntry.matchedWith.toString();

    // Remove the queue entry as the match is confirmed
    await Queue.deleteOne({ user: userId, status: "matched" }).session(session);

    // Notify the matched user
    const matchedUser = await User.findById(matchedUserId).session(session);
    if (matchedUser) {
      const confirmationNotification = new Notification({
        user: matchedUser.id,
        message: `${req.user?.name} has confirmed the match.`,
        type: "match_confirmation",
      });
      await confirmationNotification.save({ session });

      // 🔥 Emit confirmation event
      io.to(matchedUser.id.toString()).emit("matchConfirmed", {
        userId,
        matchedUserId,
      });
    }

    await session.commitTransaction();

    // 🔥 Emit updated queue state
    io.to(userId).emit("queueUpdated", { state: "idle" });

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

/**
 * Reset match history for a user.
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

    await User.findByIdAndUpdate(
      userId,
      { $set: { matches: [], matchCount: {} } },
      { session }
    );
    await session.commitTransaction();

    // 🔥 Emit queue reset event
    io.to(userId).emit("queueUpdated", { state: "idle" });

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

    const user = await User.findById(userId)
      .populate("matches", "-password -__v")
      .lean();
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(
      user.matches.map((match: any) => ({
        ...match,
        id: match._id.toString(),
        _id: undefined,
      }))
    );
  } catch (error) {
    console.error("Error fetching match history:", error);
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

    const user = await User.findById(userId).lean();
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
