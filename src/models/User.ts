import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role?: string;
  interests: string[];
  bio: string;
  profilePictureUrl?: string;
  createdAt: Date;
}

const UserSchema: Schema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: false, default: "User" },
    interests: { type: [String], default: [] },
    bio: { type: String, default: "" },
    profilePictureUrl: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
