import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default("1d"),
  LOGS_PATH: z.string().min(1).default("logs"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Log validation errors and fail-fast so the process doesn't start with incomplete config
  // Format errors for readability
  // eslint-disable-next-line no-console
  console.error(
    "Invalid or missing environment variables:",
    parsed.error.format(),
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

export const isDev = env.NODE_ENV === "development";

export default env;
