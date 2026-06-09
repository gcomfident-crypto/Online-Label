#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const ROOT = resolve('/Users/zzx/workspace/LH');
const requireFromApi = createRequire(join(ROOT, 'apps/api/package.json'));
const ExcelJS = requireFromApi('exceljs');
const API = process.env.VERIFY_API_BASE ?? 'http://localhost:3000';
const WEB = process.env.VERIFY_WEB_BASE ?? 'http://localhost:5011';
const REPORTS_DIR = join(ROOT, 'docs/verify/reports');
const EXPORT_COPY_DIR = join(REPORTS_DIR, '_exports');

const USERS = {
  owner: { id: 'user_owner_zhang_man', name: '张泽鑫', role: 'OWNER', sessionId: 'demo-owner' },
  labeler: { id: 'user_labeler_li_lei', name: '王昱阳', role: 'LABELER', sessionId: 'demo-labeler' },
  agent: { id: undefined, name: 'AI Agent', role: 'AI_AGENT', sessionId: 'demo-agent' },
  reviewer: { id: 'user_reviewer_wang_fang', name: '鑫泽张', role: 'REVIEWER', sessionId: 'demo-reviewer' },
};

const VALID_INPUTS = [
  ['preference_compare', 'excel', 'datasets/preference_compare/excel/preference_compare.xlsx'],
  ['preference_compare', 'json', 'datasets/preference_compare/json/preference_compare.json'],
  ['preference_compare', 'jsonl', 'datasets/preference_compare/jsonl/3条.jsonl'],
  ['preference_compare', 'jsonl', 'datasets/preference_compare/jsonl/preference_compare.jsonl'],
  ['qa_quality', 'excel', 'datasets/qa_quality/excel/qa_quality.xlsx'],
  ['qa_quality', 'excel', 'datasets/qa_quality/excel/qa_quality copy.xlsx'],
  ['qa_quality', 'json', 'datasets/qa_quality/json/qa_quality.json'],
  ['qa_quality', 'jsonl', 'datasets/qa_quality/jsonl/qa_quality.jsonl'],
].map(([datasetKind, format, relPath]) => ({ datasetKind, format, absPath: join(ROOT, relPath), relPath }));

const INVALID_INPUTS = [
  'datasets/.DS_Store',
  'datasets/preference_compare/.DS_Store',
  'datasets/qa_quality/.DS_Store',
  'datasets/qa_quality/excel/.~qa_quality.xlsx',
  'datasets/preference_compare/标注要求.md',
  'datasets/qa_quality/标注要求.md',
].map((relPath) => ({ relPath, absPath: join(ROOT, relPath) }));

const EXPORT_FORMATS = ['json', 'jsonl', 'csv', 'xlsx'];
const EVIDENCE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR4nO3PQQ3AIADAQMDTnA1vYCQm4J2kqzYI7LMv2wG8x9UDwAIECBAYAQIECBAgMAIECBAgMAIECBAgMAIECBAgMAIECBAgMAIECBAgMAIECBAgMAIECBAgMALnsgFWVwK7fAAAAABJRU5ErkJggg==';

class VerificationFailure extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'VerificationFailure';
    this.context = context;
  }
}

const nowToken = () => new Date().toISOString().replace(/[-:TZ.]/g, '').slice(4, 14);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const jsonHeaders = { 'Content-Type': 'application/json' };

function reportIdFor(input) {
  const stem = basename(input.absPath, extname(input.absPath)).replaceAll(' ', '_');
  return `${input.datasetKind}__${input.format}__${stem}`;
}

function reportFileFor(input) {
  return `${reportIdFor(input)}__verification-report.md`;
}

function apiPath(path) {
  return `${API}${path}`;
}

async function api(path, options = {}) {
  const response = await fetch(apiPath(path), {
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new VerificationFailure(`API ${path} failed with HTTP ${response.status}`, { path, status: response.status, payload });
  }
  return payload?.data ?? payload;
}

async function apiAllowError(path, options = {}) {
  const response = await fetch(apiPath(path), {
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { ok: response.ok, status: response.status, payload: payload?.data ?? payload, raw: text };
}

async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sessionFor(user) {
  return {
    token: `mock-token-${user.role.toLowerCase()}`,
    user: {
      id: user.sessionId,
      name: user.name,
      role: user.role,
    },
  };
}

async function setRole(page, user) {
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.evaluate((session) => {
    window.localStorage.setItem('labelhub.session.v1', JSON.stringify(session));
    window.sessionStorage.removeItem('labelhub.session.v1');
  }, sessionFor(user));
}

function installConsoleCapture(page, bucket) {
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      bucket.push({ type: message.type(), text: message.text(), time: new Date().toISOString() });
    }
  });
  page.on('pageerror', (error) => {
    bucket.push({ type: 'pageerror', text: error.message, time: new Date().toISOString() });
  });
  page.on('requestfailed', (request) => {
    bucket.push({ type: 'requestfailed', text: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim(), time: new Date().toISOString() });
  });
}

async function screenshot(page, state, role, stage) {
  state.step += 1;
  const fileName = `${String(state.step).padStart(2, '0')}__${role}__${stage}.png`;
  const filePath = join(state.screenshotsDir, fileName);
  const recentConsole = state.consoleEvents.slice(-6);
  await page.evaluate(({ recentConsole }) => {
    document.querySelector('[data-verification-overlay="true"]')?.remove();
    const overlay = document.createElement('div');
    overlay.dataset.verificationOverlay = 'true';
    overlay.style.cssText = [
      'position:fixed',
      'left:8px',
      'right:8px',
      'bottom:8px',
      'z-index:2147483647',
      'padding:6px 8px',
      'border:1px solid rgba(15,23,42,.25)',
      'border-radius:8px',
      'background:rgba(255,255,255,.94)',
      'color:#0f172a',
      'font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
      'box-shadow:0 8px 20px rgba(15,23,42,.16)',
      'pointer-events:none',
      'white-space:pre-wrap',
      'max-height:96px',
      'overflow:hidden',
    ].join(';');
    const consoleText = recentConsole.length
      ? recentConsole.map((event) => `${event.type}: ${event.text}`).join('\n')
      : 'console: clean';
    overlay.textContent = `URL: ${window.location.href}\n${consoleText}`;
    document.body.appendChild(overlay);
  }, { recentConsole });
  await page.screenshot({ path: filePath, fullPage: true });
  state.screenshots.push({ role, stage, fileName, filePath, consoleEvents: [...state.consoleEvents] });
  if (state.consoleEvents.some((event) => event.type === 'error' || event.type === 'pageerror')) {
    throw new VerificationFailure(`Console error after ${role}/${stage}`, { events: state.consoleEvents, screenshot: filePath });
  }
  return filePath;
}

async function gotoAndShot(page, state, user, urlPath, role, stage) {
  await setRole(page, user);
  await page.goto(`${WEB}${urlPath}`, { waitUntil: 'networkidle', timeout: 30000 });
  await screenshot(page, state, role, stage);
}

async function waitForCondition(label, fn, timeoutMs = 30000, intervalMs = 500) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new VerificationFailure(`Timed out waiting for ${label}`, { lastError: lastError?.message });
}

async function loadTemplates() {
  const templates = await api('/templates');
  const preferenceTemplate = templates.find((template) => template.name === '模型对比模版' && template.status === 'PUBLISHED');
  const qaTemplate = templates.find((template) => template.name === '问答质量官方模板' && template.status === 'PUBLISHED');
  if (!preferenceTemplate) throw new VerificationFailure('缺少已发布的 模型对比模版');
  if (!qaTemplate) throw new VerificationFailure('缺少已发布的 qa_quality 专用模板：问答质量官方模板');
  return { preferenceTemplate, qaTemplate };
}

function templateForInput(input, templates) {
  return input.datasetKind === 'qa_quality' ? templates.qaTemplate : templates.preferenceTemplate;
}

function importFormat(input) {
  if (input.format === 'excel') return 'xlsx';
  return input.format;
}

async function inputContent(input) {
  const buffer = await readFile(input.absPath);
  if (input.format === 'excel') {
    return { contentBase64: buffer.toString('base64') };
  }
  return { content: buffer.toString('utf8') };
}

async function expectedInputCount(input) {
  if (input.format === 'json') {
    const parsed = JSON.parse(await readFile(input.absPath, 'utf8'));
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed.items)) return parsed.items.length;
    return 1;
  }
  if (input.format === 'jsonl') {
    const lines = (await readFile(input.absPath, 'utf8')).split(/\r?\n/).filter((line) => line.trim());
    return lines.length;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(createReadStream(input.absPath));
  const worksheet = workbook.worksheets[0];
  let count = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (values.some((value) => value !== null && value !== undefined && String(value).trim() !== '')) count += 1;
  });
  return count;
}

async function createEvidencePack(input, reportDir, runToken) {
  if (input.datasetKind !== 'qa_quality') {
    return null;
  }

  const evidenceDir = join(reportDir, 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  const fileName = `qa-evidence-${runToken}.txt`;
  const imageName = `qa-evidence-${runToken}.png`;
  const filePath = join(evidenceDir, fileName);
  const imagePath = join(evidenceDir, imageName);
  await writeFile(
    filePath,
    [
      'LabelHub qa_quality verification evidence attachment',
      `input=${input.absPath}`,
      `runToken=${runToken}`,
      `createdAt=${new Date().toISOString()}`,
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(imagePath, Buffer.from(EVIDENCE_IMAGE_BASE64, 'base64'));
  const fileStat = await stat(filePath);
  const imageStat = await stat(imagePath);

  return {
    filePath,
    imagePath,
    file: {
      name: fileName,
      url: `mock://local/${fileName}`,
      mimeType: 'text/plain',
      size: fileStat.size,
    },
    image: {
      name: imageName,
      url: `mock://local/${imageName}`,
      mimeType: 'image/png',
      size: imageStat.size,
    },
  };
}

function baseAnswers(datasetKind, item, variant = 'initial', evidencePack = null) {
  if (datasetKind === 'qa_quality') {
    if (!evidencePack) {
      throw new VerificationFailure('qa_quality evidence pack missing', { externalId: item.externalId, variant });
    }
    const suffix = variant === 'revision' ? '已按审核意见补充修订。' : '回答基本满足要求。';
    return {
      relevance_score: '5',
      accuracy_score: '5',
      format_score: '5',
      safety_score: '5',
      issue_tags: [],
      summary: variant === 'revision' ? '修订后质量良好' : '整体质量良好',
      comment: `${item.externalId}：${suffix} 未发现明显事实、安全或格式问题。`,
      revision_suggestion: '<p>无需进一步修改。</p>',
      structured_note: { verdict: 'pass', externalId: item.externalId, round: variant },
      evidence_file: evidencePack.file,
      evidence_image: evidencePack.image,
    };
  }
  return {
    preferred: 'A',
    margin: '略优于',
    dimensions: ['helpfulness'],
    safety_flag: 'false',
    safety_annotation: '无安全风险',
    annotator_note: `${item.externalId}：${variant === 'revision' ? '已根据审核意见补充理由。' : 'A 的回答更完整，表达更清晰。'}`,
  };
}

async function uploadEvidenceThroughUi(page, state, evidencePack) {
  if (!evidencePack) {
    return;
  }

  await page.getByLabel('证据附件').setInputFiles(evidencePack.filePath);
  await screenshot(page, state, 'labeler', 'evidence-file-selected');
  await page.getByLabel('证据截图').setInputFiles(evidencePack.imagePath);
  await screenshot(page, state, 'labeler', 'evidence-image-selected');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await screenshot(page, state, 'labeler', 'evidence-upload-saved');
}

function assertQaEvidencePresent(input, assignments, stage) {
  if (input.datasetKind !== 'qa_quality') {
    return;
  }

  const missing = assignments
    .filter((assignment) => {
      const answers = assignment.draftAnswers ?? {};
      return !isUploadedEvidence(answers.evidence_file) || !isUploadedEvidence(answers.evidence_image);
    })
    .map((assignment) => assignment.externalId ?? assignment.taskItemExternalId ?? assignment.assignmentId);

  if (missing.length > 0) {
    throw new VerificationFailure('qa_quality evidence fields are empty', { stage, missing });
  }
}

function isUploadedEvidence(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.name.trim() &&
    typeof value.url === 'string' &&
    value.url.trim() &&
    typeof value.mimeType === 'string' &&
    value.mimeType.trim() &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size > 0
  );
}

function reviewFieldKey(datasetKind) {
  return datasetKind === 'qa_quality' ? 'comment' : 'annotator_note';
}

function aiStructuredOutput(input, item, decision, template) {
  const fields = template.schema.fields.filter((field) => field.fieldKey && field.aiReview?.enabled !== false);
  const fieldReviews = fields.map((field, index) => {
    const rejectThis = decision === 'reject' && field.fieldKey === reviewFieldKey(input.datasetKind);
    return {
      fieldKey: field.fieldKey,
      label: field.label ?? field.fieldKey,
      decision: rejectThis ? 'reject' : 'pass',
      score: rejectThis ? 40 : 100,
      comment: rejectThis
        ? `AI 建议打回 ${item.externalId}：${field.label ?? field.fieldKey} 需要补充依据。`
        : `AI 已检查 ${field.label ?? field.fieldKey}，未发现阻断问题。`,
      suggestions: rejectThis ? ['补充更具体的判断依据。'] : [],
    };
  });
  return {
    verdict: decision,
    overallScore: decision === 'pass' ? 100 : 40,
    overallComment: decision === 'pass' ? 'AI 预审通过。' : `AI 建议打回 ${item.externalId}，需要补充说明。`,
    fieldReviews,
  };
}

async function createTaskAndImport(input, template, runToken) {
  const title = `VERIFY-${input.datasetKind}-${input.format}-${basename(input.absPath, extname(input.absPath))}-${runToken}`;
  const task = await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description: `系统验收输入：${input.absPath}`,
      tags: ['system-verification', input.datasetKind, input.format, runToken],
      rewardRule: '1.00 元 / 条',
      rewardPerItem: 1,
      perUserLimit: 100,
      deadline: '2026-06-30T07:00:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
      aiPreReviewEnabled: true,
      aiRuleName: '系统验收 AI 预审',
      templateId: template.id,
      actorId: USERS.owner.id,
    }),
  });
  const importSummary = await api(`/tasks/${task.id}/items/import`, {
    method: 'POST',
    body: JSON.stringify({
      datasetKind: template.datasetKind,
      format: importFormat(input),
      fileName: basename(input.absPath),
      ...(await inputContent(input)),
    }),
  });
  const quotaTask = await api(`/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ quota: importSummary.importedCount }),
  });
  const items = await api(`/tasks/${task.id}/items`);
  const publishedTask = await api(`/tasks/${task.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'PUBLISHED', actorId: USERS.owner.id, confirm: true }),
  });
  return { task: publishedTask, createdTask: task, quotaTask, importSummary, items };
}

async function saveDraft(assignmentId, answers, actorId = USERS.labeler.id) {
  return api(`/drafts/${assignmentId}`, {
    method: 'PUT',
    body: JSON.stringify({ actorId, answers }),
  });
}

async function listAssignments(taskId) {
  return api(`/labeler/assignments?labelerId=${encodeURIComponent(USERS.labeler.id)}&taskId=${encodeURIComponent(taskId)}`);
}

async function listTaskJobs(taskId) {
  const jobs = await api('/ai-review/jobs');
  return jobs.filter((job) => job.taskId === taskId).sort((a, b) => a.externalId.localeCompare(b.externalId, 'zh-Hans-CN'));
}

async function completeCurrentAiBatch(taskId, input, template, rejectExternalId = null) {
  const jobs = await waitForCondition(`AI jobs for ${taskId}`, async () => {
    const current = await listTaskJobs(taskId);
    const open = current.filter((job) => ['QUEUED', 'RUNNING'].includes(job.status));
    return open.length > 0 ? open : null;
  }, 20000, 250);
  const completed = [];
  for (const job of jobs) {
    const decision = rejectExternalId && job.externalId === rejectExternalId ? 'reject' : 'pass';
    const structuredOutput = aiStructuredOutput(input, job, decision, template);
    const result = await api(`/ai-review/jobs/${job.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        scores: { overall: decision === 'pass' ? 100 : 40, fieldCount: structuredOutput.fieldReviews.length },
        comment: structuredOutput.overallComment,
        rawPrompt: `system verification ${input.datasetKind}`,
        rawOutput: JSON.stringify(structuredOutput),
        structuredOutput,
        modelMetadata: { provider: 'verification-harness', model: 'deterministic-flow-driver' },
      }),
    });
    completed.push({ job, result });
  }
  return completed;
}

async function taskFlow(taskId) {
  return api(`/agent/task-flows/${encodeURIComponent(taskId)}`);
}

async function taskFlowLogs(taskId) {
  return api(`/agent/task-flows/${encodeURIComponent(taskId)}/logs`);
}

async function reviewerPendingForTask(taskId) {
  const pending = await api('/reviews/pending');
  return pending
    .filter((item) => item.taskId === taskId && ['HUMAN_PENDING', 'RECHECK_REVIEWING'].includes(item.status))
    .sort((a, b) => String(a.externalId).localeCompare(String(b.externalId), 'zh-Hans-CN'));
}

async function rejectOneThenPassRest(taskId, input, targetExternalId) {
  const pending = await waitForCondition(`reviewer pending for ${taskId}`, async () => {
    const list = await reviewerPendingForTask(taskId);
    return list.length > 0 ? list : null;
  }, 20000, 500);
  const target = pending.find((item) => item.externalId === targetExternalId) ?? pending[0];
  const fieldKey = reviewFieldKey(input.datasetKind);
  const fieldLabel = input.datasetKind === 'qa_quality' ? '详细评语 / 打回理由' : '标注备注';
  const fieldComment = `${target.externalId} 的「${fieldLabel}」需要补充具体判断依据，请引用原始内容说明为什么当前判断成立。`;
  const rejectResult = await api(`/reviews/${target.submissionId}/reject`, {
    method: 'POST',
    body: JSON.stringify({
      actorId: USERS.reviewer.id,
      reason: `Reviewer 打回 ${target.externalId}，要求补充字段级说明。`,
      fieldReviews: [{ fieldKey, label: fieldLabel, comment: fieldComment }],
    }),
  });
  const afterSingleRejectAssignments = await listAssignments(taskId);
  const rest = pending.filter((item) => item.submissionId !== target.submissionId);
  const passResults = [];
  for (const item of rest) {
    passResults.push(await api(`/reviews/${item.submissionId}/pass`, {
      method: 'POST',
      body: JSON.stringify({ actorId: USERS.reviewer.id, comment: 'Reviewer 检查通过。' }),
    }));
  }
  return { pending, target, rejectResult, afterSingleRejectAssignments, passResults };
}

async function passAllReviewerPending(taskId) {
  const pending = await waitForCondition(`final reviewer pending for ${taskId}`, async () => {
    const list = await reviewerPendingForTask(taskId);
    return list.length > 0 ? list : null;
  }, 20000, 500);
  const results = [];
  for (const item of pending) {
    results.push(await api(`/reviews/${item.submissionId}/pass`, {
      method: 'POST',
      body: JSON.stringify({ actorId: USERS.reviewer.id, comment: 'Reviewer 最终复审通过。' }),
    }));
  }
  return { pending, results };
}

async function createAndVerifyExports(input, taskId, expectedCount, reportDir) {
  await mkdir(EXPORT_COPY_DIR, { recursive: true });
  const results = [];
  for (const format of EXPORT_FORMATS) {
    const job = await api('/exports', {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        requestedById: USERS.owner.id,
        format,
        includeReviews: true,
        idempotencyKey: `${taskId}-${format}-${Date.now()}`,
      }),
    });
    if (job.status !== 'SUCCEEDED') {
      throw new VerificationFailure(`Export ${format} did not succeed`, { job });
    }
    const sourcePath = join(ROOT, 'apps/api', job.filePath);
    const copiedPath = join(EXPORT_COPY_DIR, `${taskId}.${format}`);
    await copyFile(sourcePath, copiedPath);
    const parsed = await parseExportFile(copiedPath, format);
    if (parsed.rowCount !== expectedCount) {
      throw new VerificationFailure(`Export ${format} row count mismatch`, { expectedCount, actual: parsed.rowCount, copiedPath });
    }
    validateExportFields(input, parsed.rows, format);
    results.push({ format, job, copiedPath, rowCount: parsed.rowCount, headers: parsed.headers });
  }
  await saveJson(join(reportDir, 'exports-verification.json'), results);
  return results;
}

async function verifyExportPreview(input, page, state, task, expectedCount, reportDir) {
  const preview = await api(`/tasks/${task.id}/export-preview?includeReviews=true`);
  const expectedPreviewCount = Math.min(5, expectedCount);
  if (preview.totalFinalApproved !== expectedCount) {
    throw new VerificationFailure('Export preview total count mismatch', {
      input: input.absPath,
      expectedCount,
      actual: preview.totalFinalApproved,
      taskId: task.id,
    });
  }
  if (preview.rows.length !== expectedPreviewCount) {
    throw new VerificationFailure('Export preview row count mismatch', {
      input: input.absPath,
      expectedPreviewCount,
      actual: preview.rows.length,
      taskId: task.id,
    });
  }
  await saveJson(join(reportDir, 'export-preview-verification.json'), {
    taskId: task.id,
    expectedCount,
    totalFinalApproved: preview.totalFinalApproved,
    previewRowCount: preview.rows.length,
    previewRowsAreSampleOnly: preview.rows.length < preview.totalFinalApproved,
  });

  await gotoAndShot(page, state, USERS.owner, '/owner/exports', 'owner', 'export-center-before-preview');
  const taskRow = page.locator('tr', { hasText: task.title }).first();
  await taskRow.waitFor({ timeout: 10000 });
  await taskRow.locator('button[aria-label^="预览"]').first().click();
  const dialog = page.getByRole('dialog', { name: `任务内容预览 · ${task.title}` });
  await dialog.waitFor({ timeout: 10000 });
  await dialog.getByText(`完整可导出 ${expectedCount.toLocaleString()} 条`, { exact: false }).waitFor({ timeout: 10000 });
  const previewScopeText =
    preview.rows.length < preview.totalFinalApproved
      ? `当前仅预览前 ${preview.rows.length.toLocaleString()} 条`
      : `当前预览 ${preview.rows.length.toLocaleString()} 条`;
  await dialog.getByText(previewScopeText, { exact: false }).waitFor({ timeout: 10000 });
  await screenshot(page, state, 'owner', 'export-preview-dialog-counts');
  await dialog.getByRole('button', { name: '关闭预览' }).click();

  return preview;
}

async function parseExportFile(filePath, format) {
  if (format === 'json') {
    const rows = JSON.parse(await readFile(filePath, 'utf8'));
    return { rows, rowCount: rows.length, headers: rows[0] ? Object.keys(rows[0]) : [] };
  }
  if (format === 'jsonl') {
    const rows = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return { rows, rowCount: rows.length, headers: rows[0] ? Object.keys(rows[0]) : [] };
  }
  if (format === 'csv') {
    const content = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    const records = parseCsvRecords(content).filter((record) => record.some((value) => value !== ''));
    const headers = records[0] ?? [];
    const rows = records.slice(1).map((record) => Object.fromEntries(record.map((value, index) => [headers[index], value])));
    return { rows, rowCount: rows.length, headers };
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  const headers = worksheet.getRow(1).values.slice(1).map(String);
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push(Object.fromEntries(row.values.slice(1).map((value, index) => [headers[index], value])));
  });
  return { rows, rowCount: rows.length, headers };
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRecords(content) {
  const records = [];
  let record = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"' && quoted && content[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      record.push(current);
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') {
        index += 1;
      }
      record.push(current);
      records.push(record);
      record = [];
      current = '';
      continue;
    }
    current += char;
  }
  if (current || record.length > 0) {
    record.push(current);
    records.push(record);
  }
  return records;
}

function validateExportFields(input, rows, format) {
  if (rows.length === 0) throw new VerificationFailure(`Export ${format} produced empty rows`);
  const joinedKeys = Object.keys(rows[0]).join('|');
  const required = input.datasetKind === 'qa_quality'
    ? ['relevance_score', 'accuracy_score', 'format_score', 'safety_score', 'issue_tags', 'summary', 'comment', 'revision_suggestion', 'structured_note', 'evidence_file', 'evidence_image']
    : ['preferred', 'margin', 'dimensions', 'safety_flag', 'annotator_note'];
  const missing = required.filter((field) => !joinedKeys.includes(field));
  if (missing.length > 0) {
    throw new VerificationFailure(`Export ${format} missing required fields`, { missing, headers: Object.keys(rows[0]) });
  }
  if (input.datasetKind === 'qa_quality') {
    const emptyEvidence = rows
      .map((row, index) => ({ index, evidenceFile: row.evidence_file, evidenceImage: row.evidence_image }))
      .filter((row) => !hasExportEvidenceValue(row.evidenceFile) || !hasExportEvidenceValue(row.evidenceImage));
    if (emptyEvidence.length > 0) {
      throw new VerificationFailure(`Export ${format} has empty qa_quality evidence fields`, {
        emptyEvidence: emptyEvidence.slice(0, 10),
      });
    }
  }
}

function hasExportEvidenceValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 && value !== 'null';
  }
  if (typeof value === 'object') {
    return isUploadedEvidence(value);
  }
  return true;
}

async function verifyInvalidInputs(templates, runToken, page) {
  const reportDir = join(REPORTS_DIR, `invalid_inputs__${runToken}`);
  const screenshotsDir = join(reportDir, 'screenshots');
  await rm(reportDir, { recursive: true, force: true });
  await mkdir(screenshotsDir, { recursive: true });
  const state = { reportDir, screenshotsDir, screenshots: [], consoleEvents: [], step: 0 };
  installConsoleCapture(page, state.consoleEvents);
  const results = [];
  for (const invalid of INVALID_INPUTS) {
    const datasetKind = invalid.relPath.includes('qa_quality') ? 'qa_quality' : 'preference_compare';
    const template = datasetKind === 'qa_quality' ? templates.qaTemplate : templates.preferenceTemplate;
    const task = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: `VERIFY-invalid-${basename(invalid.absPath)}-${runToken}`,
        description: `异常输入验证：${invalid.absPath}`,
        tags: ['system-verification', 'invalid-input', runToken],
        quota: 10,
        distributionStrategy: 'FIRST_COME_FIRST_SERVE',
        aiPreReviewEnabled: true,
        templateId: template.id,
        actorId: USERS.owner.id,
      }),
    });
    const ext = extname(invalid.absPath).toLowerCase();
    const format = ext === '.xlsx' ? 'xlsx' : ext === '.jsonl' ? 'jsonl' : 'json';
    const body = ext === '.xlsx'
      ? { contentBase64: (await readFile(invalid.absPath)).toString('base64') }
      : { content: await readFile(invalid.absPath, 'utf8').catch(() => '') };
    const result = await apiAllowError(`/tasks/${task.id}/items/import`, {
      method: 'POST',
      body: JSON.stringify({ datasetKind, format, fileName: basename(invalid.absPath), ...body }),
    });
    const items = await api(`/tasks/${task.id}/items`);
    results.push({ invalidInput: invalid.absPath, status: result.status, ok: result.ok, payload: result.payload, itemCount: items.length });
    await gotoAndShot(page, state, USERS.owner, `/owner/tasks/${task.id}/dataset`, 'owner', `invalid-input-${sanitizeStage(basename(invalid.absPath))}`);
    if (result.status >= 500) {
      throw new VerificationFailure('Invalid input returned server error', { invalidInput: invalid.absPath, result });
    }
    if (items.length > 0) {
      throw new VerificationFailure('Invalid input generated task items', { invalidInput: invalid.absPath, result, items });
    }
    const explicitSignal =
      !result.ok ||
      Number(result.payload?.errorCount ?? 0) > 0 ||
      (Array.isArray(result.payload?.skippedFiles) && result.payload.skippedFiles.length > 0);
    if (!explicitSignal) {
      throw new VerificationFailure('Invalid input was silently accepted without explicit error or skip signal', {
        invalidInput: invalid.absPath,
        result,
      });
    }
  }
  await saveJson(join(reportDir, 'invalid-input-results.json'), results);
  await writeFile(join(reportDir, 'invalid-inputs__verification-report.md'), invalidReportMarkdown(results, state), 'utf8');
  return { reportDir, results };
}

function sanitizeStage(value) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 50) || 'stage';
}

async function runOneInput(browser, input, templates, runToken) {
  const reportId = reportIdFor(input);
  const reportDir = join(REPORTS_DIR, reportId);
  const screenshotsDir = join(reportDir, 'screenshots');
  await rm(reportDir, { recursive: true, force: true });
  await mkdir(screenshotsDir, { recursive: true });
  const state = { reportId, reportDir, screenshotsDir, screenshots: [], consoleEvents: [], step: 0 };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  installConsoleCapture(page, state.consoleEvents);
  const artifacts = { input, reportId, runToken };
  try {
    const expectedCount = await expectedInputCount(input);
    const template = templateForInput(input, templates);
    const evidencePack = await createEvidencePack(input, reportDir, runToken);
    artifacts.expectedCount = expectedCount;
    artifacts.template = { id: template.id, name: template.name, schemaVersion: template.schemaVersion, status: template.status };
    artifacts.evidence = evidencePack
      ? {
          file: evidencePack.file,
          image: evidencePack.image,
          filePath: evidencePack.filePath,
          imagePath: evidencePack.imagePath,
        }
      : null;

    await gotoAndShot(page, state, USERS.owner, '/owner/tasks', 'owner', 'task-list-before-create');
    const setup = await createTaskAndImport(input, template, runToken);
    artifacts.task = setup.task;
    artifacts.createdTask = setup.createdTask;
    artifacts.importSummary = setup.importSummary;
    artifacts.items = setup.items;
    await saveJson(join(reportDir, 'owner-api-setup.json'), setup);
    if (setup.items.length !== expectedCount) {
      throw new VerificationFailure('Imported item count mismatch', { expectedCount, actual: setup.items.length });
    }
    await gotoAndShot(page, state, USERS.owner, `/owner/tasks/${setup.task.id}/dataset`, 'owner', 'input-imported-preview');
    await gotoAndShot(page, state, USERS.owner, `/owner/tasks/${setup.task.id}`, 'owner', 'task-published-detail');

    await gotoAndShot(page, state, USERS.labeler, '/labeler/market', 'labeler', 'market-task-visible');
    const claim = await api('/assignments/claim', {
      method: 'POST',
      body: JSON.stringify({ taskId: setup.task.id, labelerId: USERS.labeler.id }),
    });
    artifacts.claim = claim;
    await saveJson(join(reportDir, 'claim-result.json'), claim);
    await gotoAndShot(page, state, USERS.labeler, '/labeler/my-data', 'labeler', 'task-claimed-list');

    let assignments = await listAssignments(setup.task.id);
    artifacts.assignmentsAfterClaim = assignments;
    await saveJson(join(reportDir, 'labeler-assignments-after-claim.json'), assignments);
    const firstAssignment = assignments[0];
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${firstAssignment.taskId}/items/${firstAssignment.taskItemId}?assignmentId=${firstAssignment.assignmentId}`, 'labeler', 'workbench-first-item');

    await uploadEvidenceThroughUi(page, state, evidencePack);
    await saveDraft(firstAssignment.assignmentId, baseAnswers(input.datasetKind, firstAssignment, 'initial', evidencePack));
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${firstAssignment.taskId}/items/${firstAssignment.taskItemId}?assignmentId=${firstAssignment.assignmentId}`, 'labeler', 'first-draft-saved');
    const prematureSubmit = await apiAllowError('/submissions/task', {
      method: 'POST',
      body: JSON.stringify({ taskId: setup.task.id, labelerId: USERS.labeler.id, actorId: USERS.labeler.id, idempotencyKey: `${setup.task.id}-premature` }),
    });
    artifacts.prematureSubmit = prematureSubmit;
    await saveJson(join(reportDir, 'premature-submit-result.json'), prematureSubmit);
    if (prematureSubmit.ok || !JSON.stringify(prematureSubmit.payload).includes('尚未保存草稿')) {
      throw new VerificationFailure('Premature task submit did not fail with missing draft', { prematureSubmit });
    }

    for (const assignment of assignments) {
      await saveDraft(assignment.assignmentId, baseAnswers(input.datasetKind, assignment, 'initial', evidencePack));
    }
    assignments = await listAssignments(setup.task.id);
    assertQaEvidencePresent(input, assignments, 'all-initial-drafts');
    await saveJson(join(reportDir, 'labeler-assignments-all-drafts.json'), assignments);
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${firstAssignment.taskId}/items/${firstAssignment.taskItemId}?assignmentId=${firstAssignment.assignmentId}`, 'labeler', 'all-items-annotated');
    const submitResult = await api('/submissions/task', {
      method: 'POST',
      body: JSON.stringify({ taskId: setup.task.id, labelerId: USERS.labeler.id, actorId: USERS.labeler.id, idempotencyKey: `${setup.task.id}-initial-submit` }),
    });
    artifacts.initialSubmit = submitResult;
    await saveJson(join(reportDir, 'initial-submit-result.json'), submitResult);
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${firstAssignment.taskId}/items/${firstAssignment.taskItemId}?assignmentId=${firstAssignment.assignmentId}`, 'labeler', 'task-submitted-readonly');

    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'queue-before-first-ai-complete');
    const aiRejectExternalId = setup.items[Math.min(1, setup.items.length - 1)]?.externalId ?? setup.items[0].externalId;
    artifacts.aiRejectExternalId = aiRejectExternalId;
    const firstAi = await completeCurrentAiBatch(setup.task.id, input, template, aiRejectExternalId);
    artifacts.firstAi = firstAi;
    await saveJson(join(reportDir, 'first-ai-results.json'), firstAi);
    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'first-ai-rejected');

    const afterAiAssignments = await listAssignments(setup.task.id);
    artifacts.afterAiAssignments = afterAiAssignments;
    await saveJson(join(reportDir, 'labeler-assignments-after-ai.json'), afterAiAssignments);
    const rejectedAssignment = afterAiAssignments.find((assignment) => assignment.externalId === aiRejectExternalId || assignment.taskItemExternalId === aiRejectExternalId || assignment.status === 'NEEDS_REVISION');
    if (!rejectedAssignment) {
      throw new VerificationFailure('AI rejected assignment not visible as NEEDS_REVISION', { afterAiAssignments, aiRejectExternalId });
    }
    const lockedAssignment = afterAiAssignments.find((assignment) => assignment.assignmentId !== rejectedAssignment.assignmentId);
    if (lockedAssignment) {
      const lockedSave = await apiAllowError(`/drafts/${lockedAssignment.assignmentId}`, {
        method: 'PUT',
        body: JSON.stringify({ actorId: USERS.labeler.id, answers: baseAnswers(input.datasetKind, lockedAssignment, 'revision', evidencePack) }),
      });
      artifacts.lockedSave = lockedSave;
      await saveJson(join(reportDir, 'locked-item-draft-save-attempt.json'), lockedSave);
      if (lockedSave.ok) throw new VerificationFailure('Locked non-rejected assignment accepted draft save', { lockedAssignment, lockedSave });
    }
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${rejectedAssignment.taskId}/items/${rejectedAssignment.taskItemId}?assignmentId=${rejectedAssignment.assignmentId}`, 'labeler', 'ai-rework-visible');
    await saveDraft(rejectedAssignment.assignmentId, baseAnswers(input.datasetKind, rejectedAssignment, 'revision', evidencePack));
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${rejectedAssignment.taskId}/items/${rejectedAssignment.taskItemId}?assignmentId=${rejectedAssignment.assignmentId}`, 'labeler', 'ai-rework-edited');
    const aiRevisionSubmit = await api('/submissions/task', {
      method: 'POST',
      body: JSON.stringify({ taskId: setup.task.id, labelerId: USERS.labeler.id, actorId: USERS.labeler.id, idempotencyKey: `${setup.task.id}-ai-revision-submit` }),
    });
    artifacts.aiRevisionSubmit = aiRevisionSubmit;
    await saveJson(join(reportDir, 'ai-revision-submit-result.json'), aiRevisionSubmit);
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${rejectedAssignment.taskId}/items/${rejectedAssignment.taskItemId}?assignmentId=${rejectedAssignment.assignmentId}`, 'labeler', 'ai-rework-submitted');

    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'queue-before-second-ai-complete');
    const secondAi = await completeCurrentAiBatch(setup.task.id, input, template, null);
    artifacts.secondAi = secondAi;
    await saveJson(join(reportDir, 'second-ai-results.json'), secondAi);
    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'second-ai-passed-to-reviewer');

    await gotoAndShot(page, state, USERS.reviewer, '/reviewer/reviews', 'reviewer', 'review-queue-visible');
    await gotoAndShot(page, state, USERS.reviewer, `/reviewer/reviews/${setup.task.id}`, 'reviewer', 'review-detail-full-list');
    const humanRejectExternalId = setup.items[Math.min(2, setup.items.length - 1)]?.externalId ?? setup.items[0].externalId;
    artifacts.humanRejectExternalId = humanRejectExternalId;
    const reviewerRound = await rejectOneThenPassRest(setup.task.id, input, humanRejectExternalId);
    artifacts.reviewerRound = reviewerRound;
    await saveJson(join(reportDir, 'reviewer-round-results.json'), reviewerRound);
    await gotoAndShot(page, state, USERS.reviewer, `/reviewer/reviews/${setup.task.id}`, 'reviewer', 'field-comment-sent-and-task-rejected');
    await gotoAndShot(page, state, USERS.labeler, '/labeler/my-data', 'labeler', 'after-single-reviewer-decision-not-exposed-or-returned-after-round');

    const afterReviewerAssignments = await listAssignments(setup.task.id);
    assertQaEvidencePresent(input, afterReviewerAssignments, 'after-reviewer-round');
    artifacts.afterReviewerAssignments = afterReviewerAssignments;
    await saveJson(join(reportDir, 'labeler-assignments-after-reviewer.json'), afterReviewerAssignments);
    const humanRejectedAssignment = afterReviewerAssignments.find((assignment) => assignment.status === 'NEEDS_REVISION');
    if (!humanRejectedAssignment) throw new VerificationFailure('Reviewer rejected assignment not visible as NEEDS_REVISION after full review round', { afterReviewerAssignments });
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${humanRejectedAssignment.taskId}/items/${humanRejectedAssignment.taskItemId}?assignmentId=${humanRejectedAssignment.assignmentId}`, 'labeler', 'reviewer-comment-visible');
    await saveDraft(humanRejectedAssignment.assignmentId, baseAnswers(input.datasetKind, humanRejectedAssignment, 'revision', evidencePack));
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${humanRejectedAssignment.taskId}/items/${humanRejectedAssignment.taskItemId}?assignmentId=${humanRejectedAssignment.assignmentId}`, 'labeler', 'reviewer-rework-edited');
    const reviewerRevisionSubmit = await api('/submissions/task', {
      method: 'POST',
      body: JSON.stringify({ taskId: setup.task.id, labelerId: USERS.labeler.id, actorId: USERS.labeler.id, idempotencyKey: `${setup.task.id}-reviewer-revision-submit` }),
    });
    artifacts.reviewerRevisionSubmit = reviewerRevisionSubmit;
    await saveJson(join(reportDir, 'reviewer-revision-submit-result.json'), reviewerRevisionSubmit);
    await gotoAndShot(page, state, USERS.labeler, `/labeler/tasks/${humanRejectedAssignment.taskId}/items/${humanRejectedAssignment.taskItemId}?assignmentId=${humanRejectedAssignment.assignmentId}`, 'labeler', 'reviewer-rework-submitted');

    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'queue-before-final-ai-complete');
    const finalAi = await completeCurrentAiBatch(setup.task.id, input, template, null);
    artifacts.finalAi = finalAi;
    await saveJson(join(reportDir, 'final-ai-results.json'), finalAi);
    await gotoAndShot(page, state, USERS.agent, '/agent/task-flows', 'ai-agent', 'final-ai-passed');

    await gotoAndShot(page, state, USERS.reviewer, `/reviewer/reviews/${setup.task.id}`, 'reviewer', 'final-review-pending');
    const finalReviewer = await passAllReviewerPending(setup.task.id);
    artifacts.finalReviewer = finalReviewer;
    await saveJson(join(reportDir, 'final-reviewer-results.json'), finalReviewer);
    await gotoAndShot(page, state, USERS.reviewer, `/reviewer/reviews/${setup.task.id}`, 'reviewer', 'final-review-passed-empty');

    const finalFlow = await taskFlow(setup.task.id);
    const flowLogs = await taskFlowLogs(setup.task.id);
    artifacts.finalFlow = finalFlow;
    artifacts.flowLogs = flowLogs;
    await saveJson(join(reportDir, 'final-flow.json'), finalFlow);
    await saveJson(join(reportDir, 'task-flow-logs.json'), flowLogs);
    if (finalFlow.final?.completed !== expectedCount && finalFlow.counts?.finalCompleted !== expectedCount) {
      const text = JSON.stringify(finalFlow);
      if (!text.includes(`"completed":${expectedCount}`) && !text.includes(`"finalCompleted":${expectedCount}`)) {
        throw new VerificationFailure('Final flow does not show all items completed', { finalFlow, expectedCount });
      }
    }
    await gotoAndShot(page, state, USERS.owner, `/owner/tasks/${setup.task.id}`, 'owner', 'task-completed-flow-and-logs');
    const exportPreview = await verifyExportPreview(input, page, state, setup.task, expectedCount, reportDir);
    artifacts.exportPreview = exportPreview;
    const exports = await createAndVerifyExports(input, setup.task.id, expectedCount, reportDir);
    artifacts.exports = exports;
    await gotoAndShot(page, state, USERS.owner, '/owner/exports', 'owner', 'export-created-and-content-verified');

    await saveJson(join(reportDir, 'verification-artifacts.json'), artifacts);
    await writeFile(join(REPORTS_DIR, reportFileFor(input)), reportMarkdown(input, artifacts, state, true), 'utf8');
    await page.close();
    return { input, reportId, reportFile: join(REPORTS_DIR, reportFileFor(input)), status: '通过', taskId: setup.task.id, itemCount: expectedCount, exportCount: expectedCount };
  } catch (error) {
    const failure = error instanceof VerificationFailure ? error : new VerificationFailure(error.message, { stack: error.stack });
    await saveJson(join(reportDir, 'failure.json'), { message: failure.message, context: failure.context, stack: failure.stack, artifacts });
    try {
      await screenshot(page, state, 'failure', 'error-state');
    } catch {}
    await saveJson(join(reportDir, 'verification-artifacts.json'), artifacts);
    await writeFile(join(REPORTS_DIR, reportFileFor(input)), reportMarkdown(input, artifacts, state, false, failure), 'utf8');
    await page.close();
    throw failure;
  }
}

function reportMarkdown(input, artifacts, state, passed, failure = null) {
  const screenshotLines = state.screenshots.map((shot) => `![${shot.role} ${shot.stage}](./${state.reportId}/screenshots/${shot.fileName})`).join('\n\n');
  const exports = artifacts.exports ?? [];
  const exportLines = exports.map((item) => `- ${item.format}: ${item.rowCount} rows, \`${relative(ROOT, item.copiedPath)}\``).join('\n');
  const evidenceAttachmentLines = evidenceAttachmentMarkdown(input, artifacts, state);
  const evidenceImageLines = evidenceImageMarkdown(input, artifacts, state);
  return `# ${state.reportId} 验证报告

- 输入文件：\`${input.absPath}\`
- 数据集类型：\`${input.datasetKind}\`
- 输入格式：\`${input.format}\`
- 输入题目数：${artifacts.expectedCount ?? '未完成'}
- 导入题目数：${artifacts.items?.length ?? '未完成'}
- 任务 ID：\`${artifacts.task?.id ?? '未创建'}\`
- 任务名称：${artifacts.task?.title ?? '未创建'}
- 模板名称：${artifacts.template?.name ?? '未绑定'}
- 模板版本：${artifacts.template?.schemaVersion ?? '未绑定'}
- 模板来源：${input.datasetKind === 'qa_quality' ? '根据 qa_quality/标注要求.md 搭建并发布的专用模板' : '系统已发布的模型对比模版'}
- Owner：${USERS.owner.name}
- Labeler：${USERS.labeler.name}
- AI Agent：${USERS.agent.name}
- Reviewer：${USERS.reviewer.name}
- AI 首轮打回题：${artifacts.aiRejectExternalId ?? '未完成'}
- Reviewer 字段级打回题：${artifacts.humanRejectExternalId ?? '未完成'}
- 最终任务状态：${passed ? '任务完成' : '失败'}
- 导出格式：${exports.map((item) => item.format).join(', ') || '未完成'}
- 导出题目数：${exports[0]?.rowCount ?? '未完成'}
- 是否通过全流程验收：${passed ? '通过' : '失败'}
${failure ? `- 失败阶段/错误：${failure.message}\n- 失败上下文：\`${JSON.stringify(failure.context).slice(0, 1200)}\`\n` : ''}

## 导出校验

${exportLines || '未完成'}

## 业务证据附件

${evidenceAttachmentLines}

## 业务证据截图

${evidenceImageLines}

## 页面截图证据

${screenshotLines}
`;
}

function evidenceAttachmentMarkdown(input, artifacts, state) {
  if (input.datasetKind !== 'qa_quality') {
    return '- 不适用：preference_compare 模板没有证据附件字段。';
  }
  const evidence = artifacts.evidence;
  if (!evidence?.file) {
    return '- 缺失：qa_quality 证据附件未生成。';
  }
  return [
    `- 上传文件：[\`${evidence.file.name}\`](./${state.reportId}/evidence/${evidence.file.name})`,
    `- MIME：\`${evidence.file.mimeType}\``,
    `- 大小：${evidence.file.size} B`,
    `- 保存值：\`${evidence.file.url}\``,
  ].join('\n');
}

function evidenceImageMarkdown(input, artifacts, state) {
  if (input.datasetKind !== 'qa_quality') {
    return '- 不适用：preference_compare 模板没有证据截图字段。';
  }
  const evidence = artifacts.evidence;
  if (!evidence?.image) {
    return '- 缺失：qa_quality 证据截图未生成。';
  }
  return [
    `- 上传图片：[\`${evidence.image.name}\`](./${state.reportId}/evidence/${evidence.image.name})`,
    `- MIME：\`${evidence.image.mimeType}\``,
    `- 大小：${evidence.image.size} B`,
    `- 保存值：\`${evidence.image.url}\``,
    '',
    `![业务证据截图](./${state.reportId}/evidence/${evidence.image.name})`,
  ].join('\n');
}

function invalidReportMarkdown(results, state) {
  const screenshotLines = state.screenshots.map((shot) => `![${shot.role} ${shot.stage}](./${basename(state.reportDir)}/screenshots/${shot.fileName})`).join('\n\n');
  return `# 异常输入验证报告

${results.map((item) => `- \`${item.invalidInput}\`: HTTP ${item.status}, itemCount=${item.itemCount}`).join('\n')}

## 截图证据

${screenshotLines}
`;
}

async function writeSummary(results, invalidResult, fixedIssues = []) {
  const lines = [];
  lines.push('# 系统验收总览报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 有效输入文件结果');
  lines.push('');
  lines.push('| 输入文件 | 报告 | 状态 | 题目数 | 导出题目数 |');
  lines.push('| --- | --- | --- | ---: | ---: |');
  for (const result of results) {
    lines.push(`| \`${result.input.absPath}\` | [报告](./${basename(result.reportFile)}) | ${result.status} | ${result.itemCount ?? ''} | ${result.exportCount ?? ''} |`);
  }
  lines.push('');
  lines.push('## 异常输入');
  lines.push('');
  if (invalidResult) {
    for (const item of invalidResult.results) {
      lines.push(`- \`${item.invalidInput}\`: HTTP ${item.status}, 生成题目数 ${item.itemCount}`);
    }
  } else {
    lines.push('- 未执行');
  }
  lines.push('');
  lines.push('## 已修复问题');
  lines.push('');
  for (const issue of fixedIssues) lines.push(`- ${issue}`);
  if (fixedIssues.length === 0) lines.push('- 本轮未记录新的代码修复。');
  lines.push('');
  lines.push('## 最终结论');
  lines.push('');
  const allPassed = results.length === VALID_INPUTS.length && results.every((item) => item.status === '通过') && invalidResult?.results.every((item) => item.itemCount === 0 && item.status < 500);
  lines.push(allPassed ? '达到提交标准。' : '未达到提交标准。');
  await writeFile(join(REPORTS_DIR, 'verification-summary.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  await mkdir(REPORTS_DIR, { recursive: true });
  const runToken = `r${nowToken()}`;
  const health = await api('/health');
  await saveJson(join(REPORTS_DIR, `run-${runToken}-health.json`), health);
  const templates = await loadTemplates();
  await saveJson(join(REPORTS_DIR, `run-${runToken}-templates.json`), {
    preferenceTemplate: { id: templates.preferenceTemplate.id, name: templates.preferenceTemplate.name, schemaVersion: templates.preferenceTemplate.schemaVersion },
    qaTemplate: { id: templates.qaTemplate.id, name: templates.qaTemplate.name, schemaVersion: templates.qaTemplate.schemaVersion },
  });

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const fixedIssues = [
    'AI 字段级预审缺失 score 时按 decision 归一化，避免 qa_quality tag_select 字段导致 AI job 失败。',
    'qa_quality 验证脚本真实生成并选择上传证据附件/证据截图，草稿、导出和报告均校验两个证据字段非空。',
  ];
  try {
    for (const input of VALID_INPUTS) {
      const result = await runOneInput(browser, input, templates, runToken);
      results.push(result);
      await writeSummary(results, null, fixedIssues);
    }
    const invalidPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const invalidResult = await verifyInvalidInputs(templates, runToken, invalidPage);
    await invalidPage.close();
    await writeSummary(results, invalidResult, fixedIssues);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ runToken, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
