import mongoose, { Schema, Document } from "mongoose";

export interface ICalendarEvent extends Document {
  user: mongoose.Types.ObjectId; // The user who created the event
  matchedUser: mongoose.Types.ObjectId; // The matched user
  title: string; // Event title (e.g., "Call with John")
  start: Date; // Event start time
  end: Date; // Event end time
}

const CalendarEventSchema: Schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    matchedUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICalendarEvent>(
  "CalendarEvent",
  CalendarEventSchema
);
