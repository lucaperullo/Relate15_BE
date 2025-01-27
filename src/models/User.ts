// src/models/User.ts
import mongoose, { Document, Schema } from "mongoose";
export interface IUserPayload {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role?: string;
  interests: string[];
  bio: string;
  profilePictureUrl?: string;
  createdAt: Date;
  matches: mongoose.Types.ObjectId[]; // Add matches array
  matchCount?: Map<string, number>; // Track match counts with specific users
}

const UserSchema: Schema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "User" },
    interests: { type: [String], default: [] },
    bio: { type: String, default: "" },
    profilePictureUrl: { type: String },
    matches: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    matchCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
