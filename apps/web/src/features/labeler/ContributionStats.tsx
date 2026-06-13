import type { LabelerStatsDto } from '../../api/submissions';
import type { WorkbenchDto } from '../../api/drafts';
import { formatDateTimeMinute } from '../../utils/dateTime';

type ContributionStatsProps = {
  stats: LabelerStatsDto | null;
  history: WorkbenchDto['submissionHistory'];
};

export const ContributionStats = ({ stats, history }: ContributionStatsProps) => {
  return (
    <aside className="labeler-insight-panel" aria-label="贡献、历史和快捷键">
      <section>
        <h2>我的贡献</h2>
        <div className="contribution-grid">
          <div>
            <span>已提交</span>
            <strong>{stats?.submittedCount ?? 0}</strong>
          </div>
          <div>
            <span>通过</span>
            <strong>{stats?.approvedCount ?? 0}</strong>
          </div>
          <div>
            <span>待修改</span>
            <strong>{stats?.needsRevisionCount ?? 0}</strong>
          </div>
        </div>
      </section>
      <section>
        <h2>本题历史</h2>
        {history.length > 0 ? (
          <ol className="submission-history-list">
            {history.map((submission) => (
              <li key={submission.id}>
                <strong>第 {submission.round} 轮 · {SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}</strong>
                <span>{formatDateTimeMinute(submission.submittedAt)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p>本题暂无提交历史。</p>
        )}
      </section>
      <section>
        <h2>快捷键</h2>
        <ul className="shortcut-list">
          <li>⌘/Ctrl + Enter 提交任务</li>
          <li>⌘/Ctrl + S 保存草稿</li>
          <li>J / K 切换上一题或下一题</li>
        </ul>
      </section>
    </aside>
  );
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  AI_QUEUED: 'AI 预审排队中',
  AI_PASSED: 'AI 预审通过',
  NEEDS_REVISION: '待修改',
  FINAL_APPROVED: '已完成',
  FINAL_REJECTED: '已打回',
};
