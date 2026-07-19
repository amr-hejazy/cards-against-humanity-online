import { Router } from "express";
import { asyncHandler } from "../../core/asyncHandler";
import {
  createGuestHandler,
  getMeHandler,
  registerUserHandler,
  loginHandler,
  setUsernameHandler,
} from "./auth.controller";
import requireAuth from "./middleware/requireAuth.middleware";
import { validateRegister, validateLogin, validateSetUsername } from "./middleware/auth.validation";
import { createRateLimiter } from "../../core/rateLimiter";

// Rate limit: 20 requests per 15 min window per IP on auth endpoints
const authLimiter = createRateLimiter({
  keyPrefix: "auth",
  maxRequests: 20,
  windowSeconds: 900,
});

const authRoutes = (router: Router) => {
  router.post("/guest", authLimiter, asyncHandler(createGuestHandler));
  router.post("/register", authLimiter, validateRegister, asyncHandler(registerUserHandler));
  router.post("/login", authLimiter, validateLogin, asyncHandler(loginHandler));
  router.get("/me", asyncHandler(requireAuth), asyncHandler(getMeHandler));
  router.patch(
    "/username",
    asyncHandler(requireAuth),
    validateSetUsername,
    asyncHandler(setUsernameHandler),
  );
};

export { authRoutes };