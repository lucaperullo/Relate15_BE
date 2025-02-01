import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User";

export interface IQueue extends Document {
  user: IUser["id"];
  status: "waiting" | "matched";
  matchedWith?: IUser["id"];
  createdAt: Date;
}

const QueueSchema: Schema = new Schema<IQueue>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: { type: String, enum: ["waiting", "matched"], default: "waiting" },
    matchedWith: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model<IQueue>("Queue", QueueSchema);
