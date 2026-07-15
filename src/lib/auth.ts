import type { ClientPrincipal } from './types';

export async function fetchPrincipal(): Promise<ClientPrincipal | null> {
  try {
    const res = await fetch('/.auth/me');
    const body = await res.json();
    return body?.clientPrincipal ?? null;
  } catch {
    return null;
  }
}

/** Resolve an avatar URL for a signed-in GitHub principal, mirroring the original setAvatar() logic. */
export function avatarUrl(principal: ClientPrincipal | null): string {
  if (!principal) return '';
  const claims = principal.claims ?? [];
  const claim = claims.find((c) => /avatar_url|picture|urn:github:avatar/i.test(c.typ ?? ''));
  if (claim?.val) return claim.val;
  if (principal.userDetails) {
    return `https://github.com/${encodeURIComponent(principal.userDetails)}.png?size=48`;
  }
  return '';
}
