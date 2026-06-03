import type { TemplateVersionDto } from '../../../api/templates';

type TemplateRestoreConfirmDialogProps = {
  isRestoring: boolean;
  targetVersion: TemplateVersionDto;
  hasActiveLaterVersionUsage: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const TemplateRestoreConfirmDialog = ({
  hasActiveLaterVersionUsage,
  isRestoring,
  onCancel,
  onConfirm,
  targetVersion,
}: TemplateRestoreConfirmDialogProps) => (
  <div className="template-version-restore-confirm" role="dialog" aria-modal="true" aria-labelledby="template-version-restore-title">
    <div className="template-version-restore-confirm__panel">
      <h2 id="template-version-restore-title">确认恢复版本</h2>
      <p>
        {hasActiveLaterVersionUsage
          ? `v${targetVersion.version} 之后的部分版本正在被未完成任务使用。恢复后，这些任务仍会继续使用原版本；相关版本不会被删除，只会从模板主版本链中归档。请确认是否继续？`
          : `恢复到 v${targetVersion.version} 后，v${targetVersion.version} 之后的版本将被归档，不再作为当前可用版本展示。请确认是否继续？`}
      </p>
      <div className="template-version-restore-confirm__actions">
        <button type="button" disabled={isRestoring} onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary-action" disabled={isRestoring} onClick={onConfirm}>
          确认恢复
        </button>
      </div>
    </div>
  </div>
);
