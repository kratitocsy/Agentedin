import { z } from "zod";

export const petName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(24, "Name must be at most 24 characters")
  .regex(/^[\p{L}\p{M}\p{N} _-]+$/u, "Use letters, numbers, spaces, - or _ only");

export const avatarSeed = z.string().regex(/^[0-9a-f]{16}$/, "Invalid avatar");
