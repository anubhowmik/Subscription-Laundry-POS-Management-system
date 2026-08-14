import { User } from "@prisma/client";

/** Strips the password hash before a user record is ever sent in an API response. */
export function toSafeUser(user: User) {
  const { passwordHash, ...safe } = user;
  return safe;
}
