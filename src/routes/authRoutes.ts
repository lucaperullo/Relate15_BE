// src/routes/authRoutes.ts
import express from "express";
import { register, login, verify } from "../controllers/authController";
import parser from "../middleware/upload";
import { asyncHandler } from "../utils/asyncHandler";
import { body } from "express-validator";

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: email
 *         type: string
 *         required: true
 *       - in: formData
 *         name: password
 *         type: string
 *         required: true
 *       - in: formData
 *         name: name
 *         type: string
 *         required: true
 *       - in: formData
 *         name: role
 *         type: string
 *         required: true
 *       - in: formData
 *         name: interests
 *         type: string
 *       - in: formData
 *         name: bio
 *         type: string
 *       - in: formData
 *         name: profilePicture
 *         type: file
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post(
  "/register",
  parser.single("profilePicture"),
  [
    body("email").isEmail().withMessage("Please provide a valid email."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters."),
    body("name").notEmpty().withMessage("Name is required."),
    body("role").notEmpty().withMessage("Role is required."),
  ],
  //@ts-ignore
  asyncHandler(register)
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: credentials
 *         schema:
 *           type: object
 *           required:
 *             - email
 *             - password
 *           properties:
 *             email:
 *               type: string
 *             password:
 *               type: string
 *     responses:
 *       200:
 *         description: Logged in successfully
 */
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please provide a valid email."),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  //@ts-ignore
  asyncHandler(login)
);

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify user session
 *     description: Check if the user's session is valid and return user data
 *     responses:
 *       200:
 *         description: Session verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Invalid or expired token
 */
//@ts-ignore
router.get("/verify", asyncHandler(verify));

export default router;
