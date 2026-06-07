import type { WorkbenchDto } from '../../api/drafts';

type RejectNoticeProps = {
  notice: WorkbenchDto['rejectionNotice'];
  suggestion?: string | null;
};

export const RejectNotice = ({ notice, suggestion }: RejectNoticeProps) => {
  if (!notice) {
    return null;
  }

  return (
    <section className="reject-notice" aria-label="上一轮打回原因">
      <strong>上一轮被打回</strong>
      <span>
        第 {notice.round} 轮：{notice.reason}
      </span>
      {suggestion ? (
        <span className="reject-notice__suggestion">
          <strong>修改建议</strong>
          {suggestion}
        </span>
      ) : null}
      <small>{notice.createdAt.slice(0, 16).replace('T', ' ')}</small>
    </section>
  );
};
