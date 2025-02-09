import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Queue from "../models/Queue";
import User, { IUser } from "../models/User";
import Notification from "../models/Notifications";
import { io } from "../ws";

const MAX_RETRIES = 3;

/* ===========================
   HELPER FUNCTIONS
=========================== */

/**
 * Extracts the user id from the request.
 * If the user is not authenticated, sends a 401 response.
 */
function getUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  return userId;
}

/**
 * Runs a callback inside a MongoDB transaction.
 */
async function runInTransaction<T>(
  callback: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Transforms a user document (changing _id to id and removing _id).
 */
function transformUser(user: any) {
  const { _id, ...rest } = user;
  return { id: _id.toString(), ...rest };
}

/* ===========================
   ROUTE HANDLERS
=========================== */

/**
 * Book a call and try to find a match.
 */
export const bookCall = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  // Prevent booking if there's an existing active queue entry (waiting or matched)
  const existingEntry = await Queue.findOne({
    user: userId,
    status: { $in: ["waiting", "matched"] },
  });
  if (existingEntry) {
    res.status(400).json({
      message:
        "You already have an active booking. Complete your current call or cancel it before booking a new one.",
    });
    return;
  }

  try {
    const result = await runInTransaction(async (session) => {
      const currentUser = await User.findById(userId).session(session);
      if (!currentUser) {
        throw { status: 404, message: "User not found" };
      }

      let matchFound = false;
      let matchedUser: IUser | null = null;
      let retries = 0;

      while (retries < MAX_RETRIES && !matchFound) {
        const waitingQueueEntry = await Queue.findOneAndUpdate(
          {
            status: "waiting",
            user: {
              $nin: [
                userId,
                ...currentUser.matches.map((id: any) => id.toString()),
              ],
            },
          },
          { status: "matched", matchedWith: userId },
          { new: true, sort: { createdAt: 1 }, session }
        ).populate("user");

        if (waitingQueueEntry?.user) {
          // First cast to unknown then to IUser to satisfy TypeScript
          matchedUser = waitingQueueEntry.user as unknown as IUser;

          // Add each other to matches
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

          // Create matched queue entries for both users
          await Queue.create(
            [{ user: userId, status: "matched", matchedWith: matchedUser.id }],
            { session }
          );
          await Queue.create(
            [{ user: matchedUser.id, status: "matched", matchedWith: userId }],
            { session }
          );

          matchFound = true;
        }
        retries++;
      }

      if (matchFound && matchedUser) {
        return { state: "matched", message: "Match found!", matchedUser };
      }
      // If no match, add user to the waiting queue
      const queueEntry = new Queue({ user: userId, status: "waiting" });
      await queueEntry.save({ session });
      return { state: "waiting", message: "Added to queue" };
    });

    // Emit events after transaction completes
    if (result.state === "matched" && result.matchedUser) {
      io.to(userId)
        .to(result.matchedUser.id.toString())
        .emit("matchFound", { matchedUser: result.matchedUser });
    } else {
      io.to(userId).emit("queueUpdated", { state: "waiting" });
    }
    res.status(200).json(result);
    return;
  } catch (error: any) {
    console.error("❌ Error booking call:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Get the current match (or matches) for the user.
 */
export const getCurrentMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    const queueEntry = await Queue.findOne({ user: userId, status: "matched" })
      .populate({ path: "matchedWith", select: "-password -__v" })
      .lean();

    if (queueEntry?.matchedWith) {
      res.status(200).json(transformUser(queueEntry.matchedWith));
      return;
    }

    const user = await User.findById(userId)
      .populate("matches", "-password -__v")
      .lean();
    if (user?.matches && user.matches.length > 0) {
      res.status(200).json(user.matches.map(transformUser));
      return;
    }

    res.status(404).json({ message: "No current match found" });
    return;
  } catch (error) {
    console.error("Error fetching current match:", error);
    next(error);
  }
};

/**
 * Book an appointment.
 * - Sets appointmentStatus to "booked" on both matched queue entries.
 * - Notifies the matched user in real time.
 */
export const bookAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    const result = await runInTransaction(async (session) => {
      // Find the active match for the current user
      const queueEntry = await Queue.findOne({
        user: userId,
        status: "matched",
      }).session(session);
      if (!queueEntry || !queueEntry.matchedWith) {
        throw {
          status: 400,
          message: "No active match to book an appointment.",
        };
      }
      const matchedUserId = queueEntry.matchedWith.toString();

      // Update both users' queue entries with an appointment flag.
      // (Assumes your Queue schema supports an optional "appointmentStatus" field.)
      await Queue.findOneAndUpdate(
        { user: userId, status: "matched" },
        { appointmentStatus: "booked" },
        { session }
      );
      await Queue.findOneAndUpdate(
        { user: matchedUserId, status: "matched" },
        { appointmentStatus: "booked" },
        { session }
      );

      return {
        state: "appointmentBooked",
        message: "Appointment booked successfully.",
      };
    });

    // Emit a real-time event to both users.
    io.to(userId).emit("bookAppointment", result);
    // Also notify the matched user.
    // (The matched user's id can be included in the result if needed.)
    res.status(200).json(result);
    return;
  } catch (error: any) {
    console.error("❌ Error booking appointment:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Skip an appointment.
 * - Removes the current user's queue entry and resets the match on the other side.
 * - Notifies the matched user that the appointment was skipped.
 */
export const skipAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    const result = await runInTransaction(async (session) => {
      // Find the active match
      const queueEntry = await Queue.findOne({
        user: userId,
        status: "matched",
      }).session(session);
      if (!queueEntry || !queueEntry.matchedWith) {
        throw {
          status: 400,
          message: "No active match to skip an appointment.",
        };
      }
      const matchedUserId = queueEntry.matchedWith.toString();

      // Remove the current user's queue entry.
      await Queue.deleteOne({ user: userId, status: "matched" }).session(
        session
      );
      // For the matched user, update their queue entry to idle and clear the match.
      await Queue.findOneAndUpdate(
        { user: matchedUserId, status: "matched" },
        { status: "idle", matchedWith: null, appointmentStatus: null },
        { session }
      );

      // Optionally, remove the match from both users' match lists here if desired.

      return {
        state: "idle",
        message: "Appointment skipped. You are now idle.",
      };
    });

    // Emit the skip event to both users.
    io.to(userId).emit("skipAppointment", result);
    // Optionally notify the matched user.
    res.status(200).json(result);
    return;
  } catch (error: any) {
    console.error("❌ Error skipping appointment:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Confirm an appointment.
 * - Removes both users' queue entries.
 * - Creates a notification for the matched user.
 * - Notifies both parties via WebSocket.
 */
export const confirmAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    // Explicitly annotate the return type
    const result: { state: string; message: string; matchedUserId: string } =
      await runInTransaction(async (session) => {
        const queueEntry = await Queue.findOne({
          user: userId,
          status: "matched",
        }).session(session);
        if (!queueEntry || !queueEntry.matchedWith) {
          throw {
            status: 400,
            message: "No active match to confirm an appointment.",
          };
        }
        const matchedUserId = queueEntry.matchedWith.toString();

        // Remove both users' queue entries.
        await Queue.deleteMany({
          user: { $in: [userId, matchedUserId] },
          status: "matched",
        }).session(session);

        // Create a notification for the matched user.
        const matchedUser = await User.findById(matchedUserId).session(session);
        if (matchedUser) {
          const confirmationNotification = new Notification({
            user: matchedUser.id,
            message: `${req.user?.name} has confirmed the appointment.`,
            type: "appointment_confirmation",
          });
          await confirmationNotification.save({ session });
        }

        return {
          state: "idle",
          message:
            "Appointment confirmed and both users removed from the queue.",
          matchedUserId,
        };
      });

    // Emit the confirmation event to both users.
    io.to(userId).emit("confirmAppointment", result);
    io.to(result.matchedUserId).emit("confirmAppointment", result);
    res.status(200).json(result);
    return;
  } catch (error: any) {
    console.error("❌ Error confirming appointment:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Reset match history for the user.
 */
export const resetMatches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    await runInTransaction(async (session) => {
      await User.findByIdAndUpdate(
        userId,
        { $set: { matches: [], matchCount: {} } },
        { session }
      );
    });
    io.to(userId).emit("queueUpdated", { state: "idle" });
    res.status(200).json({ message: "Match history reset successfully" });
    return;
  } catch (error) {
    console.error("Error resetting matches:", error);
    next(error);
  }
};

/**
 * Get the match history for the user.
 */
export const getMatchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    const user = await User.findById(userId)
      .populate("matches", "-password -__v")
      .lean();
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(200).json(user.matches.map(transformUser));
    return;
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
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(200).json(user.matchCount);
    return;
  } catch (error) {
    console.error("Error fetching match counts:", error);
    next(error);
  }
};

/**
 * Confirm a date.
 * - Retrieves the current user's matched queue entry
 * - Saves the proposed date confirmation in that entry
 * - Checks the matching user's entry to see if they already confirmed the same date
 * - If both users have confirmed the same date, it removes both queue entries (setting the state back to idle)
 * - Otherwise, it returns a "waiting" state until the other user confirms
 */
export const confirmDate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  const { confirmedDate } = req.body;
  if (!confirmedDate) {
    res.status(400).json({ message: "Confirmed date is required." });
    return;
  }

  const proposedDate = new Date(confirmedDate);
  if (isNaN(proposedDate.getTime())) {
    res.status(400).json({ message: "Invalid confirmed date format." });
    return;
  }

  try {
    const result = await runInTransaction(async (session) => {
      // Look up the current user's matched entry
      const queueEntry = await Queue.findOne({
        user: userId,
        status: "matched",
      }).session(session);
      if (!queueEntry || !queueEntry.matchedWith) {
        throw { status: 400, message: "No active match to confirm a date." };
      }

      // Save the provisional date for the current user
      queueEntry.set("confirmedDate", proposedDate);
      await queueEntry.save({ session });
      const matchedUserId = queueEntry.matchedWith.toString();

      // Retrieve the matched user's queue entry for their provisional date
      const matchedQueueEntry = await Queue.findOne({
        user: matchedUserId,
        status: "matched",
      }).session(session);

      let resultPayload;
      if (matchedQueueEntry && matchedQueueEntry.get("confirmedDate")) {
        const theirProposedDate = new Date(
          matchedQueueEntry.get("confirmedDate")
        );
        if (theirProposedDate.getTime() === proposedDate.getTime()) {
          // Both users have confirmed the same date.
          // Update both entries to persist the booked appointment.
          queueEntry.set({ appointment: proposedDate, status: "booked" });
          await queueEntry.save({ session });
          matchedQueueEntry.set({
            appointment: proposedDate,
            status: "booked",
          });
          await matchedQueueEntry.save({ session });
          resultPayload = {
            state: "booked",
            message: "Both users confirmed the date. Appointment booked.",
            myProposedDate: proposedDate,
            theirProposedDate,
            appointment: proposedDate,
            matchedUserId,
          };
        } else {
          // The dates do not match; wait for the partner to update as needed.
          resultPayload = {
            state: "matched",
            message:
              "Date confirmed. Awaiting confirmation from the other user.",
            myProposedDate: proposedDate,
            theirProposedDate,
            matchedUserId,
          };
        }
      } else {
        // Other user hasn't yet proposed a date.
        resultPayload = {
          state: "matched",
          message: "Date confirmed. Awaiting confirmation from the other user.",
          myProposedDate: proposedDate,
          matchedUserId,
        };
      }
      return resultPayload;
    });

    // Emit real-time notifications to the involved users
    io.to(userId).emit("queueUpdated", result);
    if (result.matchedUserId) {
      io.to(result.matchedUserId).emit("queueUpdated", result);
    }
    res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ Error confirming date:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

export const updateConfirmedDate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  const { confirmedDate } = req.body;
  if (!confirmedDate) {
    res.status(400).json({ message: "Confirmed date is required." });
    return;
  }

  const updatedDate = new Date(confirmedDate);
  if (isNaN(updatedDate.getTime())) {
    res.status(400).json({ message: "Invalid confirmed date format." });
    return;
  }

  try {
    const result = await runInTransaction(async (session) => {
      // Find the user's current matched entry
      const queueEntry = await Queue.findOne({
        user: userId,
        status: "matched",
      }).session(session);
      if (!queueEntry || !queueEntry.matchedWith) {
        throw { status: 400, message: "No active match to update a date." };
      }

      // Update the provisional date for the current user
      queueEntry.set("confirmedDate", updatedDate);
      await queueEntry.save({ session });
      const matchedUserId = queueEntry.matchedWith.toString();

      // Get the matched user's queue entry
      const matchedQueueEntry = await Queue.findOne({
        user: matchedUserId,
        status: "matched",
      }).session(session);

      let resultPayload;
      if (matchedQueueEntry && matchedQueueEntry.get("confirmedDate")) {
        const theirProposedDate = new Date(
          matchedQueueEntry.get("confirmedDate")
        );
        if (theirProposedDate.getTime() === updatedDate.getTime()) {
          // If the new dates match, update both to mark the appointment as booked.
          queueEntry.set({ appointment: updatedDate, status: "booked" });
          await queueEntry.save({ session });
          matchedQueueEntry.set({ appointment: updatedDate, status: "booked" });
          await matchedQueueEntry.save({ session });
          resultPayload = {
            state: "booked",
            message: "Both users confirmed the date. Appointment booked.",
            myProposedDate: updatedDate,
            theirProposedDate,
            appointment: updatedDate,
            matchedUserId,
          };
        } else {
          // Otherwise, simply update the provisional date and wait.
          resultPayload = {
            state: "matched",
            message: "Date updated. Awaiting confirmation from the other user.",
            myProposedDate: updatedDate,
            theirProposedDate,
            matchedUserId,
          };
        }
      } else {
        resultPayload = {
          state: "matched",
          message: "Date updated. Awaiting confirmation from the other user.",
          myProposedDate: updatedDate,
          matchedUserId,
        };
      }
      return resultPayload;
    });

    io.to(userId).emit("queueUpdated", result);
    if (result.matchedUserId) {
      io.to(result.matchedUserId).emit("queueUpdated", result);
    }
    res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ Error updating confirmed date:", error);
    if (error.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  }
};

export const getDateProposalStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;

  try {
    // Look for an active queue entry that is either pending (matched) or booked.
    const queueEntry = await Queue.findOne({
      user: userId,
      status: { $in: ["matched", "booked"] },
    }).lean();
    if (!queueEntry) {
      res.status(200).json({
        state: "idle",
        message: "No active match or date proposal available.",
      });
      return;
    }

    const myProposedDate = queueEntry.confirmedDate || null;
    const appointment = queueEntry.appointment || null;
    let theirProposedDate = null;

    if (queueEntry.matchedWith) {
      const partnerEntry = await Queue.findOne({
        user: queueEntry.matchedWith,
        status: { $in: ["matched", "booked"] },
      }).lean();
      if (partnerEntry) {
        theirProposedDate = partnerEntry.confirmedDate || null;
      }
    }
    res.status(200).json({
      state: queueEntry.status,
      message: "Current proposal status retrieved.",
      myProposedDate,
      theirProposedDate,
      appointment,
      matchedUserId: queueEntry.matchedWith,
    });
  } catch (error) {
    next(error);
  }
};
