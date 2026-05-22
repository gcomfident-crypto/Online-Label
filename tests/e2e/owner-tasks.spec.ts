import { expect, test } from '@playwright/test';

const baseTask = {
  id: 'task_draft',
  title: '商品标题清洗 v3 · 抖音电商',
  description: '清洗商品标题并补充关键词。',
  richTextInstruction: '请保留核心商品信息。',
  tags: ['电商', '文本清洗', '中文'],
  rewardRule: '0.30 元 / 条',
  quota: 5000,
  deadline: '2026-06-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '电商相关性 v2',
  status: 'DRAFT',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '商品清洗 · v3',
    schemaVersion: 'r12',
    status: 'PUBLISHED',
  },
  createdById: 'user_owner_zhang_man',
  itemCount: 2340,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

test('Owner 任务管理支持发布抽屉和状态流转', async ({ page }) => {
  const consoleErrors: string[] = [];
  let currentTask = { ...baseTask };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.route('**/tasks?*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          currentTask,
          { ...baseTask, id: 'task_paused', title: '短视频脚本对齐评测', status: 'PAUSED' },
          { ...baseTask, id: 'task_ended', title: 'AIGC 图文质量打分', status: 'ENDED' },
        ],
        requestId: 'req_e2e_tasks',
      },
    });
  });

  await page.route('**/tasks/task_draft', async (route) => {
    const patch = JSON.parse(route.request().postData() ?? '{}') as Partial<typeof baseTask>;
    currentTask = { ...currentTask, ...patch };

    await route.fulfill({
      contentType: 'application/json',
      json: { data: currentTask, requestId: 'req_e2e_update_task' },
    });
  });

  await page.route('**/tasks/task_draft/status', async (route) => {
    const patch = JSON.parse(route.request().postData() ?? '{}') as { status?: string };
    currentTask = { ...currentTask, status: patch.status ?? currentTask.status };

    await route.fulfill({
      contentType: 'application/json',
      json: { data: currentTask, requestId: 'req_e2e_update_status' },
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /Owner 演示账号/ }).click();
  await page.goto('/owner/tasks');

  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();
  await expect(page.getByRole('table', { name: '任务列表' })).toBeVisible();
  await expect(page.getByPlaceholder('搜索任务名 / ID / 负责人')).toBeVisible();

  await page.getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByRole('complementary', { name: '发布任务抽屉' })).toBeVisible();
  await expect(page.getByLabel('关联模板')).toHaveValue('商品清洗 · v3 (Schema r12)');

  await page.getByRole('button', { name: '立即发布 →' }).click();
  await expect(page.getByText('任务已发布。')).toBeVisible();

  await page.getByRole('button', { name: '暂停 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByText('任务已暂停。')).toBeVisible();

  await page.getByRole('button', { name: '恢复 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByText('任务已恢复发布。')).toBeVisible();

  await page.getByRole('button', { name: '结束 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByText('任务已结束。')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
