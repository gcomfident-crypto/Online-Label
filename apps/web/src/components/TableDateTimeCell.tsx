export const TableDateTimeCell = ({ value }: { value?: string | null }) => {
  const { date, time } = splitTableDateTimeMinute(value);

  return (
    <span className="task-date-cell">
      <span className="task-date-cell__date">{date}</span>
      <small className="task-date-cell__time">{time}</small>
    </span>
  );
};

export const splitTableDateTimeMinute = (value?: string | null): { date: string; time: string } => {
  if (!value) {
    return { date: '—', time: '' };
  }

  const [date, time = ''] = value.slice(0, 16).replace('T', ' ').split(' ');

  return { date, time };
};

