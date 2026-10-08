import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: number;
  role: "developer" | "recruiter";
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export const COOKIE_NAME = "agentedin_session";

export function signSession(user: AuthUser): string {
  return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { id, role } = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    req.user = { id, role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}
