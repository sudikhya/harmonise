import { test, expect } from '@playwright/test';

async function exploreDemo(page: import('@playwright/test').Page) {
  await page.goto('/connect');
  await page.getByRole('button', { name: 'Explore without entering details' }).click();
  await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
}

test.describe('Harmonise connect flow', () => {
  test('landing offers entry paths and demo explores the member shell', async ({ page }) => {
    await page.goto('/connect');
    await expect(page.getByText('Human growth, shared.').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Find support' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Give support' })).toBeVisible();
    await page.getByRole('button', { name: 'Explore without entering details' }).click();
    await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My journey' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My circles' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Support Coaches' })).toBeVisible();
    await expect(page.getByText('Listens · reasons · offers a way forward')).toBeVisible();
    await expect(page.getByText('Communities only appear after you choose to see them.')).toBeVisible();
  });

  test('member entry requires a valid email and 18+ confirmation', async ({ page }) => {
    await page.goto('/connect');
    await page.getByLabel('Your alias').fill('Quiet Fern');
    await page.getByRole('button', { name: 'Find support', exact: true }).click();
    await expect(page.locator('.cx-error')).toContainText('valid email');
    await page.getByLabel('Email').fill('fern@example.com');
    await page.getByRole('button', { name: 'Find support', exact: true }).click();
    await expect(page.locator('.cx-error')).toContainText('18 or older');
  });

  test('crisis words open urgent support without advice or matching', async ({ page }) => {
    await exploreDemo(page);
    await page.getByPlaceholder('Share what is happening, in your own words…').fill('I want to die');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText('Harmonise cannot monitor you or contact emergency services.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find a verified helpline' })).toHaveAttribute(
      'href',
      'https://findahelpline.com/',
    );
    await expect(page.getByText('Preparing a useful next step')).toHaveCount(0);
    await expect(page.getByText('Communities that may understand')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close so I can contact someone' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('shows an honest retry state when the live adviser is unavailable', async ({ page }) => {
    await page.route('**/api/advice', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }),
    );
    await exploreDemo(page);
    await page.getByPlaceholder('Share what is happening, in your own words…').fill('Work has felt overwhelming lately.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('The live adviser could not respond just now. Please try again.')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Communities that may understand')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('demo login shows credentials on screen and enters the member shell', async ({ page }) => {
    await page.goto('/connect');
    await expect(page.getByText('demo@harmonise.app').first()).toBeVisible();
    await expect(page.getByText('harmonise-demo').first()).toBeVisible();
    await page.getByLabel('Login ID').fill('wrong@example.com');
    await page.getByLabel('Login password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.cx-error')).toContainText('do not match');
    await page.getByRole('button', { name: 'Fill demo credentials' }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
    await expect(page.getByText('Demo Member')).toBeVisible();
  });

  test('account signup persists across reload, and logout ends it', async ({ page }) => {
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
    await page.goto('/connect');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Display name').fill('E2E Fern');
    await page.getByLabel('New login ID').fill(email);
    await page.getByLabel('New password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
    await expect(page.getByText('E2E Fern')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
    await expect(page.getByText('E2E Fern')).toBeVisible();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Find support' })).toBeVisible();
    await page.goto('/connect/member');
    await expect(page.getByText('Start at the entrance')).toBeVisible();
    await page.goto('/connect');
    await page.getByLabel('Login ID').fill(email);
    await page.getByLabel('Login password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.cx-error')).toContainText('do not match');
    await page.getByLabel('Login password').fill('e2e-password-1');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Find connection' })).toBeVisible();
  });

  test('member tabs render journey, circles, and coaches', async ({ page }) => {
    await exploreDemo(page);
    await page.getByRole('button', { name: 'My journey' }).click();
    await expect(page.getByText('Point Z', { exact: true })).toBeVisible();
    await expect(page.getByText('AI cannot score wellbeing or define progress automatically.')).toBeVisible();
    await page.getByRole('button', { name: 'My circles' }).click();
    await expect(page.getByText('You haven’t joined any circles yet')).toBeVisible();
    await page.getByRole('button', { name: 'Support Coaches' }).click();
    await expect(page.getByText('Need licensed or clinical care?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request introduction' }).first()).toBeDisabled();
  });
});
