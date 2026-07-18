import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsMember, loginAs } from '../helpers/login';
import { MEMBER_GITHUB_LOGIN } from '../env';

/**
 * A minimal smoke suite covering the golden paths, not full coverage — see
 * e2e/README.md. Tests run in this file's declared order (playwright.config.ts
 * sets fullyParallel: false / workers: 1) because they share one isolated
 * database: the admin invite in test 2 is a prerequisite for the member tests
 * that follow.
 */

test('a signed-in stranger who is not on the guest list sees the pending gate', async ({ page }) => {
  await loginAs(page, 'e2e-stranger-id', 'e2e-stranger');
  await expect(page.getByRole('heading', { name: 'Almost there' })).toBeVisible();
});

test('admin adds a member', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'League members' })).toBeVisible();

  await page.getByPlaceholder('GitHub username').fill(MEMBER_GITHUB_LOGIN);
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText(MEMBER_GITHUB_LOGIN, { exact: true })).toBeVisible();
});

test('member logs a quick night and it appears on the tracker', async ({ page }) => {
  await loginAsMember(page);
  await expect(page.getByRole('heading', { name: 'Log a night' }).or(page.locator('.section-title', { hasText: 'Log a night' }))).toBeVisible();

  // First-ever night defaults into per-match mode with a blank new-deck field
  // (see NightForm.svelte) — switch to quick mode for this scenario.
  await page.getByRole('button', { name: 'Quick mode' }).click();
  await page.getByPlaceholder('New deck name').fill('E2E Quick Deck');

  await page.locator('.stepper.w button', { hasText: '+' }).click();
  await page.locator('.stepper.w button', { hasText: '+' }).click();

  await page.getByRole('button', { name: 'Log night' }).click();
  await expect(page.getByText('Night logged')).toBeVisible();

  await page.locator('.section-title.toggle', { hasText: 'Nights' }).click();
  await expect(page.locator('.night .deck', { hasText: 'E2E Quick Deck' })).toBeVisible();
});

test('member logs a detailed night with per-match results', async ({ page }) => {
  await loginAsMember(page);

  // The deck picker now offers the member's existing deck as a chip; switch
  // to a second deck via "+ New deck" to keep this scenario independent of
  // the previous test's deck.
  await page.getByRole('button', { name: '+ New deck' }).first().click();
  await page.getByPlaceholder('New deck name').fill('E2E Match Deck');

  // Each add animates in (svelte/transition slide) — wait for the count to
  // settle between clicks so the second click doesn't land mid-transition.
  await page.getByRole('button', { name: '+ Add match' }).click();
  await expect(page.locator('.matchrow')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Add match' }).click();
  await expect(page.locator('.matchrow')).toHaveCount(2);
  // Row 1 defaults to 'W'; set row 2 to a loss.
  await page.locator('.matchrow').nth(1).getByRole('button', { name: 'L', exact: true }).click();

  await page.getByRole('button', { name: 'Log night' }).click();
  await expect(page.getByText('Night logged')).toBeVisible();

  await page.locator('.section-title.toggle', { hasText: 'Nights' }).click();
  await expect(page.locator('.night .deck', { hasText: 'E2E Match Deck' })).toBeVisible();
});

test('the leaderboard renders and includes the member', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { name: 'League leaderboard' })).toBeVisible();
  await expect(page.locator('.login', { hasText: MEMBER_GITHUB_LOGIN })).toBeVisible();
});

test('admin removes the member', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Remove ${MEMBER_GITHUB_LOGIN}` }).click();

  await expect(page.getByText(MEMBER_GITHUB_LOGIN, { exact: true })).not.toBeVisible();
});
