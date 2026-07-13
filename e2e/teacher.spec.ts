// Tests for: teacher flow (e2e) — dashboard -> classroom -> grade an assignment.
// Requires the app running locally with the seeded demo database and the
// teacher account documented in README.md (Alice Thompson).
import { test, expect } from '@playwright/test';

const TEACHER = { email: 'alice.thompson@university.edu', password: 'TeacherPass123!' };

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/School Email Address/i).fill(TEACHER.email);
  await page.getByLabel(/Password/i).fill(TEACHER.password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/teacher/, { timeout: 10_000 });
});

test.describe('Teacher dashboard flow', () => {
  test('opening a classroom shows its class detail page', async ({ page }) => {
    const classCards = page.locator('h3.group-hover\\:text-primary');
    const count = await classCards.count();
    test.skip(count === 0, 'This teacher account has no classes');

    await classCards.first().click();
    await expect(page).toHaveURL(/\/dashboard\/teacher\/classes\/.+/);
  });

  test('grading a pending submission posts a grade', async ({ page }) => {
    const gradeButtons = page.getByRole('button', { name: 'Grade', exact: true });
    const count = await gradeButtons.count();
    test.skip(count === 0, 'No pending submissions to grade for this teacher account');

    await gradeButtons.first().click();

    // Fill every rubric score input with its max allowed points.
    const scoreInputs = page.locator('#grading-form input[type="number"]');
    const inputCount = await scoreInputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = scoreInputs.nth(i);
      const max = await input.getAttribute('max');
      await input.fill(max ?? '100');
    }

    await page.locator('#grading-form textarea').fill('Great work overall — e2e test feedback.');
    await page.getByRole('button', { name: 'Submit Grade' }).click();

    await expect(page.getByText('Grade posted successfully!')).toBeVisible({ timeout: 10_000 });
  });
});
