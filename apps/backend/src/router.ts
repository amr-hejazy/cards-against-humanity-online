import { Router } from "express";
import { authRoutes } from "./features/auth/auth.routes";
import packsController from "./features/packs/packs.controller";

export const authRouter = (): Router => {
  const router = Router();
  authRoutes(router);
  return router;
};

export const packsRouter = (): Router => {
  return packsController as Router;
};
