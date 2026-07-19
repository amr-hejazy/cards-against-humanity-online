import cors from "cors";
import compression from "compression";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { authRouter, packsRouter } from "./router";
import logger from "./core/logger";
import morgan from "morgan";
import { env, isDev } from "./env";
import { formatApiError } from "./core/error/apiError";

const app = express();

// Trust proxy — Render sits behind a load balancer; needed for real client IP
// (rate limiting, correct X-Forwarded-* handling)
app.set("trust proxy", 1);

// Use helmet to secure HTTP headers
// https://expressjs.com/en/advanced/best-practice-security.html#use-helmet
app.use(helmet());

// Disable the `X-Powered-By` HTTP header for security
// https://expressjs.com/en/advanced/best-practice-security.html#reduce-fingerprinting
app.disable("x-powered-by");

// Use compression middleware to compress HTTP responses
// https://stackoverflow.com/a/58813283/14174934
app.use(compression());

// Enable CORS with configured origin(s)
// https://stackoverflow.com/a/61988727/14174934
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, "")),
  }),
);

// Parse JSON and url-encoded query with request size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Health check endpoint (used by frontend cold-start loader + uptime probes)
app.get("/ping", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Configure HTTP request logger middleware
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.http(message) },
    skip: () => isDev,
  }),
);

// Mount API routes
app.use("/auth", authRouter());
app.use("/packs", packsRouter());

// 404 Not Found handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: {
      type: "NOT_FOUND",
      message: "Not found",
    },
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.log("error", `Unhandled error: ${String(err)}`);

  const { status, body } = formatApiError(err);
  const payload: any = body;
  if (isDev && err && err.stack) payload.error.stack = err.stack;

  res.status(status).json(payload);
});

export default app;
