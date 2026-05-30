import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestApi } from './request';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestApi', () => {
  it('返回响应包裹中的 data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: ['task-1'] })),
    );

    await expect(requestApi<string[]>('/tasks', { method: 'GET' }, '任务接口请求失败。')).resolves.toEqual([
      'task-1',
    ]);
  });

  it('空的错误响应不会抛出浏览器 JSON 解析异常', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(requestApi('/tasks', { method: 'GET' }, '任务接口请求失败。')).rejects.toThrow(
      '任务接口请求失败。（HTTP 500）。',
    );
  });

  it('非 JSON 的成功响应会抛出业务错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    );

    await expect(requestApi('/tasks', { method: 'GET' }, '任务接口请求失败。')).rejects.toThrow(
      '任务接口请求失败。 接口返回内容不是有效 JSON。',
    );
  });

  it('网络失败时提示确认后端服务状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(requestApi('/tasks', { method: 'GET' }, '任务接口请求失败。')).rejects.toThrow(
      '任务接口请求失败。 请确认后端服务已启动。',
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
