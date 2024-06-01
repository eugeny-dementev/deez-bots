import { Timestampt, UserRole } from "./types.js";

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_SECOND_MS = 1 * 1000;

export const USER_LIMITS: Record<UserRole, Timestampt> = {
  [UserRole.admin]: ONE_SECOND_MS,
  [UserRole.publisher]: FIVE_MINUTES_MS,
  [UserRole.subscriber]: ONE_HOUR_MS,
};

