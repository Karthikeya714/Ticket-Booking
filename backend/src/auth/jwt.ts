import jwt from "jsonwebtoken";
import { env } from "../env";
import type { Role } from "@prisma/client";

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
