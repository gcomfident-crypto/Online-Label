import emptyTableIllustration from '../assets/empty-table-illustration.svg';

type TableEmptyStateProps = {
  description?: string;
  illustrationAlt?: string;
  title: string;
};

export const TableEmptyState = ({
  description,
  illustrationAlt = '空表格插画',
  title,
}: TableEmptyStateProps) => (
  <div className="task-table-empty">
    <img className="task-table-empty__illustration" src={emptyTableIllustration} alt={illustrationAlt} />
    <strong>{title}</strong>
    {description ? <span>{description}</span> : null}
  </div>
);
