// src/types/express/index.d.ts
import { IUser } from "../../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: IUserPayload;
    }
  }
}

export interface IUserPayload {
  id: string;
  email: string;
}
