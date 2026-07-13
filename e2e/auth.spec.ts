// Tests for: full login flow (e2e), against the demo accounts documented
// in README.md. Requires the app running locally at localhost:3000/4000
// with the seeded demo database.
import { test, expect } from '@playwright/test';

const ACCOUNTS = {
  student: { email: 'alex.johnson@university.edu', password: 'StudentPass123!', dashboard: '/dashboard/student' },
  teacher: { email: 'alice.thompson@university.edu', password: 'TeacherPass123!', dashboard: '/dashboard/teacher' },
  admin: { email: 'sarah.chen@university.edu', password: 'AdminPass123!', dashboard: '/dashboard/admin' },
};

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/School Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();
}

test.describe('Authentication', () => {
  for (const [role, account] of Object.entries(ACCOUNTS)) {
    test(`${role} can log in and lands on the ${role} dashboard`, async ({ page }) => {
      await login(page, account.email, account.password);
      await expect(page).toHaveURL(new RegExp(account.dashboard), { timeout: 10_000 });
    });
  }

  test('shows an error toast for invalid credentials', async ({ page }) => {
    await login(page, ACCOUNTS.student.email, 'wrong-password-here');
    await expect(page.getByText(/Invalid credentials|Failed to sign in/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('client-side validation blocks submission with an empty form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText('Invalid school email address')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logging out returns to the login page', async ({ page }) => {
    await login(page, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password);
    await expect(page).toHaveURL(new RegExp(ACCOUNTS.teacher.dashboard), { timeout: 10_000 });

    // Session cookie is httpOnly, so we log out via the API the same way
    // the app's own logout button does, then confirm we're gated again.
    await page.request.post('/api/auth/logout');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
