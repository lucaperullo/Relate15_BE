import { Request, Response, NextFunction } from "express";
import Notifications from "../models/Notifications";

export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error("Authentication required");

    const notifications = await Notifications.find({ user: userId })
      .sort("-createdAt")
      .limit(50);

    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

export const markNotificationsAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) throw new Error("Authentication required");

    const notification = await Notifications.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { read: true },
      { new: true }
    );

    res.status(200).json(notification);
  } catch (error) {
    next(error);
  }
};
