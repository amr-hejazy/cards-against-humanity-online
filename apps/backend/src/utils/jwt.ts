import jwt, { SignOptions } from "jsonwebtoken";
import env from "../env";

export type AuthTokenPayload = {
  userId: string;
};

export const signAuthToken = (payload: AuthTokenPayload) => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyAuthToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
};
