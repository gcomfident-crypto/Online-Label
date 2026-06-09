import { useEffect, useMemo, useState } from 'react';

import {
  diffTemplateVersion,
  listTemplateVersions,
  restoreTemplateVersion,
  type RestoreTemplateVersionResponse,
  type TemplateDto,
  type TemplateVersionDiff,
  type TemplateVersionDto,
} from '../../../api/templates';
import diffIcon from '../../../assets/diff.svg';
import recoverIcon from '../../../assets/recover.svg';
import { TemplateRestoreConfirmDialog } from './TemplateRestoreConfirmDialog';
import { TemplateVersionSideBySideDiffView } from './TemplateVersionSideBySideDiffView';

type TemplateVersionManagerModalProps = {
  template: TemplateDto;
  onClose: () => void;
  onRestored: (result: RestoreTemplateVersionResponse) => void;
};

const VERSION_MODAL_CLOSE_ANIMATION_MS = 220;

export const TemplateVersionManagerModal = ({
  onClose,
  onRestored,
  template,
}: TemplateVersionManagerModalProps) => {
  const [versions, setVersions] = useState<TemplateVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [diff, setDiff] = useState<TemplateVersionDiff | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TemplateVersionDto | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isVersionListCollapsed, setIsVersionListCollapsed] = useState(false);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [selectedVersionId, versions],
  );
  const currentVersion = useMemo(
    () => versions.find((version) => version.isCurrent) ?? versions[0] ?? null,
    [versions],
  );
  const isVersionChainLocked = versions.some((version) => version.activeUsageCount > 0);
  const hasActiveLaterVersionUsage = Boolean(
    restoreTarget &&
      versions.some(
        (version) => version.version > restoreTarget.version && version.activeUsageCount > 0,
      ),
  );
  const shouldShowDiff = isLoadingDiff || diff !== null;
  const diffTitle =
    selectedVersion && currentVersion && !selectedVersion.isCurrent
      ? `${formatVersionLabel(selectedVersion)} 对比 ${formatVersionLabel(currentVersion)}`
      : '版本差异';

  useEffect(() => {
    let isMounted = true;

    setIsLoadingVersions(true);
    setErrorMessage(null);
    setDiff(null);
    setIsVersionListCollapsed(false);
    void listTemplateVersions(template.id)
      .then((nextVersions) => {
        if (!isMounted) {
          return;
        }

        setVersions(nextVersions);
        setSelectedVersionId(nextVersions.find((version) => version.isCurrent)?.id ?? nextVersions[0]?.id ?? null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setVersions([]);
        setSelectedVersionId(null);
        setErrorMessage(error instanceof Error ? error.message : '模板版本加载失败，请稍后重试。');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingVersions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [template.id]);

  useEffect(() => {
    if (!isClosing) {
      return undefined;
    }

    const closeTimer = window.setTimeout(onClose, VERSION_MODAL_CLOSE_ANIMATION_MS);

    return () => window.clearTimeout(closeTimer);
  }, [isClosing, onClose]);

  const requestClose = () => {
    setIsClosing(true);
  };

  const handleSelectVersion = (version: TemplateVersionDto) => {
    setSelectedVersionId(version.id);
    setDiff(null);
    setIsLoadingDiff(false);
    setIsVersionListCollapsed(false);
  };

  const handleDiff = async (version: TemplateVersionDto) => {
    setSelectedVersionId(version.id);
    if (version.isCurrent) {
      setDiff(null);
      setIsVersionListCollapsed(false);
      return;
    }

    setIsLoadingDiff(true);
    setErrorMessage(null);

    try {
      setDiff(await diffTemplateVersion(template.id, version.id));
      setIsVersionListCollapsed(true);
    } catch (error) {
      setDiff(null);
      setIsVersionListCollapsed(false);
      setErrorMessage(error instanceof Error ? error.message : '版本差异加载失败，请稍后重试。');
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) {
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);

    try {
      const result = await restoreTemplateVersion(template.id, restoreTarget.id);
      const nextVersions = await listTemplateVersions(result.restoredTemplate.id);

      setVersions(nextVersions);
      setSelectedVersionId(result.restoredTemplate.id);
      setRestoreTarget(null);
      setDiff(null);
      setIsVersionListCollapsed(false);
      onRestored(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '版本恢复失败，请稍后重试。');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      className={`template-version-modal ${
        isClosing ? 'template-version-modal--closing' : 'template-version-modal--entering'
      }`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        className="template-version-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-version-modal-title"
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target && isClosing) {
            onClose();
          }
        }}
      >
        <header className="template-version-modal__header">
          <div>
            <h2 id="template-version-modal-title">模板版本管理</h2>
            <p>
              {template.name} · 当前版本 {formatVersionLabel(template)}
            </p>
          </div>
          <button type="button" aria-label="关闭版本管理" onClick={requestClose}>
            ×
          </button>
        </header>

        {errorMessage ? <p className="template-version-modal__error">{errorMessage}</p> : null}

        <div className="template-version-modal__body">
          <section
            className={`template-version-modal__list ${
              isVersionListCollapsed
                ? 'template-version-modal__list--collapsed'
                : 'template-version-modal__list--expanded'
            }`}
            aria-label="模板历史版本"
          >
            {isLoadingVersions ? <p className="template-version-modal__empty">版本加载中...</p> : null}
            {!isLoadingVersions && versions.length === 0 ? (
              <p className="template-version-modal__empty">暂无历史版本</p>
            ) : null}
            {!isLoadingVersions && versions.length > 0 ? (
              isVersionListCollapsed && selectedVersion && currentVersion && !selectedVersion.isCurrent ? (
                <section
                  className="template-version-list-summary"
                  aria-label="历史版本列表摘要"
                >
                  <span className="template-version-list-summary__title">历史版本列表</span>
                  <span className="template-version-list-summary__meta">
                    正在对比 {formatVersionLabel(selectedVersion)} 和当前 {formatVersionLabel(currentVersion)}
                  </span>
                  <button
                    className="template-version-list-summary__expand"
                    type="button"
                    onClick={() => setIsVersionListCollapsed(false)}
                  >
                    展开列表
                  </button>
                </section>
              ) : (
                <div className="template-version-table-scroll">
                  <table className="template-version-table" aria-label="模板历史版本列表">
                    <thead>
                      <tr>
                        <th>版本</th>
                        <th>发布时间</th>
                        <th>发布人</th>
                        <th>占用状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((version) => (
                        <tr
                          key={version.id}
                          className={selectedVersion?.id === version.id ? 'is-selected' : undefined}
                        >
                          <td>
                            <button
                              className="template-version-table__version-button"
                              type="button"
                              onClick={() => handleSelectVersion(version)}
                            >
                              {formatVersionLabel(version)}
                            </button>
                          </td>
                          <td>{formatDateTime(version.publishedAt ?? version.createdAt)}</td>
                          <td>{formatPublisher(version.createdById)}</td>
                          <td>
                            <span
                              className={`status-tag status-tag--sm status-tag--task template-version-table__occupy-status ${
                                version.activeUsageCount > 0
                                  ? 'template-version-table__occupy-status--occupied'
                                  : 'template-version-table__occupy-status--idle'
                              }`}
                            >
                              <span className="status-tag__dot" aria-hidden="true" />
                              {version.activeUsageCount > 0 ? '占用中' : '空闲中'}
                            </span>
                          </td>
                          <td>
                            <div className="template-version-table__actions">
                              {!version.isCurrent ? (
                                <>
                                  <button
                                    className="template-manager-row-action template-version-table__icon-action"
                                    type="button"
                                    aria-label="Diff"
                                    title="Diff"
                                    onClick={() => void handleDiff(version)}
                                  >
                                    <TemplateVersionActionIcon src={diffIcon} />
                                  </button>
                                  <button
                                    className="template-manager-row-action template-version-table__icon-action"
                                    type="button"
                                    aria-label="恢复"
                                    title={
                                      isVersionChainLocked
                                        ? '模板正在被未完成任务使用，暂不可恢复历史版本'
                                        : '恢复'
                                    }
                                    disabled={isVersionChainLocked}
                                    onClick={() => {
                                      if (isVersionChainLocked) {
                                        return;
                                      }

                                      setRestoreTarget(version);
                                    }}
                                  >
                                    <TemplateVersionActionIcon src={recoverIcon} />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </section>
          {shouldShowDiff ? (
            <section className="template-version-modal__detail" aria-label="版本差异">
              <div className="template-version-modal__detail-header">
                <h3>{diffTitle}</h3>
                {selectedVersion ? <span>{formatVersionState(selectedVersion)}</span> : null}
              </div>
              {selectedVersion && currentVersion ? (
                <TemplateVersionSideBySideDiffView
                  oldVersion={selectedVersion}
                  currentVersion={currentVersion}
                  diff={diff}
                  isLoading={isLoadingDiff}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {restoreTarget ? (
        <TemplateRestoreConfirmDialog
          targetVersion={restoreTarget}
          hasActiveLaterVersionUsage={hasActiveLaterVersionUsage}
          isRestoring={isRestoring}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={() => void handleConfirmRestore()}
        />
      ) : null}
    </div>
  );
};

const formatVersionLabel = (version: Pick<TemplateVersionDto, 'version' | 'schemaVersion'>): string =>
  version.version > 0 ? `v${version.version}` : version.schemaVersion;

const formatVersionState = (version: TemplateVersionDto): string => {
  if (version.isArchived) {
    return '已归档';
  }

  if (version.isCurrent) {
    return '当前';
  }

  if (version.status === 'DRAFT') {
    return '草稿';
  }

  return '历史';
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace('T', ' ');
  }

  return `${date.getFullYear()}-${formatDateTimePart(date.getMonth() + 1)}-${formatDateTimePart(date.getDate())} ${formatDateTimePart(date.getHours())}:${formatDateTimePart(date.getMinutes())}`;
};

const formatDateTimePart = (value: number): string => String(value).padStart(2, '0');

const formatPublisher = (createdById: string | null): string => {
  if (!createdById) {
    return '系统';
  }

  if (createdById === 'user_owner_zhang_man' || createdById === 'user_owner_001') {
    return '张泽鑫';
  }

  return createdById;
};

const TemplateVersionActionIcon = ({ src }: { src: string }) => (
  <img aria-hidden="true" alt="" className="template-manager-row-action__icon" src={src} />
);
