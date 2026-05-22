import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  DATASET_IMPORT_FORMATS,
  DATASET_KINDS,
  type DatasetImportFormat,
  type DatasetKind,
  type DatasetRecord,
} from '@labelhub/shared';
import {
  importTaskItems,
  importTaskItemsZip,
  listTaskItems,
  updateTaskItem,
  type DatasetImportSummaryDto,
  type TaskItemDto,
} from '../../api/datasets';
import { getTask, type TaskDto } from '../../api/tasks';
import { DatasetPreviewTable } from './components/DatasetPreviewTable';

const FORMAT_LABELS: Record<DatasetImportFormat, string> = {
  json: 'JSON',
  jsonl: 'JSONL',
  xlsx: 'Excel',
  zip: '官方 zip',
};

const DATASET_KIND_LABELS: Record<DatasetKind, string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

export const DatasetImportPage = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [items, setItems] = useState<TaskItemDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [datasetKind, setDatasetKind] = useState<DatasetKind>('qa_quality');
  const [format, setFormat] = useState<DatasetImportFormat>('jsonl');
  const [fileName, setFileName] = useState('dataset.jsonl');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<DatasetImportSummaryDto | null>(null);
  const [bulkField, setBulkField] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setErrorMessage('缺少任务 ID，无法加载题目数据。');
      setIsLoading(false);
      return;
    }

    void loadDatasetPage(taskId);
  }, [taskId]);

  useEffect(() => {
    setFileName(defaultFileName(format));
  }, [format]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const unassignedCount = useMemo(
    () => items.filter((item) => item.status === 'UNASSIGNED').length,
    [items],
  );

  const loadDatasetPage = async (id: string) => {
    setIsLoading(true);
    try {
      const [nextTask, nextItems] = await Promise.all([getTask(id), listTaskItems(id)]);
      setTask(nextTask);
      setItems(nextItems);
      setDatasetKind(resolveDatasetKind(nextTask.template.name));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '题目数据加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const reloadItems = async () => {
    if (!taskId) {
      return;
    }

    const nextItems = await listTaskItems(taskId);
    setItems(nextItems);
    setSelectedIds(new Set());
  };

  const handleImport = async () => {
    if (!taskId) {
      setErrorMessage('缺少任务 ID，无法导入。');
      return;
    }

    setIsImporting(true);
    try {
      const summary =
        format === 'zip'
          ? await importTaskItemsZip(taskId, {
              fileName: selectedFile?.name ?? fileName,
              contentBase64: await resolveBase64Content(selectedFile),
            })
          : await importTaskItems(taskId, {
              datasetKind,
              format,
              fileName: selectedFile?.name ?? fileName,
              ...(format === 'xlsx'
                ? { contentBase64: await resolveBase64Content(selectedFile) }
                : { content: selectedFile ? await selectedFile.text() : content }),
            });

      setImportSummary(summary);
      await reloadItems();
      setStatusMessage(`已导入 ${summary.importedCount.toLocaleString()} 条题目。`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '题目导入失败。');
    } finally {
      setIsImporting(false);
    }
  };

  const updateItem = async (itemId: string, patch: DatasetRecord) => {
    const updatedItem = await updateTaskItem(itemId, patch);
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    setStatusMessage('题目已保存。');
    setErrorMessage(null);
  };

  const handleBulkEdit = async () => {
    if (!bulkField.trim()) {
      setErrorMessage('请填写批量字段名。');
      return;
    }

    setIsBulkSaving(true);
    try {
      const value = parseBulkValue(bulkValue);
      const updatedItems = await Promise.all(
        selectedItems.map((item) => updateTaskItem(item.id, { [bulkField.trim()]: value })),
      );
      setItems((current) =>
        current.map((item) => updatedItems.find((updated) => updated.id === item.id) ?? item),
      );
      setSelectedIds(new Set());
      setStatusMessage(`已批量更新 ${updatedItems.length.toLocaleString()} 条题目。`);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量编辑失败。');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <section className="dataset-import-page" aria-labelledby="dataset-import-title">
        <h1 id="dataset-import-title">数据导入</h1>
        <p>正在加载任务题目。</p>
      </section>
    );
  }

  return (
    <section className="dataset-import-page" aria-labelledby="dataset-import-title">
      <div className="dataset-import-header">
        <div>
          <Link className="primary-link" to={task ? `/owner/tasks/${task.id}` : '/owner/tasks'}>
            返回任务详情
          </Link>
          <p className="eyebrow">Owner / 数据导入</p>
          <h1 id="dataset-import-title">题目数据导入</h1>
          <p>{task ? `${task.title} · ${task.template.name}` : '选择任务后导入官方题目数据。'}</p>
        </div>
        <dl>
          <div>
            <dt>题目总数</dt>
            <dd>{items.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>未领取</dt>
            <dd>{unassignedCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>本次导入</dt>
            <dd>{importSummary?.importedCount.toLocaleString() ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span role="alert">{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="dataset-import-layout">
        <form
          className="dataset-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleImport();
          }}
        >
          <h2>导入配置</h2>
          <label>
            数据集类型
            <select
              aria-label="数据集类型"
              value={datasetKind}
              disabled={format === 'zip'}
              onChange={(event) => setDatasetKind(event.target.value as DatasetKind)}
            >
              {DATASET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DATASET_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件格式
            <select
              aria-label="文件格式"
              value={format}
              onChange={(event) => setFormat(event.target.value as DatasetImportFormat)}
            >
              {DATASET_IMPORT_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {FORMAT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            文件名
            <input
              aria-label="文件名"
              value={selectedFile?.name ?? fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
          </label>
          <label>
            上传文件
            <input
              aria-label="上传文件"
              type="file"
              accept=".json,.jsonl,.xlsx,.zip,application/json"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {format === 'json' || format === 'jsonl' ? (
            <label>
              文本内容
              <textarea
                aria-label="文本内容"
                value={content}
                placeholder='{"id":"Q0001","prompt":"请评估回答质量","model_answer":"示例回答"}'
                onChange={(event) => setContent(event.target.value)}
              />
            </label>
          ) : (
            <div className="dataset-import-note">
              Excel 和 zip 需要选择本地文件，系统会以 base64 方式提交给导入接口。
            </div>
          )}
          <button className="primary-action" type="submit" disabled={isImporting}>
            {isImporting ? '导入中' : '导入数据'}
          </button>
        </form>

        <section className="dataset-import-summary" aria-label="导入结果">
          <h2>导入结果</h2>
          {importSummary ? (
            <>
              <div className="dataset-result-grid">
                <div>
                  <span>Profile</span>
                  <strong>{DATASET_KIND_LABELS[importSummary.datasetKind]}</strong>
                </div>
                <div>
                  <span>成功行数</span>
                  <strong>{importSummary.importedCount.toLocaleString()}</strong>
                </div>
                <div>
                  <span>错误行数</span>
                  <strong>{importSummary.errorCount.toLocaleString()}</strong>
                </div>
              </div>
              <section>
                <h3>字段</h3>
                <div className="dataset-chip-list">
                  {importSummary.fields.map((field) => (
                    <span key={field}>{field}</span>
                  ))}
                </div>
              </section>
              <section>
                <h3>文件明细</h3>
                <ul>
                  {importSummary.files.map((file) => (
                    <li key={`${file.fileName}-${file.format}`}>
                      {file.fileName} · {FORMAT_LABELS[file.format]} · 成功 {file.importedCount} / 错误{' '}
                      {file.errorCount}
                    </li>
                  ))}
                </ul>
              </section>
              {importSummary.skippedFiles.length > 0 ? (
                <section>
                  <h3>跳过文件</h3>
                  <ul>
                    {importSummary.skippedFiles.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {importSummary.errors.length > 0 ? (
                <section>
                  <h3>错误行</h3>
                  <ul>
                    {importSummary.errors.slice(0, 6).map((error, index) => (
                      <li key={`${error.fileName}-${index}`}>
                        {error.fileName}
                        {error.lineNumber ? ` 第 ${error.lineNumber} 行` : ''}
                        {error.rowNumber ? ` 第 ${error.rowNumber} 行` : ''}：{error.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <p>导入后会显示 profile、行数、字段、跳过文件和错误明细。</p>
          )}
        </section>
      </div>

      <section className="dataset-bulk-panel" aria-label="批量编辑">
        <div>
          <h2>题目预览与批量编辑</h2>
          <p>已选择 {selectedIds.size.toLocaleString()} 条未领取题目。</p>
        </div>
        <label>
          字段名
          <input
            aria-label="批量字段名"
            value={bulkField}
            placeholder="tags"
            onChange={(event) => setBulkField(event.target.value)}
          />
        </label>
        <label>
          字段值
          <input
            aria-label="批量字段值"
            value={bulkValue}
            placeholder='["官方数据","复核"]'
            onChange={(event) => setBulkValue(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={selectedIds.size === 0 || isBulkSaving}
          onClick={() => void handleBulkEdit()}
        >
          批量写入字段
        </button>
      </section>

      <DatasetPreviewTable
        items={items}
        selectedIds={selectedIds}
        onToggleItem={toggleItem}
        onUpdateItem={updateItem}
      />
    </section>
  );
};

const defaultFileName = (format: DatasetImportFormat): string => {
  return format === 'zip' ? 'datasets.zip' : `dataset.${format}`;
};

const resolveDatasetKind = (templateName: string): DatasetKind => {
  if (templateName.includes('偏好')) {
    return 'preference_compare';
  }

  if (templateName.includes('问答')) {
    return 'qa_quality';
  }

  return 'generic_json';
};

const resolveBase64Content = async (file: File | null): Promise<string> => {
  if (!file) {
    return '';
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(new Error('文件读取失败。')));
    reader.readAsDataURL(file);
  });

  return dataUrl.split(',')[1] ?? '';
};

const parseBulkValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};
