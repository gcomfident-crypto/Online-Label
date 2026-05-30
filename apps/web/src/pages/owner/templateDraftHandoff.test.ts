import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY,
  consumeTemplateDraftHandoff,
} from './templateDraftHandoff';

const originalSessionStorage = window.sessionStorage;

const validHandoff = {
  name: '自动解析模板',
  schema: {
    schemaVersion: 'auto-draft',
    datasetKind: 'generic_json',
    fields: [
      {
        key: 'auto_show_item',
        type: 'show_item',
        label: 'items.json',
      },
    ],
  },
};

describe('templateDraftHandoff', () => {
  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    });
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('拒绝包含非记录 previewRecords 的模板草稿交接数据', () => {
    window.sessionStorage.setItem(
      TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY,
      JSON.stringify({
        ...validHandoff,
        previewRecords: [null, 1, 'bad'],
      }),
    );

    expect(consumeTemplateDraftHandoff()).toBeNull();
  });

  it('拒绝 schema.fields 中包含非字段对象的模板草稿交接数据', () => {
    window.sessionStorage.setItem(
      TEMPLATE_DRAFT_HANDOFF_STORAGE_KEY,
      JSON.stringify({
        ...validHandoff,
        schema: {
          ...validHandoff.schema,
          fields: [null, 1, 'bad'],
        },
      }),
    );

    expect(consumeTemplateDraftHandoff()).toBeNull();
  });

  it('读取 sessionStorage 失败时返回 null', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Blocked storage', 'SecurityError');
      },
    });

    expect(consumeTemplateDraftHandoff()).toBeNull();
  });
});
