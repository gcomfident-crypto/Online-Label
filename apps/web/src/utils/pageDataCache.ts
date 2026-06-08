type CachedPageData<TData> = {
  data: TData;
  savedAt: string;
};

export function readPageDataCache<TData>(key: string, isData: (value: unknown) => value is TData): TData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  const parsed = JSON.parse(rawValue) as Partial<CachedPageData<unknown>>;

  if (typeof parsed.savedAt !== 'string' || !isData(parsed.data)) {
    throw new Error(`页面缓存结构异常：${key}`);
  }

  return parsed.data;
}

export function writePageDataCache<TData>(key: string, data: TData) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    } satisfies CachedPageData<TData>),
  );
}
