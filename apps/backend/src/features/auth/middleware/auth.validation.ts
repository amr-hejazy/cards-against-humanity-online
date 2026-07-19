import { z } from "zod";
import { validate } from "../../../core/validate";

export const registerSchema = z.object({
  username: z
    .string("Username must be a string")
    .min(3, "Username must be at least 3 characters long")
    .max(30, "Username must be at most 30 characters long"),
  email: z.email("Please provide a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export const loginSchema = z.object({
  email: z.email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const validateRegister = validate(registerSchema);
export const validateLogin = validate(loginSchema, {
  errorMessage: "Invalid credentials",
});

const setUsernameSchema = z.object({
  username: z
    .string("Username must be a string")
    .min(3, "Username must be at least 3 characters long")
    .max(30, "Username must be at most 30 characters long"),
});

export const validateSetUsername = validate(setUsernameSchema);
