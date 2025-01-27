// src/models/CalendarEvent.ts
import mongoose, { Document, Schema } from "mongoose";

export interface ICalendarEvent extends Document {
  organizer: mongoose.Types.ObjectId;
  participant: mongoose.Types.ObjectId;
  scheduledTime: Date;
  status: string; // e.g., 'pending', 'confirmed', 'canceled'
  videoLink: string;
  confirmedBy: mongoose.Types.ObjectId[]; // Array of user IDs who have confirmed
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema: Schema = new Schema(
  {
    organizer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    participant: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scheduledTime: { type: Date, required: true },
    status: { type: String, default: "pending" },
    videoLink: { type: String, required: true },
    confirmedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model<ICalendarEvent>(
  "CalendarEvent",
  CalendarEventSchema
);
