/** The name to show other players for someone: their chosen alias if set, else their GitHub login. */
export function displayName(githubLogin: string, alias: string | null | undefined): string {
  return alias && alias.trim() ? alias : githubLogin;
}

// Matches the users.alias nvarchar(50) column in db/schema.ts.
export const MAX_ALIAS_LENGTH = 50;

/**
 * Appends `count` '$' characters to an alias, truncating the base to fit the
 * column length rather than growing past it. Used to bump a colliding alias
 * out of the way (real GitHub usernames always take priority over aliases —
 * see the auto-rename in functions/users.ts) without ever exceeding the
 * column's max length.
 */
export function withDollarSuffix(base: string, count: number): string {
  const suffix = '$'.repeat(count);
  const maxBaseLen = Math.max(0, MAX_ALIAS_LENGTH - suffix.length);
  return (base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base) + suffix;
}
