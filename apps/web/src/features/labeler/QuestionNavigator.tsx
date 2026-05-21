import type { WorkbenchDto } from '../../api/drafts';

type QuestionNavigatorProps = {
  workbench: WorkbenchDto;
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
};

export const QuestionNavigator = ({
  workbench,
  currentIndex,
  totalCount,
  onPrevious,
  onNext,
  onJump,
}: QuestionNavigatorProps) => {
  const items = Array.from({ length: totalCount }, (_, index) => ({
    index,
    label: index === currentIndex ? workbench.taskItem.externalId : `#${String(index + 1).padStart(3, '0')}`,
  }));

  return (
    <aside className="question-navigator" aria-label="题目导航">
      <div>
        <h2>题目导航</h2>
        <p>
          {currentIndex + 1} / {totalCount} · 当前题 {workbench.taskItem.externalId}
        </p>
      </div>
      <div className="question-navigator__list">
        {items.map((item) => (
          <button
            className={item.index === currentIndex ? 'is-active' : ''}
            key={item.index}
            type="button"
            onClick={() => onJump(item.index)}
          >
            <span>{item.label}</span>
            <small>{item.index === currentIndex ? '进行中' : '待标'}</small>
          </button>
        ))}
      </div>
      <div className="question-navigator__actions">
        <button type="button" onClick={onPrevious} disabled={currentIndex === 0}>
          ← 上一题
        </button>
        <button type="button" onClick={onNext} disabled={currentIndex >= totalCount - 1}>
          下一题 →
        </button>
      </div>
    </aside>
  );
};
