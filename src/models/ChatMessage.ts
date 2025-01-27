import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "./User";

export interface IChatMessage extends Document {
  sender: IUser["_id"];
  receiver: IUser["_id"];
  content: string;
  read: boolean;
  createdAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
