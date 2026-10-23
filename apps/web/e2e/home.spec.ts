import { expect, test } from '@playwright/test';

test('T01: home page shows the brand and the six property types', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'MoveIn' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(6);
});
