import jwt from "jsonwebtoken";
import { IUser } from "../models/User";
import dotenv from "dotenv";
import { compare, hash } from "bcryptjs";

dotenv.config();

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

export const hashPassword = async (password: string): Promise<string> => {
  return await hash(password, SALT_ROUNDS);
};

export const comparePasswords = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return await compare(password, hash);
};

export const generateToken = (user: IUser): string => {
  const payload = { id: user._id, email: user.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};
