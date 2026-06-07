import type { WorkbenchDto } from '../../api/drafts';

type QuestionNavigatorProps = {
  workbench: WorkbenchDto;
  currentIndex: number;
  totalCount: number;
  items?: Array<{
    label: string;
    statusLabel: string;
  }>;
  onJump: (index: number) => void;
};

export const QuestionNavigator = ({
  workbench,
  currentIndex,
  totalCount,
  items,
  onJump,
}: QuestionNavigatorProps) => {
  const navigationItems = items && items.length > 0 ? items : Array.from({ length: totalCount }, (_, index) => ({
    index,
    label: index === currentIndex ? workbench.taskItem.externalId : `#${String(index + 1).padStart(3, '0')}`,
    statusLabel: index === currentIndex ? '进行中' : '待标注',
  }));
  const safeTotalCount = Math.max(1, totalCount);
  const completedCount = navigationItems.filter((item) => isCompletedStatusLabel(item.statusLabel)).length;
  const completedPercent = Math.min(100, Math.round((completedCount / safeTotalCount) * 100));

  return (
    <section className="question-navigator" aria-label="题目导航">
      <div>
        <h2>题目导航</h2>
        <p>
          已完成 <span className="question-navigator__mono-number">{completedPercent}</span>% · 当前第{' '}
          <span className="question-navigator__mono-number">{currentIndex + 1}</span> 题
        </p>
      </div>
      <div className="question-navigator__list">
        {navigationItems.map((item, index) => (
          <button
            className={index === currentIndex ? 'is-active' : ''}
            key={`${item.label}:${index}`}
            type="button"
            onClick={() => onJump(index)}
          >
            <span>{item.label}</span>
            <small className={`question-navigator__status ${getStatusClassName(item.statusLabel)}`}>
              <span className="question-navigator__status-text" key={item.statusLabel}>
                {item.statusLabel}
              </span>
            </small>
          </button>
        ))}
      </div>
    </section>
  );
};

function getStatusClassName(statusLabel: string): string {
  if (statusLabel === '已标注') {
    return 'question-navigator__status--annotated';
  }

  if (statusLabel === 'AI预审') {
    return 'question-navigator__status--ai-review';
  }

  if (statusLabel === 'AI打回') {
    return 'question-navigator__status--ai-rejected';
  }

  if (statusLabel === '审核员审核') {
    return 'question-navigator__status--reviewer-reviewing';
  }

  if (statusLabel === '审核员打回') {
    return 'question-navigator__status--reviewer-rejected';
  }

  if (statusLabel === '已完成') {
    return 'question-navigator__status--complete';
  }

  if (statusLabel === '草稿') {
    return 'question-navigator__status--in-progress';
  }

  if (statusLabel === '进行中') {
    return 'question-navigator__status--in-progress';
  }

  if (statusLabel === '待标注') {
    return 'question-navigator__status--pending';
  }

  if (statusLabel === '已提交' || statusLabel === '复审中' || statusLabel === '待完成') {
    return 'question-navigator__status--submitted';
  }

  if (statusLabel === '待修改') {
    return 'question-navigator__status--draft';
  }

  if (statusLabel === '被打回') {
    return 'question-navigator__status--ai-rejected';
  }

  return '';
}

function isCompletedStatusLabel(statusLabel: string): boolean {
  return ['已标注', '已完成'].includes(statusLabel);
}
