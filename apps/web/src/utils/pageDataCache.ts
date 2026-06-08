type CachedPageData<TData> = {
  data: TData;
  savedAt: string;
};

type PageDataCacheScope = 'local' | 'session';

export function readPageDataCache<TData>(
  key: string,
  isData: (value: unknown) => value is TData,
  scope: PageDataCacheScope = 'local',
): TData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = getPageDataStorage(scope);
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return null;
  }

  const parsed = JSON.parse(rawValue) as Partial<CachedPageData<unknown>>;

  if (typeof parsed.savedAt !== 'string' || !isData(parsed.data)) {
    throw new Error(`页面缓存结构异常：${key}`);
  }

  return parsed.data;
}

export function writePageDataCache<TData>(
  key: string,
  data: TData,
  scope: PageDataCacheScope = 'local',
) {
  if (typeof window === 'undefined') {
    return;
  }

  getPageDataStorage(scope).setItem(
    key,
    JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    } satisfies CachedPageData<TData>),
  );
}

function getPageDataStorage(scope: PageDataCacheScope) {
  return scope === 'local' ? window.localStorage : window.sessionStorage;
}
