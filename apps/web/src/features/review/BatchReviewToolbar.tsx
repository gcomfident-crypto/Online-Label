type BatchReviewToolbarProps = {
  selectedCount: number;
  selectedIds: string[];
  totalCount: number;
  isBusy?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchPass: (comment: string) => void;
  onBatchReject: (reason: string) => void;
  onAssign: (reviewerId: string) => void;
};

export const BatchReviewToolbar = ({
  selectedCount,
  selectedIds,
  totalCount,
  isBusy,
  onSelectAll,
  onClearSelection,
  onBatchPass,
  onBatchReject,
  onAssign,
}: BatchReviewToolbarProps) => (
  <section className="review-panel batch-review-toolbar" aria-label="批量复审工具栏">
    <header className="review-panel__heading">
      <div>
        <span>批量</span>
        <h3>批量处理</h3>
      </div>
      <small>{selectedCount}/{totalCount}</small>
    </header>
    <BatchReviewToolbarForm
      selectedCount={selectedCount}
      selectedIds={selectedIds}
      isBusy={isBusy}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      onBatchPass={onBatchPass}
      onBatchReject={onBatchReject}
      onAssign={onAssign}
    />
  </section>
);

const BatchReviewToolbarForm = ({
  selectedCount,
  selectedIds,
  isBusy,
  onSelectAll,
  onClearSelection,
  onBatchPass,
  onBatchReject,
  onAssign,
}: Omit<BatchReviewToolbarProps, 'totalCount'>) => {
  const disabled = selectedCount === 0 || isBusy;

  return (
    <div className="batch-review-toolbar__form">
      <div className="batch-review-toolbar__selection">
        <button type="button" onClick={onSelectAll} disabled={isBusy}>
          全选
        </button>
        <button type="button" onClick={onClearSelection} disabled={isBusy || selectedCount === 0}>
          清空
        </button>
      </div>
      <p>{selectedCount > 0 ? selectedIds.join('、') : '尚未选择待复审提交。'}</p>
      <label>
        统一通过意见
        <textarea data-field="batch-comment" rows={2} placeholder="可选" />
      </label>
      <button
        type="button"
        className="primary-action"
        disabled={disabled}
        onClick={(event) => {
          const form = event.currentTarget.closest('.batch-review-toolbar__form');
          const textarea = form?.querySelector<HTMLTextAreaElement>('[data-field="batch-comment"]');
          onBatchPass(textarea?.value.trim() ?? '');
        }}
      >
        批量通过
      </button>
      <label>
        统一打回理由
        <textarea data-field="batch-reason" rows={2} placeholder="必填" />
      </label>
      <button
        type="button"
        className="danger-action"
        disabled={disabled}
        onClick={(event) => {
          const form = event.currentTarget.closest('.batch-review-toolbar__form');
          const textarea = form?.querySelector<HTMLTextAreaElement>('[data-field="batch-reason"]');
          onBatchReject(textarea?.value.trim() ?? '');
        }}
      >
        批量打回
      </button>
      <label>
        指派审核员
        <input data-field="assign-reviewer" placeholder="user_reviewer_wang_fang" />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          const form = event.currentTarget.closest('.batch-review-toolbar__form');
          const input = form?.querySelector<HTMLInputElement>('[data-field="assign-reviewer"]');
          onAssign(input?.value.trim() ?? '');
        }}
      >
        指派
      </button>
    </div>
  );
};
