import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type TemplateDraftRequest = {
  name: string;
  description?: string;
  datasetKind: string;
  schema: {
    datasetKind: string;
    schemaVersion: string;
    fields: Array<{
      key: string;
      fieldKey?: string;
      type: string;
      label: string;
      sourceKeys?: string[];
      displayConfig?: {
        fields?: Array<{
          sourceKey: string;
          label: string;
        }>;
      };
      options?: Array<{
        label: string;
        value: string;
      }>;
      validation?: {
        required?: boolean;
      };
    }>;
  };
};

test('Owner 评测模板支持新建草稿、配置字段并持久化', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  let savedDraftRequest: TemplateDraftRequest | null = null;
  let templates: unknown[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.route('**/auth/login', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { account?: string; password?: string };
    expect(body).toMatchObject({
      account: 'zhangzexin',
      password: 'labelhub@1101101',
    });

    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          token: 'mock-token-owner',
          user: {
            id: 'demo-owner',
            name: '张泽鑫',
            role: 'OWNER',
          },
        },
        requestId: 'req_e2e_login',
      },
    });
  });

  await page.route('**/templates', async (route) => {
    if (route.request().resourceType() === 'document') {
      await route.fallback();
      return;
    }

    if (route.request().method() === 'POST') {
      savedDraftRequest = JSON.parse(route.request().postData() ?? '{}') as TemplateDraftRequest;
      const savedTemplate = {
        id: 'template_auto_regression',
        name: savedDraftRequest.name,
        description: savedDraftRequest.description ?? null,
        datasetKind: savedDraftRequest.datasetKind,
        schemaVersion: savedDraftRequest.schema.schemaVersion,
        schema: savedDraftRequest.schema,
        status: 'DRAFT',
        version: 0,
        parentTemplateId: null,
        rootTemplateId: null,
        archivedAt: null,
        restoredFromTemplateId: null,
        createdById: 'demo-owner',
        publishedAt: null,
        createdAt: '2026-06-13T02:51:00.000Z',
        updatedAt: '2026-06-13T02:51:00.000Z',
      };
      templates = [savedTemplate];

      await route.fulfill({
        contentType: 'application/json',
        json: { data: savedTemplate, requestId: 'req_e2e_create_template' },
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      json: { data: templates, requestId: 'req_e2e_templates' },
    });
  });

  await page.goto('/login');
  await page.getByLabel('账号').fill('zhangzexin');
  await page.getByLabel('密码').fill('labelhub@1101101');
  await page.getByRole('button', { name: '登录平台' }).click();

  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开账号菜单' })).toContainText('张泽鑫 · Owner');
  await attachScreenshot(page, testInfo, '01-owner-home');

  await page.getByRole('link', { name: '评测模板' }).click();
  await expect(page.getByRole('heading', { name: '评测模板' })).toBeVisible();
  await expect(page.getByRole('table', { name: '模板列表' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Owner 端导航' })).toBeVisible();
  await attachScreenshot(page, testInfo, '02-template-list');

  await page.getByRole('button', { name: '新增模板' }).click();
  const designer = page.getByRole('dialog', { name: '模板配置' });
  await expect(designer).toBeVisible();
  await expect(designer.getByRole('button', { name: /保存并发布版本/ })).toBeVisible();
  await expect(designer.getByRole('button', { name: '编辑模板名称' })).toBeVisible();
  await attachScreenshot(page, testInfo, '03-new-template-empty');

  await designer.getByRole('button', { name: '编辑模板名称' }).click();
  await designer.getByLabel('模板名称').fill('自动化测试模板');
  await designer.getByLabel('模板名称').press('Enter');
  await expect(designer.getByRole('button', { name: '编辑模板名称' })).toContainText('自动化测试模板');
  await attachScreenshot(page, testInfo, '04-template-name-filled');

  await dragMaterialToCanvas(page, '拖拽展示项 ShowItem');
  await expect(designer.getByRole('button', { name: '选择 展示项 ShowItem' })).toBeVisible();
  await expect(designer.getByText('prompt', { exact: true })).toBeVisible();
  await designer.getByLabel('展示字段 1 显示名').fill('用户问题');
  await expect(designer.getByRole('row', { name: /用户问题/ })).toBeVisible();

  await dragMaterialToCanvas(page, '拖拽单选');
  await expect(designer.getByRole('button', { name: '选择 单选' })).toBeVisible();
  await designer.getByLabel('字段名').fill('quality');
  await designer.getByLabel('标题').fill('质量判断');
  await designer.getByLabel('必填').check();

  await addOption(designer, '优秀');
  await addOption(designer, '合格');
  await addOption(designer, '不合格');

  await expect(designer.getByLabel('字段名')).toHaveValue('quality');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('优秀');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('合格');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('不合格');
  await attachScreenshot(page, testInfo, '05-fields-configured');

  await page.getByTestId('template-designer-backdrop').click({ position: { x: 50, y: 80 } });
  const saveDraftConfirm = page.getByRole('dialog', { name: '需要保存成草稿吗？' });
  await expect(saveDraftConfirm).toBeVisible();
  await attachScreenshot(page, testInfo, '06-save-draft-confirm');

  await saveDraftConfirm.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开模板 自动化测试模板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开模板 自动化测试模板' })).toContainText('草稿');
  await expect(page.getByRole('button', { name: '打开模板 自动化测试模板' })).toContainText('2');
  await attachScreenshot(page, testInfo, '07-save-success-list');

  expect(savedDraftRequest).not.toBeNull();
  expect(savedDraftRequest?.name).toBe('自动化测试模板');
  expect(savedDraftRequest?.datasetKind).toBe('generic_json');
  expect(savedDraftRequest?.schema.fields).toHaveLength(2);
  expect(savedDraftRequest?.schema.fields[0]).toMatchObject({
    type: 'show_item',
    displayConfig: {
      fields: [{ sourceKey: 'prompt', label: '用户问题' }],
    },
    sourceKeys: ['prompt'],
  });
  expect(savedDraftRequest?.schema.fields[1]).toMatchObject({
    fieldKey: 'quality',
    type: 'radio',
    label: '质量判断',
    validation: { required: true },
    options: [
      { label: '优秀', value: 'option_1' },
      { label: '合格', value: 'option_2' },
      { label: '不合格', value: 'option_3' },
    ],
  });

  await page.getByRole('button', { name: '打开模板 自动化测试模板' }).click();
  await expect(designer).toBeVisible();
  await expect(designer.getByRole('button', { name: '编辑模板名称' })).toContainText('自动化测试模板');
  await expect(designer.getByRole('row', { name: /用户问题/ })).toBeVisible();
  await expect(designer.getByLabel('字段名')).toHaveValue('quality');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('优秀');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('合格');
  await expect(designer.getByRole('button', { name: '选择 质量判断' })).toContainText('不合格');
  await attachScreenshot(page, testInfo, '08-reopen-template');

  await page.reload();
  await expect(page.getByRole('button', { name: '打开模板 自动化测试模板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开模板 自动化测试模板' })).toContainText('草稿');
  await attachScreenshot(page, testInfo, '09-after-refresh');

  expect(consoleErrors).toEqual([]);
});

async function dragMaterialToCanvas(page: Page, materialName: string) {
  const material = page.getByRole('button', { name: materialName });
  const canvas = page.locator('[aria-label="模板画布"]');
  await expect(material).toBeVisible();
  await expect(canvas).toBeVisible();

  const sourceBox = await material.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();

  const targetX = canvasBox!.x + canvasBox!.width / 2;
  const targetY = canvasBox!.y + Math.min(canvasBox!.height - 24, 140);
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

async function addOption(designer: Locator, label: string) {
  await designer.getByRole('button', { name: '新增选项' }).click();
  await designer.getByRole('textbox', { name: '新选项' }).fill(label);
  await designer.getByRole('button', { name: '确认新增选项' }).click();
  await expect(designer.getByRole('button', { name: `删除选项 ${label}` })).toBeVisible();
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}
