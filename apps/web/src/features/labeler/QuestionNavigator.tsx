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
    statusLabel: index === currentIndex ? '进行中' : '待标',
  }));

  return (
    <section className="question-navigator" aria-label="题目导航">
      <div>
        <h2>题目导航</h2>
        <p>
          {currentIndex + 1} / {totalCount} · 当前题 {workbench.taskItem.externalId}
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
            <small>{item.statusLabel}</small>
          </button>
        ))}
      </div>
    </section>
  );
};
