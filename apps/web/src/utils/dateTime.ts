const APP_TIME_ZONE = 'Asia/Shanghai';

type DateTimeInput = Date | string | null | undefined;

type DateTimeParts = {
  day: string;
  hour: string;
  minute: string;
  month: string;
  second: string;
  year: string;
};

const dateTimePartsFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

export function formatDateTimeMinute(value: DateTimeInput, fallback = '—'): string {
  const parts = getDateTimeParts(value);

  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : fallback;
}

export function formatMonthDayTimeMinute(value: DateTimeInput, fallback = '—'): string {
  const parts = getDateTimeParts(value);

  return parts ? `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : fallback;
}

export function formatMonthDayTimeSecond(value: DateTimeInput, fallback = '—'): string {
  const parts = getDateTimeParts(value);

  return parts ? `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}` : fallback;
}

export function formatClockTime(value: DateTimeInput, options: { seconds?: boolean } = {}, fallback = '—'): string {
  const parts = getDateTimeParts(value);
  if (!parts) {
    return fallback;
  }

  return options.seconds
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : `${parts.hour}:${parts.minute}`;
}

export function splitDateTimeMinute(value: DateTimeInput, fallbackDate = '—', fallbackTime = ''): { date: string; time: string } {
  const parts = getDateTimeParts(value);

  return parts
    ? { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
    : { date: fallbackDate, time: fallbackTime };
}

function getDateTimeParts(value: DateTimeInput): DateTimeParts | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = Object.fromEntries(
    dateTimePartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Partial<DateTimeParts>;

  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
    return null;
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}
