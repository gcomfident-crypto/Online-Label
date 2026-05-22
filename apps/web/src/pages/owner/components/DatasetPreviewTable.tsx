import { useEffect, useState } from 'react';

import type { DatasetRecord } from '@labelhub/shared';
import type { TaskItemDto } from '../../../api/datasets';

type DatasetPreviewTableProps = {
  items: TaskItemDto[];
  selectedIds: Set<string>;
  onToggleItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, patch: DatasetRecord) => Promise<void>;
};

export const DatasetPreviewTable = ({
  items,
  selectedIds,
  onToggleItem,
  onUpdateItem,
}: DatasetPreviewTableProps) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingJson, setEditingJson] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!editingItemId) {
      setEditingJson('');
      return;
    }

    const item = items.find((candidate) => candidate.id === editingItemId);
    setEditingJson(item ? JSON.stringify(item.rawData, null, 2) : '');
    setErrorMessage(null);
  }, [editingItemId, items]);

  const saveEditingItem = async () => {
    if (!editingItemId) {
      return;
    }

    try {
      const parsed = JSON.parse(editingJson) as unknown;
      if (!isDatasetRecord(parsed)) {
        setErrorMessage('JSON 必须是对象。');
        return;
      }

      await onUpdateItem(editingItemId, parsed);
      setEditingItemId(null);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '题目保存失败。');
    }
  };

  if (items.length === 0) {
    return (
      <div className="dataset-empty-state">
        <strong>暂无题目数据</strong>
        <span>导入 JSON、JSONL、Excel 或官方 zip 后会在这里显示预览。</span>
      </div>
    );
  }

  return (
    <div className="dataset-preview-shell">
      <div className="dataset-table-scroll">
        <table className="dataset-preview-table" aria-label="题目预览">
          <thead>
            <tr>
              <th>选择</th>
              <th>顺序</th>
              <th>外部 ID</th>
              <th>状态</th>
              <th>数据摘要</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`选择 ${item.externalId}`}
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    disabled={item.status !== 'UNASSIGNED'}
                    onChange={() => onToggleItem(item.id)}
                  />
                </td>
                <td>{item.sortOrder}</td>
                <td>
                  <strong>{item.externalId}</strong>
                  <small>{item.datasetKind}</small>
                </td>
                <td>{TASK_ITEM_STATUS_LABELS[item.status]}</td>
                <td>
                  <pre>{summarizeRecord(item.rawData)}</pre>
                </td>
                <td>
                  <button
                    type="button"
                    disabled={item.status !== 'UNASSIGNED'}
                    onClick={() => setEditingItemId(item.id)}
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingItemId ? (
        <div className="dataset-edit-panel" aria-label="编辑题目 JSON">
          <div>
            <h2>编辑题目 JSON</h2>
            <p>保存后会以对象合并方式更新 rawData，已领取题目不可编辑。</p>
          </div>
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
          <textarea
            aria-label="题目 JSON"
            value={editingJson}
            onChange={(event) => setEditingJson(event.target.value)}
          />
          <div className="dataset-edit-panel__actions">
            <button type="button" onClick={() => setEditingItemId(null)}>
              取消
            </button>
            <button className="primary-action" type="button" onClick={() => void saveEditingItem()}>
              保存题目
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const TASK_ITEM_STATUS_LABELS: Record<TaskItemDto['status'], string> = {
  UNASSIGNED: '未领取',
  ASSIGNED: '已领取',
  COMPLETED: '已完成',
};

const summarizeRecord = (record: DatasetRecord): string => {
  return JSON.stringify(record, null, 2).slice(0, 360);
};

const isDatasetRecord = (value: unknown): value is DatasetRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
