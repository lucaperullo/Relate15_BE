import mongoose, { Document, Schema } from "mongoose";

export interface IMessage {
  sender: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  createdAt: Date;
}

export interface IChat extends Document {
  participants: mongoose.Types.ObjectId[]; // User IDs of both participants
  messages: IMessage[];
  lastMessageAt: Date; // Useful for sorting conversations
}

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { id: false } // Prevents unnecessary ObjectId for each message
);

const ChatSchema = new Schema<IChat>(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    messages: [MessageSchema], // Embed messages within conversation
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IChat>("Chat", ChatSchema);
