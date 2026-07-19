import { Request, Response } from "express";
import { createGuest, setUsername } from "./service/guest.service";
import { registerUser, loginUser, getUserById } from "./service/user.service";

export const createGuestHandler = async (_: Request, res: Response) => {
  const result = await createGuest();

  res.status(201).json({
    success: true,
    data: result,
  });
};

export const registerUserHandler = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const result = await registerUser({ username, email, password });

  res.status(201).json({
    success: true,
    data: result,
  });
};

export const loginHandler = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await loginUser({ email, password });

  res.json({
    success: true,
    data: result,
  });
};

export const setUsernameHandler = async (req: Request, res: Response) => {
  const { username } = req.body;
  const auth = res.locals.auth;
  const result = await setUsername(auth.userId, username);

  res.json({
    success: true,
    data: result,
  });
};

export const getMeHandler = async (_: Request, res: Response) => {
  const auth = res.locals.auth;

  const user = await getUserById(auth.userId);

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
    },
  });
};
