import type { WorkbenchDto } from '../../api/drafts';

type QuestionNavigatorItem = {
  annotationStatusLabel?: string;
  annotationStatusState?: 'empty' | 'draft' | 'complete';
  flowStatusLabel: string;
  label: string;
};

type QuestionNavigatorProps = {
  workbench: WorkbenchDto;
  currentIndex: number;
  totalCount: number;
  items?: QuestionNavigatorItem[];
  onJump: (index: number) => void;
};

export const QuestionNavigator = ({
  workbench,
  currentIndex,
  totalCount,
  items,
  onJump,
}: QuestionNavigatorProps) => {
  const navigationItems: QuestionNavigatorItem[] = items && items.length > 0 ? items : Array.from({ length: totalCount }, (_, index) => ({
    flowStatusLabel: '待标注',
    label: index === currentIndex ? workbench.taskItem.externalId : `#${String(index + 1).padStart(3, '0')}`,
  }));
  return (
    <section className="question-navigator" aria-label="题目导航">
      <div>
        <h2>题目导航</h2>
      </div>
      <div className="question-navigator__list">
        {navigationItems.map((item, index) => (
          <button
            className={index === currentIndex ? 'is-active' : ''}
            key={`${item.label}:${index}`}
            type="button"
            onClick={() => onJump(index)}
          >
            <span className="question-navigator__copy">
              <span className="question-navigator__identity">{item.label}</span>
            </span>
            {item.annotationStatusLabel ? (
              <span
                className={`question-navigator__annotation-status ${getAnnotationStatusClassName(
                  item.annotationStatusState,
                )}`}
              >
                {item.annotationStatusLabel}
              </span>
            ) : null}
            <small className={`question-navigator__status ${getFlowStatusClassName(item.flowStatusLabel)}`}>
              <span className="question-navigator__status-text" key={item.flowStatusLabel}>
                {item.flowStatusLabel}
              </span>
            </small>
          </button>
        ))}
      </div>
    </section>
  );
};

function getFlowStatusClassName(statusLabel: string): string {
  if (statusLabel === 'AI预审中') {
    return 'question-navigator__status--ai-review';
  }

  if (statusLabel === '人工审核中') {
    return 'question-navigator__status--reviewer-reviewing';
  }

  if (statusLabel === '待提交') {
    return 'question-navigator__status--submitted';
  }

  if (statusLabel === '待修改') {
    return 'question-navigator__status--rejected';
  }

  if (statusLabel === '已完成') {
    return 'question-navigator__status--complete';
  }

  if (statusLabel === '异常') {
    return 'question-navigator__status--failed';
  }

  if (statusLabel === '待标注') {
    return 'question-navigator__status--draft';
  }

  return '';
}

function getAnnotationStatusClassName(statusState: 'empty' | 'draft' | 'complete' | undefined): string {
  if (statusState === 'complete') {
    return 'is-complete';
  }

  if (statusState === 'draft') {
    return 'is-draft';
  }

  return 'is-empty';
}
