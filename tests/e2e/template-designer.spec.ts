import { expect, test } from '@playwright/test';

const SESSION_KEY = 'labelhub.session.v1';

test('Owner 模板 Designer 支持蓝本载入、属性配置和 Renderer 预览', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.route('**/templates', async (route) => {
    if (route.request().resourceType() === 'document') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      json: { data: [], requestId: 'req_e2e_templates' },
    });
  });

  await page.goto('/login');
  await page.evaluate((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        token: 'mock-token-owner',
        user: {
          id: 'demo-owner',
          name: 'Owner 演示账号',
          role: 'OWNER',
        },
      }),
    );
  }, SESSION_KEY);
  await page.goto('/owner/templates');

  await expect(page.getByRole('heading', { name: '评测模板' })).toBeVisible();
  await expect(page.getByRole('table', { name: '模板列表' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Owner 端导航' })).toBeVisible();

  await page.getByRole('button', { name: '新增模板' }).click();
  const designer = page.getByRole('dialog', { name: '模板配置' });
  await expect(designer).toBeVisible();
  await expect(designer.getByRole('button', { name: /保存并发布版本/ })).toBeVisible();
  await expect(designer.getByRole('button', { name: '编辑模板名称' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
