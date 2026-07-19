import { describe, it, expect } from "vitest";
import {
  createGuest,
  setUsername,
} from "../../../src/features/auth/service/guest.service";
import {
  registerUser,
  loginUser,
  getUserById,
} from "../../../src/features/auth/service/user.service";
import { verifyAuthToken } from "../../../src/utils/jwt";
import { AppError, ErrorTypes } from "../../../src/core/error/errors";

describe("Guest Auth", () => {
  it("creates guest user and returns valid JWT", async () => {
    const result = await createGuest();

    expect(result.user).toBeDefined();
    expect(result.user.id).toBeTruthy();
    expect(result.user.username).toMatch(/^guest_/);
    expect(result.token).toBeTruthy();

    const payload = verifyAuthToken(result.token);
    expect(payload.userId).toBe(result.user.id);
  });

  it("creates unique guest usernames", async () => {
    const [a, b] = await Promise.all([createGuest(), createGuest()]);
    expect(a.user.username).not.toBe(b.user.username);
  });
});

describe("User Registration", () => {
  it("registers new user and returns JWT", async () => {
    const username = `reg_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@test.com`;

    const result = await registerUser({
      username,
      email,
      password: "TestPass123!",
    });

    expect(result.user.username).toBe(username);
    expect(result.user.email).toBe(email);
    expect(result.token).toBeTruthy();

    const payload = verifyAuthToken(result.token);
    expect(payload.userId).toBe(result.user.id);
  });

  it("rejects duplicate username", async () => {
    const username = `dupuser_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@test.com`;

    await registerUser({ username, email, password: "Pass1!" });

    const err = await registerUser({
      username,
      email: `other_${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: "Pass2!",
    }).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.USER_ALREADY_EXISTS);
  });

  it("rejects duplicate email", async () => {
    const username = `dupemail_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@test.com`;

    await registerUser({ username, email, password: "Pass1!" });

    const err = await registerUser({
      username: `other_${Math.random().toString(36).slice(2, 8)}`,
      email,
      password: "Pass2!",
    }).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.USER_ALREADY_EXISTS);
  });
});

describe("User Login", () => {
  it("logs in with correct credentials", async () => {
    const username = `loginok_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@test.com`;
    const password = "MyPass789!";

    await registerUser({ username, email, password });

    const result = await loginUser({ email, password });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(email);

    const payload = verifyAuthToken(result.token);
    expect(payload.userId).toBe(result.user.id);
  });

  it("rejects wrong password", async () => {
    const username = `loginbadpw_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@test.com`;

    await registerUser({ username, email, password: "RealPass1!" });

    const err = await loginUser({
      email,
      password: "WrongPass!",
    }).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_CREDENTIALS);
  });

  it("rejects nonexistent email", async () => {
    const err = await loginUser({
      email: "nobody@nowhere.com",
      password: "Whatever1!",
    }).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_CREDENTIALS);
  });
});

describe("getUserById", () => {
  it("returns user for valid id", async () => {
    const { user } = await createGuest();
    const fetched = await getUserById(user.id);
    expect(fetched.id).toBe(user.id);
    expect(fetched.username).toBe(user.username);
  });

  it("throws for nonexistent id", async () => {
    const err = await getUserById("00000000-0000-0000-0000-000000000000").catch(
      (e: any) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.USER_NOT_FOUND);
  });
});

describe("setUsername", () => {
  it("sets a new custom username", async () => {
    const { user } = await createGuest();
    const newName = `custom_${Math.random().toString(36).slice(2, 8)}`;
    const result = await setUsername(user.id, newName);

    expect(result.username).toBe(newName);
  });

  it("rejects taken username", async () => {
    const { user: userA } = await createGuest();
    const { user: userB } = await createGuest();

    const takenName = `taken_${Math.random().toString(36).slice(2, 8)}`;
    await setUsername(userA.id, takenName);

    const err = await setUsername(userB.id, takenName).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.USERNAME_TAKEN);
  });

  it("rejects same as current username", async () => {
    const { user } = await createGuest();
    const err = await setUsername(user.id, user.username).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe("That's already what you are.");
  });
});
