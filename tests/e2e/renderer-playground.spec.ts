import { expect, test } from '@playwright/test';

test('Renderer 调试台覆盖示例切换、模式切换和答案保留', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/dev/renderer');
  await expect(page.getByRole('heading', { name: 'Renderer 调试台' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '答案 JSON' })).toBeVisible();

  await page.getByRole('button', { name: '问答质量：图片' }).click();
  await expect(page.getByRole('img', { name: '媒体素材' })).toBeVisible();

  await page.getByRole('button', { name: '问答质量：视频' }).click();
  await expect(page.locator('video')).toBeVisible();

  await page.getByRole('button', { name: '问答质量：Markdown' }).click();
  await expect(page.getByText('售后规则')).toBeVisible();

  await page.getByRole('button', { name: '全部物料' }).click();
  await expect(page.getByText('多 Tab 布局')).toBeVisible();
  await page.getByRole('tab', { name: '上传字段' }).click();
  await expect(page.getByText('图片上传示例')).toBeVisible();

  await page.getByRole('button', { name: '商品标题清洗 v3' }).click();
  await page.getByLabel('清洗后标题').fill('超长清洗标题'.repeat(8));
  await expect(page.getByText('48 / 35')).toBeVisible();
  await page.getByLabel('数码配件').click();
  await expect(page.getByLabel('调试输出').getByText('卖点关键词为必填项。')).toBeVisible();
  await page.getByRole('button', { name: '新增标签' }).click();
  await page.getByRole('textbox', { name: '新标签' }).fill('降噪');
  await page.getByRole('textbox', { name: '新标签' }).press('Enter');
  await expect(page.getByText(/"keywords":/)).toBeVisible();

  await page.getByRole('button', { name: '预览' }).click();
  await expect(page.getByLabel('清洗后标题')).toBeEnabled();
  await page.getByRole('button', { name: '复核' }).click();
  await expect(page.getByLabel('清洗后标题')).toBeDisabled();
  await page.getByRole('button', { name: '作答' }).click();

  await page.getByLabel('清洗后标题').fill('轻量降噪蓝牙耳机 Pro Max 黑色');

  await page.getByRole('button', { name: '偏好对比' }).click();
  await page.getByRole('button', { name: '商品标题清洗 v3' }).click();
  await expect(page.getByLabel('清洗后标题')).toHaveValue('轻量降噪蓝牙耳机 Pro Max 黑色');

  expect(consoleErrors).toEqual([]);
});
