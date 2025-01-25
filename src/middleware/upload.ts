import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

import cloudinary from "../utils/cloudinary";

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) =>
    ({
      folder: "relate15/profile_pictures",
      allowed_formats: ["jpg", "jpeg", "png"],
      transformation: [{ width: 500, height: 500, crop: "limit" }],
      // Add resource_type for better compatibility
      resource_type: "auto",
    } as any), // Type assertion to handle type differences
});

const parser = multer({ storage });

export default parser;
