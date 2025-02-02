import mongoose, { Schema, Document } from "mongoose";

export interface IQueue extends Document {
  user: mongoose.Types.ObjectId;
  status: "idle" | "waiting" | "matched";
  matchedWith?: mongoose.Types.ObjectId;
  appointment?: Date; // 🔥 New: Store appointment date if booked
}

const QueueSchema = new Schema<IQueue>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["idle", "waiting", "matched"],
      required: true,
    },
    matchedWith: { type: Schema.Types.ObjectId, ref: "User" },
    appointment: { type: Date }, // 🔥 Optional appointment date
  },
  { timestamps: true }
);

export default mongoose.model<IQueue>("Queue", QueueSchema);
