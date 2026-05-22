import { expect, test } from '@playwright/test';

const SESSION_KEY = 'labelhub.session.v1';

test('Owner 模板 Designer 支持蓝本载入、属性配置和 Renderer 预览', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
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

  await expect(page.getByRole('heading', { name: '模板搭建器（Designer）' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Owner 端导航' })).toBeVisible();

  await page.getByRole('button', { name: '使用商品标题清洗 v3' }).click();
  await expect(page.getByRole('button', { name: '选择 清洗后标题' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 卖点关键词' })).toBeVisible();

  await page.getByRole('button', { name: '选择 清洗后标题' }).click();
  await page.getByRole('tab', { name: '校验' }).click();
  await page.getByLabel('最大长度').fill('42');
  await page.getByLabel('正则').fill('^[^#]+$');
  await page.getByLabel('自定义函数').selectOption('valid_json');
  await expect(page.getByLabel('Schema JSON')).toContainText('"maxLength": 42');
  await expect(page.getByLabel('Schema JSON')).toContainText('"customValidatorKey": "valid_json"');

  await page.getByRole('button', { name: '预览' }).click();
  const preview = page.getByRole('region', { name: 'Renderer 预览' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('textbox', { name: '清洗后标题' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
