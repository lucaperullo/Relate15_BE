import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRATION = 3 * 24 * 60 * 60; // 3 days in seconds
const REFRESH_WINDOW = 30 * 60; // Refresh 30 minutes before expiration

// Extend the Request type to include cookies and userId
declare module "express" {
  interface Request {
    cookies: {
      token?: string;
    };
    userId?: string;
  }
}

const setTokenCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TOKEN_EXPIRATION * 1000,
    path: "/",
  });
};

// Mock user for demonstration purposes
const mockUser = {
  _id: "12345",
  email: "user@example.com",
  name: "John Doe",
  role: "user",
};

// Login function
export const login = async (req: Request, res: Response) => {
  try {
    // ... validate credentials ...

    // Mock user for demonstration purposes
    const user = mockUser;

    const token = jwt.sign(
      {
        userId: user._id,
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRATION,
      },
      JWT_SECRET
    );

    setTokenCookie(res, token);

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Register function
export const register = async (req: Request, res: Response) => {
  try {
    // ... handle user registration ...

    // Mock user for demonstration purposes
    const user = mockUser;

    const token = jwt.sign(
      {
        userId: user._id,
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRATION,
      },
      JWT_SECRET
    );

    setTokenCookie(res, token);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      exp: number;
    };
    req.userId = decoded.userId;

    // Auto-refresh the token if it's within the refresh window
    if (decoded.exp - Math.floor(Date.now() / 1000) < REFRESH_WINDOW) {
      const newToken = jwt.sign(
        {
          userId: decoded.userId,
          exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRATION,
        },
        JWT_SECRET
      );
      setTokenCookie(res, newToken);
    }

    next();
  } catch (error) {
    res.clearCookie("token");
    return res.status(401).json({ message: "Session expired" });
  }
};
