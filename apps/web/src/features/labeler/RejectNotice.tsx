import type { WorkbenchDto } from '../../api/drafts';

type RejectNoticeProps = {
  notice: WorkbenchDto['rejectionNotice'];
};

export const RejectNotice = ({ notice }: RejectNoticeProps) => {
  if (!notice) {
    return null;
  }

  return (
    <section className="reject-notice" aria-label="上一轮打回原因">
      <strong>上一轮被打回</strong>
      <span>
        第 {notice.round} 轮：{notice.reason}
      </span>
      <small>{notice.createdAt.slice(0, 16).replace('T', ' ')}</small>
    </section>
  );
};
