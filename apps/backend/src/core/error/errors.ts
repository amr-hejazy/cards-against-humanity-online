import { ErrorTypes } from "@cah/shared";
export type ErrorType = (typeof ErrorTypes)[keyof typeof ErrorTypes];
export { ErrorTypes };

/**
 * Custom error class that extends the built-in Error class. It includes additional properties for HTTP status code and error type, allowing for more detailed error handling in the application.
 * @param status - The HTTP status code associated with the error.
 * @param message - A descriptive message explaining the error.
 * @param type - A specific error type from the ErrorTypes collection, defaulting to "APP_ERROR" if not provided.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public type: ErrorType | "APP_ERROR" = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}
