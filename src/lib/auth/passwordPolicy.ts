/**
 * Matches `minPasswordLength` in `@/lib/auth/server`. Kept in a module that does not
 * import the database so login/signup forms can share it.
 */
export const MIN_PASSWORD_LENGTH = 16;
