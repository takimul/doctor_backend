import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: string;
  name?: string;
};

export const signToken = (payload: AuthTokenPayload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });

export const verifyToken = (token: string) =>
  jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
