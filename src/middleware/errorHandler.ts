// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { Error } from "mongoose";
import { ZodError } from "zod"; // Add if using Zod for validation
import logger from "../utils/logger"; // Assuming you have a logger

interface AppError extends Error {
  statusCode?: number;
  code?: number;
  errors?: Record<string, any>;
  kind?: string;
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const errorId = Math.random().toString(36).substring(2, 9);
  const statusCode = err.statusCode || 500;
  const path = req.originalUrl;
  const method = req.method;

  // Logging with more context
  logger.error({
    errorId,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    type: err.name,
    path,
    method,
    statusCode,
    //@ts-ignore
    user: req.user?.id || "anonymous",
    body: process.env.NODE_ENV === "development" ? req.body : undefined,
    query: process.env.NODE_ENV === "development" ? req.query : undefined,
    headers: {
      referrer: req.headers.referer,
      origin: req.headers.origin,
      "user-agent": req.headers["user-agent"],
    },
  });

  // Handle different error types
  let errorResponse = {
    success: false,
    error: {
      code: statusCode,
      message: "Something went wrong",
      errorId,
      timestamp,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
        details: err.errors,
      }),
    },
  };

  // Handle specific error types
  if (err instanceof Error.ValidationError) {
    errorResponse.error.message = "Validation Error";
    errorResponse.error.code = 400;
    const messages = Object.values(err.errors).map((e) => e.message);
    errorResponse.error.details = messages;
  } else if (err instanceof Error.CastError) {
    errorResponse.error.message = "Invalid Resource ID";
    errorResponse.error.code = 400;
  } else if (err instanceof ZodError) {
    // If using Zod
    errorResponse.error.message = "Validation Error";
    errorResponse.error.code = 400;
    errorResponse.error.details = err.errors;
  } else if (err.name === "JsonWebTokenError") {
    errorResponse.error.message = "Invalid Token";
    errorResponse.error.code = 401;
  } else if (err.name === "TokenExpiredError") {
    errorResponse.error.message = "Token Expired";
    errorResponse.error.code = 401;
  } else if (err.code === 11000) {
    // MongoDB duplicate key
    errorResponse.error.message = "Duplicate Field Value";
    errorResponse.error.code = 409;
    //@ts-ignore
    const field = Object.keys(err.keyValue || {})[0];
    if (field) {
      errorResponse.error.details = { [field]: `${field} must be unique` };
    }
  }

  // Security headers
  res.setHeader("X-Error-ID", errorId);
  res.setHeader(
    "X-Error-Message",
    encodeURIComponent(errorResponse.error.message)
  );

  // Send response
  res.status(errorResponse.error.code).json(errorResponse);
};

export default errorHandler;
