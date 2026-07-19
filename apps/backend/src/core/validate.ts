import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError, ErrorTypes } from "./error/errors";

type ValidateOptions = {
  errorMessage?: string;
};

/**
 * Validates the request body against a Zod schema and handles validation errors.
 * @param schema - The Zod schema to validate against
 * @param opts - Optional options, including a custom error message
 */
export const validate = (schema: z.ZodSchema, opts?: ValidateOptions) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      // if a custom error message is provided in opts, use it; otherwise, use the first validation error message from Zod
      const message = opts?.errorMessage ?? parsed.error.issues[0].message;

      throw new AppError(400, message, ErrorTypes.VALIDATION_ERROR);
    }
    req.body = parsed.data;
    next();
  };
};
