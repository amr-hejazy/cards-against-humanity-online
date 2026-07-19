import { AppError } from "../error/errors";

export type ApiErrorShape = {
  type: string;
  message: string;
};

/**
 * Formats an error into a standardized API error response shape. If the error is an instance of AppError, it uses the status, type, and message from the error. Otherwise, it defaults to a 500 Internal Server Error with a generic message.
 * @param error
 * @returns An object containing the HTTP status code and a body with success set to false and an error object containing the type and message.
 */
export const formatApiError = (error: unknown) => {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: {
          type: error.type,
          message: error.message,
        } satisfies ApiErrorShape,
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: {
        type: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      } satisfies ApiErrorShape,
    },
  };
};
