import { Socket } from "socket.io";
import { AppError } from "./errors";

/**
 *  Emits a standardized error message to a socket.io client. If the error is an instance of AppError, it uses the status, type, and message from the error. Otherwise, it defaults to an internal server error with a generic message.
 * @param socket
 * @param event
 * @param action
 * @param error
 */
export const emitSocketError = (
  socket: Socket,
  event: string,
  action: string,
  error: unknown,
) => {
  if (error instanceof AppError) {
    socket.emit(event, {
      action,
      type: error.type,
      message: error.message,
    });
    return;
  }

  socket.emit(event, {
    action,
    type: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
  });
};
