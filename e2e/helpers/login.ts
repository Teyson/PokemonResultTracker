import type { Page } from '@playwright/test';
import { ADMIN_USER_ID, ADMIN_GITHUB_LOGIN, MEMBER_USER_ID, MEMBER_GITHUB_LOGIN } from '../env';

/**
 * Signs in through the SWA CLI's emulated GitHub login at /.auth/login/github.
 * The form only persists its fields on a genuine `keyup` DOM event (see
 * CLAUDE.md's "Local environment quirks" and README's "Local development"
 * section) — Playwright's `fill()` sets the value via CDP without firing real
 * per-character key events and silently falls back to a cached-or-random
 * identity. `pressSequentially` dispatches real keystrokes instead, so the
 * identity carries through to `/.auth/me` and every `/api/*` call.
 */
export async function loginAs(page: Page, userId: string, login: string) {
  await page.goto('/login');
  // The emulator pre-fills both fields with a random default identity —
  // clear them first, or pressSequentially inserts at the cursor position
  // into the existing value instead of replacing it.
  const userIdField = page.getByPlaceholder('Choose a user ID');
  await userIdField.fill('');
  await userIdField.pressSequentially(userId);
  const usernameField = page.getByPlaceholder('Choose a username');
  await usernameField.fill('');
  await usernameField.pressSequentially(login);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  // The main page fires its initial /api/nights + /api/decks fetches after
  // mount; NightForm's own $effect resets its in-progress state (including
  // any match rows or typed deck name) whenever the `nights` prop reference
  // changes. Waiting for those requests to settle before a test starts
  // filling the form avoids a race where that reset clobbers input made
  // between page load and the fetch resolving.
  await page.waitForLoadState('networkidle');
}

export function loginAsAdmin(page: Page) {
  return loginAs(page, ADMIN_USER_ID, ADMIN_GITHUB_LOGIN);
}

export function loginAsMember(page: Page) {
  return loginAs(page, MEMBER_USER_ID, MEMBER_GITHUB_LOGIN);
}
