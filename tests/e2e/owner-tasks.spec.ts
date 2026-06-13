import { expect, test, type Page } from '@playwright/test';

const SESSION_KEY = 'labelhub.session.v1';

const baseTask = {
  id: 'task_draft',
  title: '商品标题清洗 v3 · 抖音电商',
  description: '清洗商品标题并补充关键词。',
  richTextInstruction: '请保留核心商品信息。',
  tags: ['电商', '文本清洗', '中文'],
  rewardRule: '0.30 元 / 条',
  rewardPerItem: 0.3,
  quota: 5000,
  deadline: '2026-07-01T15:59:00.000Z',
  distributionStrategy: 'FIRST_COME_FIRST_SERVE',
  aiPreReviewEnabled: true,
  aiRuleName: '电商相关性 v2',
  status: 'DRAFT',
  templateId: 'template_1',
  template: {
    id: 'template_1',
    name: '商品清洗',
    datasetKind: 'qa_quality',
    schemaVersion: 'r12',
    status: 'PUBLISHED',
    version: 3,
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

  await page.route('**/tasks/summaries?*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [
          currentTask,
          { ...baseTask, id: 'task_paused', title: '短视频脚本对齐评测', status: 'PAUSED' },
          { ...baseTask, id: 'task_ended', title: 'AIGC 图文质量打分', status: 'ENDED' },
        ],
        requestId: 'req_e2e_task_summaries',
      },
    });
  });

  await page.route('**/templates', async (route) => {
    if (route.request().resourceType() === 'document') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: [baseTask.template],
        requestId: 'req_e2e_templates',
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

  await setSession(page);
  await page.goto('/owner/tasks');

  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();
  await expect(page.getByRole('table', { name: '任务列表' })).toBeVisible();
  await expect(page.getByPlaceholder('搜索任务名 / ID / 负责人')).toBeVisible();

  await page.getByRole('button', { name: '发布 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByRole('complementary', { name: '发布任务抽屉' })).toBeVisible();
  await expect(page.getByLabel('关联模板')).toHaveValue('M-001 · 商品清洗 · v3');

  await page.getByRole('button', { name: '立即发布 →' }).click();
  await expect(page.getByRole('row', { name: /商品标题清洗 v3 · 抖音电商 进行中/ })).toBeVisible();

  await page.getByRole('button', { name: '暂停 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByRole('row', { name: /商品标题清洗 v3 · 抖音电商 已暂停/ })).toBeVisible();

  await page.getByRole('button', { name: '恢复 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByRole('row', { name: /商品标题清洗 v3 · 抖音电商 进行中/ })).toBeVisible();

  await page.getByRole('button', { name: '结束 商品标题清洗 v3 · 抖音电商' }).click();
  await expect(page.getByRole('row', { name: /商品标题清洗 v3 · 抖音电商 已完成/ })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

async function setSession(page: Page) {
  await page.goto('/login');
  await page.evaluate((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        token: 'mock-token-owner',
        user: {
          id: 'demo-owner',
          name: '张泽鑫',
          role: 'OWNER',
        },
      }),
    );
  }, SESSION_KEY);
}
