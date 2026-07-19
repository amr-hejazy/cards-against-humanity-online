import { users } from "../../../db/schema";
import { randomUUID } from "node:crypto";
import type { GuestResponseDTO } from "@cah/shared";
import { db } from "../../../db/client";
import { signAuthToken } from "../../../utils/jwt";
import { cleanupOrphanedGuests } from "./cleanup.service";
import { eq } from "drizzle-orm";
import { AppError } from "../../../core/error/errors";
import { ErrorTypes } from "@cah/shared";

/**
 * Creates a new guest user in the database
 * @returns {Promise<GuestResponseDTO>} The newly created guest's information and token
 */
export const createGuest = async (): Promise<GuestResponseDTO> => {
  // 0. Clean up orphaned guests before creating a new one
  await cleanupOrphanedGuests();

  // 1. Create a new guest user in the database
  const [newUser] = await db
    .insert(users)
    .values({
      username: generateRandomUsername(),
      // Remaining fields are null
    })
    .returning();

  // 2. Generate a JWT token for the new user
  const token = signAuthToken({ userId: newUser.id });

  // 3. Return the user information and token in the response
  const GuestUserResponse: GuestResponseDTO = {
    user: {
      id: newUser.id,
      username: newUser.username,
    },
    token,
  };

  return GuestUserResponse;
};

/**
 *  Generates a random username for a guest user
 * @returns {string} A random username in the format "guest_xxxxxxxx"
 */
const generateRandomUsername = (): string => {
  return `guest_${randomUUID().slice(0, 8)}`;
};

export const setUsername = async (
  userId: string,
  newUsername: string,
): Promise<{ id: string; username: string }> => {
  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!currentUser) {
    throw new AppError(401, "User not found", ErrorTypes.UNAUTHORIZED);
  }

  if (currentUser.username === newUsername) {
    throw new AppError(
      400,
      "That's already what you are.",
      ErrorTypes.VALIDATION_ERROR,
    );
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.username, newUsername),
  });

  if (existing) {
    throw new AppError(
      409,
      "Username already taken",
      ErrorTypes.USERNAME_TAKEN,
    );
  }

  const [updated] = await db
    .update(users)
    .set({ username: newUsername })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username });

  return { id: updated.id, username: updated.username };
};
