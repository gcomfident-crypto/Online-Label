import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiSrcDir = resolve(rootDir, 'apps/api/src');
const openApiPath = resolve(rootDir, 'docs/api/openapi.yaml');
const demoCollectionPath = resolve(rootDir, 'docs/api/postman/labelhub-demo.postman_collection.json');
const fullCollectionPath = resolve(rootDir, 'docs/api/postman/labelhub-full.postman_collection.json');
const localEnvPath = resolve(rootDir, 'docs/api/postman/labelhub-local.postman_environment.json');
const prodEnvPath = resolve(rootDir, 'docs/api/postman/labelhub-prod.postman_environment.json');
const reportPath = resolve(rootDir, 'docs/api/postman/verification-report.md');

const requiredVariables = [
  'baseUrl',
  'ownerToken',
  'labelerToken',
  'secondLabelerToken',
  'reviewerToken',
  'agentToken',
  'ownerPassword',
  'ownerId',
  'labelerId',
  'secondLabelerId',
  'reviewerId',
  'agentId',
  'templateId',
  'versionId',
  'taskId',
  'taskItemId',
  'assignmentId',
  'submissionId',
  'batchId',
  'jobId',
  'exportId',
  'idempotencyKey',
  'zipContentBase64',
];

const requiredTokenScripts = ['ownerToken', 'labelerToken', 'secondLabelerToken', 'agentToken', 'reviewerToken'];

const expectedDemoRoutes = [
  'GET /health',
  'POST /auth/login',
  'GET /me',
  'POST /templates/from-profile',
  'GET /templates',
  'GET /templates/{id}',
  'POST /templates/{id}/publish',
  'POST /tasks',
  'GET /tasks',
  'GET /tasks/{id}',
  'PATCH /tasks/{id}/status',
  'GET /tasks/{id}/audit-logs',
  'POST /tasks/{taskId}/items/import',
  'GET /tasks/{taskId}/items',
  'GET /labeler/tasks',
  'POST /assignments/claim',
  'GET /assignments/{assignmentId}/workbench',
  'GET /drafts/{assignmentId}',
  'PUT /drafts/{assignmentId}',
  'POST /submissions/task',
  'GET /ai-review/batches',
  'GET /ai-review/batches/{batchId}',
  'GET /submissions/{submissionId}/ai-review',
  'GET /reviews/pending/tasks',
  'GET /reviews/pending',
  'GET /reviews/{assignmentId}/rounds',
  'GET /reviews/{assignmentId}/diff',
  'GET /reviews/{submissionId}',
  'GET /reviews/{submissionId}/timeline',
  'POST /reviews/{submissionId}/start',
  'POST /reviews/{submissionId}/pass',
  'POST /reviews/{submissionId}/reject',
  'POST /exports',
  'GET /exports',
  'GET /exports/{id}',
  'GET /exports/{id}/download',
  'GET /tasks/{taskId}/export-preview',
  'GET /agent/task-flows',
  'GET /agent/task-flows/{taskId}',
  'GET /agent/task-flows/{taskId}/logs',
  'POST /llm/assist',
].sort();

const forbiddenDemoRoutes = [
  'GET /debug/sample-schema',
  'GET /debug/seed-status',
  'GET /debug/tasks',
  'GET /debug/users',
  'POST /llm/assist/mock',
  'POST /schema/validate',
  'GET /tasks/summaries',
  'PATCH /tasks/{id}',
  'DELETE /tasks/{id}',
  'PATCH /tasks/{id}/review-stage-config',
  'POST /tasks/{taskId}/items/import-zip',
  'PATCH /task-items/{id}',
  'GET /templates/{id}/versions',
  'GET /templates/{id}/versions/{versionId}/diff',
  'POST /templates/{id}/versions/{versionId}/restore',
  'POST /reviews/batch-pass',
  'POST /reviews/batch-reject',
  'POST /reviews/assign',
  'POST /ai-review/jobs/{id}/retry',
  'POST /ai-review/jobs/{id}/complete',
  'POST /exports/{id}/retry',
].sort();

const controllerRoutes = await scanControllerRoutes(apiSrcDir);
const openApiRoutes = parseOpenApiRoutes(await readFile(openApiPath, 'utf8'));
const demoCollection = JSON.parse(await readFile(demoCollectionPath, 'utf8'));
const fullCollection = JSON.parse(await readFile(fullCollectionPath, 'utf8'));
const demoRoutes = parseCollectionRoutes(demoCollection);
const fullRoutes = parseCollectionRoutes(fullCollection);
const localEnv = JSON.parse(await readFile(localEnvPath, 'utf8'));
const prodEnv = JSON.parse(await readFile(prodEnvPath, 'utf8'));

const failures = [];

assertRouteSetEqual('controller -> openapi', controllerRoutes, openApiRoutes, failures);
assertRouteSetEqual('openapi -> full collection', openApiRoutes, fullRoutes, failures);
assertRouteSetEqual('expected demo -> demo collection', expectedDemoRoutes, demoRoutes, failures);
assertForbiddenDemoRoutes(demoRoutes, failures);
assertCollectionShape('demo collection', demoCollection, failures);
assertCollectionShape('full collection', fullCollection, failures);
assertVisibleQueryParams('demo collection', demoCollection, failures);
assertVisibleQueryParams('full collection', fullCollection, failures);
assertEnvironment('local', localEnv, failures);
assertEnvironment('prod', prodEnv, failures);
assertTokenScripts('demo collection', demoCollection, failures);
assertTokenScripts('full collection', fullCollection, failures);

const report = buildReport({
  controllerRoutes,
  openApiRoutes,
  demoRoutes,
  fullRoutes,
  failures,
});
await writeFile(reportPath, report, 'utf8');

if (failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);

async function scanControllerRoutes(dir) {
  const files = await listFiles(dir);
  const routes = [];

  for (const file of files.filter((item) => item.endsWith('.controller.ts'))) {
    const content = await readFile(file, 'utf8');
    const prefixMatch = content.match(/@Controller\(([^)]*)\)/);
    const prefix = prefixMatch ? decoratorPath(prefixMatch[1]) : '';
    const routeRegex = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;
    let match;

    while ((match = routeRegex.exec(content))) {
      const method = match[1].toUpperCase();
      const childPath = decoratorPath(match[2]);
      routes.push(`${method} ${normalizePath(`${prefix}/${childPath}`)}`);
    }
  }

  return [...new Set(routes)].sort();
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return extname(fullPath) === '.ts' ? [fullPath] : [];
  }));
  return files.flat();
}

function decoratorPath(source) {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const stringMatch = trimmed.match(/^['"`]([^'"`]*)['"`]$/);
  return stringMatch ? stringMatch[1] : '';
}

function normalizePath(path) {
  return `/${path}`
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}') || '/';
}

function parseOpenApiRoutes(yaml) {
  const routes = [];
  let currentPath = null;

  for (const line of yaml.split('\n')) {
    const pathMatch = line.match(/^  "?(\/[^":]+)"?:\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (currentPath && methodMatch) {
      routes.push(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }

  return [...new Set(routes)].sort();
}

function parseCollectionRoutes(collection) {
  const routes = [];

  const visit = (items = []) => {
    for (const item of items) {
      if (item.request) {
        const description = typeof item.request.description === 'string'
          ? item.request.description
          : item.request.description?.content ?? '';
        const match = description.match(/^([A-Z]+) (\/[^\n]+)/);
        if (match) routes.push(`${match[1]} ${match[2]}`);
      }
      if (item.item) visit(item.item);
    }
  };

  visit(collection.item);
  return [...new Set(routes)].sort();
}

function assertRouteSetEqual(label, left, right, failures) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const missing = left.filter((route) => !rightSet.has(route));
  const extra = right.filter((route) => !leftSet.has(route));

  for (const route of missing) failures.push(`${label}: missing ${route}`);
  for (const route of extra) failures.push(`${label}: extra ${route}`);
}

function assertForbiddenDemoRoutes(routes, failures) {
  const routeSet = new Set(routes);

  for (const route of forbiddenDemoRoutes) {
    if (routeSet.has(route)) failures.push(`demo collection exposes forbidden route ${route}`);
  }
}

function assertCollectionShape(label, collection, failures) {
  if (collection.info?.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') {
    failures.push(`${label}: schema is not Postman Collection v2.1`);
  }

  if (!Array.isArray(collection.item) || collection.item.length === 0) {
    failures.push(`${label}: no folders/items`);
  }
}

function assertVisibleQueryParams(label, collection, failures) {
  const visit = (items = [], folderPath = []) => {
    for (const item of items) {
      if (item.request) {
        const requestName = [...folderPath, item.name].join(' / ');
        for (const queryParam of item.request.url?.query ?? []) {
          if (queryParam.disabled === true) {
            failures.push(`${label}: query param is disabled in ${requestName}: ${queryParam.key}`);
          }

          if (typeof queryParam.value !== 'string' || queryParam.value.trim() === '') {
            failures.push(`${label}: query param has empty value in ${requestName}: ${queryParam.key}`);
          }
        }
      }

      if (item.item) visit(item.item, [...folderPath, item.name]);
    }
  };

  visit(collection.item);
}

function assertEnvironment(label, env, failures) {
  const keys = new Set((env.values ?? []).map((item) => item.key));

  for (const variable of requiredVariables) {
    if (!keys.has(variable)) failures.push(`${label} environment missing ${variable}`);
  }
}

function assertTokenScripts(label, collection, failures) {
  const scriptLines = [];

  const visit = (items = []) => {
    for (const item of items) {
      for (const event of item.event ?? []) {
        if (event.listen === 'test' && Array.isArray(event.script?.exec)) {
          scriptLines.push(...event.script.exec);
        }
      }
      if (item.item) visit(item.item);
    }
  };

  visit(collection.item);
  const scripts = scriptLines.join('\n');

  for (const tokenVar of requiredTokenScripts) {
    if (!scripts.includes(`pm.environment.set(${JSON.stringify(tokenVar)}`)) {
      failures.push(`${label}: login script missing ${tokenVar}`);
    }
  }
}

function buildReport({ controllerRoutes, openApiRoutes, demoRoutes, fullRoutes, failures }) {
  const lines = [
    '# LabelHub Postman 文档验证报告',
    '',
    `验证时间：${new Date().toISOString()}`,
    '',
    `Controller 路由数：${controllerRoutes.length}`,
    `OpenAPI 路由数：${openApiRoutes.length}`,
    `Full Collection 路由数：${fullRoutes.length}`,
    `Demo Collection 路由数：${demoRoutes.length}`,
    '',
    failures.length === 0
      ? '结论：通过。Full Collection 覆盖全部 controller 路由；Demo Collection 仅包含主流程白名单；环境变量和登录 token 脚本完整。'
      : '结论：失败。',
    '',
  ];

  if (failures.length > 0) {
    lines.push('## 失败项', '');
    for (const failure of failures) lines.push(`- ${failure}`);
    lines.push('');
  }

  lines.push('## Demo Collection 路由清单', '');
  for (const route of demoRoutes) lines.push(`- ${route}`);
  lines.push('', '## Full Collection 路由清单', '');
  for (const route of fullRoutes) lines.push(`- ${route}`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}
