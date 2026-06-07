import type { WorkbenchDto } from '../../api/drafts';

type QuestionNavigatorProps = {
  workbench: WorkbenchDto;
  currentIndex: number;
  totalCount: number;
  items?: Array<{
    annotationStatusLabel: string;
    flowStatusLabel: string;
    label: string;
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
    annotationStatusLabel: '未填写',
    flowStatusLabel: '待标注',
    index,
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
              <small className={`question-navigator__annotation-status ${getAnnotationStatusClassName(item.annotationStatusLabel)}`}>
                {item.annotationStatusLabel}
              </small>
            </span>
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
  if (statusLabel === 'AI处理中') {
    return 'question-navigator__status--ai-review';
  }

  if (statusLabel === '待审核') {
    return 'question-navigator__status--reviewer-reviewing';
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

function getAnnotationStatusClassName(statusLabel: string): string {
  if (statusLabel === '已标注') {
    return 'is-complete';
  }

  if (statusLabel === '草稿') {
    return 'is-draft';
  }

  return 'is-empty';
}
