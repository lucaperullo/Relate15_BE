import mongoose, { Schema, Document } from "mongoose";

export interface IQueue extends Document {
  user: mongoose.Types.ObjectId;
  status: "idle" | "waiting" | "matched" | "booked";
  matchedWith?: mongoose.Types.ObjectId;
  appointment?: Date; // Saved appointment date once booked
  confirmedDate?: Date; // The provisional date submitted by the user
}

const QueueSchema = new Schema<IQueue>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["idle", "waiting", "matched", "booked"],
      required: true,
    },
    matchedWith: { type: Schema.Types.ObjectId, ref: "User" },
    appointment: { type: Date }, // 🔥 Optional appointment date
    confirmedDate: { type: Date }, // New field for storing confirmed date
  },
  { timestamps: true }
);

export default mongoose.model<IQueue>("Queue", QueueSchema);
