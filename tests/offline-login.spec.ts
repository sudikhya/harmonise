import { test, expect } from '@playwright/test';

/**
 * Static hosting has no API routes (every /api/** call 404s). The demo login
 * must still work there, offline, while everything else degrades honestly.
 */
test.describe('Static hosting without an API', () => {
  test('demo login works offline and features degrade honestly', async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }),
    );
    await page.goto('/connect');
    await expect(page.getByText('demo@harmonise.app').first()).toBeVisible();
    await page.getByRole('button', { name: 'Fill demo credentials' }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Find connection', exact: true })).toBeVisible();
    await expect(page.getByText('Demo Member')).toBeVisible();
    await page.getByRole('button', { name: 'My circles', exact: true }).click();
    await expect(page.getByText('You haven’t joined any circles yet')).toBeVisible();
    await page.getByRole('button', { name: 'Find connection', exact: true }).click();
    await page.getByPlaceholder('Share what is happening, in your own words…').fill('Work has felt overwhelming lately.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('The live adviser could not respond just now. Please try again.')).toBeVisible();
  });

  test('wrong credentials stay out even offline', async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' }),
    );
    await page.goto('/connect');
    await page.getByLabel('Login ID').fill('someone@example.com');
    await page.getByLabel('Login password').fill('not-the-demo-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.cx-error')).toContainText('could not be reached');
    await expect(page.getByRole('button', { name: 'Find connection', exact: true })).toHaveCount(0);
  });
});
