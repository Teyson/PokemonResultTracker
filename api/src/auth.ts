import type { HttpRequest } from '@azure/functions';

export interface ClientPrincipal {
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/** Decode the Static Web Apps client principal from the request headers. */
export function getUser(request: HttpRequest): ClientPrincipal | null {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
