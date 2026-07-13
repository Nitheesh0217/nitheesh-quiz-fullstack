// Tests for: admin flow (e2e) — suspend/reactivate a user, register a school.
// Requires the app running locally with the seeded demo database and the
// admin account documented in README.md (Sarah Chen).
import { test, expect } from '@playwright/test';

const ADMIN = { email: 'sarah.chen@university.edu', password: 'AdminPass123!' };

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/School Email Address/i).fill(ADMIN.email);
  await page.getByLabel(/Password/i).fill(ADMIN.password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/admin/, { timeout: 10_000 });
});

test.describe('Admin dashboard flow', () => {
  test('suspending then reactivating a user updates their status', async ({ page }) => {
    // Pick the first row whose status is currently "Active" so this test is
    // repeatable regardless of what a previous run left behind.
    const activeRow = page.locator('tbody tr', { has: page.getByText('Active') }).first();
    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount === 0, 'No users in the register to test suspension on');

    await activeRow.locator('button').last().click();
    await page.getByText('Suspend User').click();
    await expect(activeRow.getByText('Suspended')).toBeVisible({ timeout: 10_000 });

    await activeRow.locator('button').last().click();
    await page.getByText('Reactivate User').click();
    await expect(activeRow.getByText('Active')).toBeVisible({ timeout: 10_000 });
  });

  test('registering a new school shows it in the schools list', async ({ page }) => {
    const schoolName = `E2E Test Academy ${Date.now()}`;

    await page.getByRole('button', { name: 'Register School' }).click();
    await page.getByLabel('School Name').fill(schoolName);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText(`Successfully registered ${schoolName}!`)).toBeVisible({ timeout: 10_000 });
  });
});
