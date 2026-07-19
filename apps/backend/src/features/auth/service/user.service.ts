import { users } from "../../../db/schema";
import type { UserDTO, UserResponseDTO } from "@cah/shared";
import { db } from "../../../db/client";
import { signAuthToken } from "../../../utils/jwt";
import { eq, or } from "drizzle-orm";
import { AppError, ErrorTypes } from "../../../core/error/errors";
import bcrypt from "bcryptjs";
import { LoginParams, RegisterUserParams } from "../auth.types";

/**
 * Registers a new user in the database
 * @param {RegisterUserParams} params - The registration parameters including username, email, and password
 * @returns The newly registered user's information and token
 */
export const registerUser = async ({
  username,
  email,
  password,
}: RegisterUserParams) => {
  // 1. Check if the username or email already exists in the database
  const existingUser = await db.query.users.findFirst({
    where: (user) => or(eq(user.username, username), eq(user.email, email)),
  });

  if (existingUser) {
    throw new AppError(
      409,
      "User already exists",
      ErrorTypes.USER_ALREADY_EXISTS,
    );
  }

  // 2. Hash the password
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. Create a new user in the database
  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
    })
    .returning();

  // 4. Generate a JWT token for the new user

  const token = signAuthToken({ userId: newUser.id });

  // 5. Return the user information and token in the response
  const userResponse: UserResponseDTO = {
    user: {
      id: newUser.id,
      username: newUser.username,
      ...(newUser.email && { email: newUser.email }),
    },
    token,
  };
  return userResponse;
};

/**
 * Logs in a user by verifying their email and password
 * @param {LoginParams} params - The login parameters including email and password
 * @returns The authenticated user's information and token
 */
export const loginUser = async ({ email, password }: LoginParams) => {
  // 1. Fetch the user by email from the database
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    throw new AppError(
      401,
      "Invalid credentials",
      ErrorTypes.INVALID_CREDENTIALS,
    );
  }
  // 2. Compare the provided password with the stored password hash
  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    throw new AppError(
      401,
      "Invalid credentials",
      ErrorTypes.INVALID_CREDENTIALS,
    );
  }
  // 3. Generate a JWT token for the authenticated user
  const token = signAuthToken({ userId: user.id });

  // 4. Return the user information and token in the response
  const userResponse: UserResponseDTO = {
    user: {
      id: user.id,
      username: user.username,
      ...(user.email && { email: user.email }),
    },
    token,
  };
  return userResponse;
};

/**
 * Fetches a user by their userId from the database
 * @param userId
 * @returns The user information for the given userId
 */
export const getUserById = async (userId: string) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AppError(404, "User not found", ErrorTypes.USER_NOT_FOUND);
  }
  const userDTO: UserDTO = {
    id: user.id,
    username: user.username,
    ...(user.email && { email: user.email }),
  };

  return userDTO;
};
