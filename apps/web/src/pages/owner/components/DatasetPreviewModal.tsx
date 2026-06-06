import { useEffect, useState } from 'react';

import type { TaskItemDto } from '../../../api/datasets';
import { TableEmptyState } from '../../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../../components/ToastViewport';

type DatasetPreviewModalProps = {
  items: TaskItemDto[];
  isLoading: boolean;
  errorMessage: string | null;
  onClose: () => void;
  coverage?: 'drawer' | 'workspace';
  description?: string;
  closeLabel?: string;
  showItemMeta?: boolean;
  showCloseButton?: boolean;
  tableLabel?: string;
  title?: string;
};

const STATUS_LABELS: Record<TaskItemDto['status'], string> = {
  UNASSIGNED: '未领取',
  ASSIGNED: '已领取',
  COMPLETED: '已完成',
};

export const DatasetPreviewModal = ({
  items,
  isLoading,
  errorMessage,
  onClose,
  coverage = 'drawer',
  description,
  closeLabel = '关闭预览',
  showItemMeta = true,
  showCloseButton = false,
  tableLabel,
  title = '题目数据预览',
}: DatasetPreviewModalProps) => {
  const fields = collectPreviewFields(items);
  const [isClosing, setIsClosing] = useState(false);
  const { dismissToast, messages, showErrorToast } = useToastController();

  useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const closeTimer = window.setTimeout(onClose, 220);

    return () => window.clearTimeout(closeTimer);
  }, [isClosing, onClose]);

  useEffect(() => {
    if (errorMessage) {
      showErrorToast(errorMessage);
    }
  }, [errorMessage, showErrorToast]);

  const requestClose = () => {
    setIsClosing(true);
  };

  return (
    <div
      className={`task-dataset-preview-overlay task-dataset-preview-overlay--${coverage} ${
        isClosing ? 'task-dataset-preview-overlay--closing' : 'task-dataset-preview-overlay--entering'
      }`}
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();

        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <section
        className={`task-dataset-preview-modal ${
          isClosing ? 'task-dataset-preview-modal--closing' : 'task-dataset-preview-modal--entering'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dataset-preview-title"
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target && isClosing) {
            onClose();
          }
        }}
      >
        <header className="task-dataset-preview-modal__header">
          <div>
            <h2 id="task-dataset-preview-title">{title}</h2>
            <p>{description ?? `共 ${items.length.toLocaleString()} 条题目`}</p>
          </div>
          {showCloseButton ? (
            <button
              className="task-dataset-preview-modal__close"
              type="button"
              aria-label={closeLabel}
              onClick={requestClose}
            >
              ×
            </button>
          ) : null}
        </header>

        <div className="task-dataset-preview-modal__body">
          {isLoading ? <div className="task-dataset-preview-empty">正在解析题目数据。</div> : null}
          {!isLoading && !errorMessage && items.length === 0 ? (
            <div className="task-dataset-preview-empty">
              <TableEmptyState title="暂无可预览题目数据" illustrationAlt="空题目数据预览表格插画" />
            </div>
          ) : null}
          {!isLoading && !errorMessage && items.length > 0 ? (
            <div className="task-dataset-preview-table-scroll">
              <table className="task-dataset-preview-table" aria-label={tableLabel}>
                <thead>
                  <tr>
                    {showItemMeta ? (
                      <>
                        <th>序号</th>
                        <th>外部 ID</th>
                        <th>状态</th>
                      </>
                    ) : null}
                    {fields.map((field) => (
                      <th key={field}>{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {showItemMeta ? (
                        <>
                          <td>{item.sortOrder}</td>
                          <td>{item.externalId}</td>
                          <td>{STATUS_LABELS[item.status]}</td>
                        </>
                      ) : null}
                      {fields.map((field) => (
                        <td key={field}>{formatPreviewCell(item.rawData[field])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

const collectPreviewFields = (items: TaskItemDto[]): string[] => {
  const fields = new Set<string>();

  for (const item of items) {
    for (const field of Object.keys(item.rawData)) {
      fields.add(field);
    }
  }

  return Array.from(fields);
};

const formatPreviewCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};
