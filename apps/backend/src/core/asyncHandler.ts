import { RequestHandler, NextFunction } from "express";

/**
 * Wraps an async express route handler or middleware with a try-catch block.
 * Use this to avoid having to write try-catch blocks in every async route handler/middleware.
 *
 * @param fn An async express route handler or middleware
 * @returns A new async express route handler or middleware that catches any errors thrown by the original handler/middleware
 */

export const asyncHandler =
  <
    P,
    ResBody,
    ReqBody,
    ReqQuery,
    LocalsObj extends Record<string, any> = Record<string, any>
  >(
    fun: (
      ...args: Parameters<
        RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>
      >
    ) => void
  ) =>
  (
    ...args: Parameters<
      RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>
    >
  ) => {
    const next = args[args.length - 1];
    Promise.resolve(fun(...args)).catch(next as NextFunction);
  };
