/** The name to show other players for someone: their chosen alias if set, else their GitHub login. */
export function displayName(githubLogin: string, alias: string | null | undefined): string {
  return alias && alias.trim() ? alias : githubLogin;
}
