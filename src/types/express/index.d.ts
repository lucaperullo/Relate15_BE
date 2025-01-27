// src/types/express/index.d.ts
import { IUser } from "../../models/User";
import { IUserPayload } from "../../models/User"; // Adjust the path as necessary

declare global {
  namespace Express {
    interface Request {
      user?: IUserPayload;
    }
  }
}
// src/types/express/index.d.ts
