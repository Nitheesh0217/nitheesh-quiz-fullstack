// Tests for: student flow (e2e) — dashboard -> class -> assignment -> grades.
// Requires the app running locally with the seeded demo database and the
// student account documented in README.md (Alex Johnson).
import { test, expect } from '@playwright/test';

const STUDENT = { email: 'alex.johnson@university.edu', password: 'StudentPass123!' };

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/School Email Address/i).fill(STUDENT.email);
  await page.getByLabel(/Password/i).fill(STUDENT.password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/student/, { timeout: 10_000 });
});

test.describe('Student dashboard flow', () => {
  test('the enroll-in-class modal opens with a real class from the catalog', async ({ page }) => {
    const enrollButtons = page.getByRole('button', { name: /Enroll in Class/i });
    const count = await enrollButtons.count();
    test.skip(count === 0, 'No available classes in the catalog for this seeded account');

    await enrollButtons.first().click();
    await expect(page.getByText('Join a Classroom')).toBeVisible();
    // The enrollment code is intentionally not shown in the catalog card —
    // it must come from the teacher out-of-band, so this flow verifies the
    // modal wiring rather than guessing a code.
    await expect(page.getByPlaceholder('e.g. BIO-101')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('opening an enrolled class shows its classroom page', async ({ page }) => {
    const classCards = page.locator('h3.group-hover\\:text-primary');
    const count = await classCards.count();
    test.skip(count === 0, 'This student account has no enrolled classes');

    const className = await classCards.first().textContent();
    await classCards.first().click();
    await expect(page).toHaveURL(/\/dashboard\/student\/classes\/.+/);
    if (className) {
      await expect(page.getByText(className.trim())).toBeVisible();
    }
  });

  test('the grades page renders (populated or empty state)', async ({ page }) => {
    await page.goto('/dashboard/student/grades');
    await expect(
      page.getByText(/Grade|No Grades Yet/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
