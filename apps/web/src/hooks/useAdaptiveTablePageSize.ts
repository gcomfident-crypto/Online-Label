import { useCallback, useLayoutEffect, useState } from 'react';

type UseAdaptiveTablePageSizeOptions = {
  fallbackPageSize: number;
  headerSelector?: string;
  maxPageSize?: number;
  minPageSize?: number;
  rowHeight: number;
  rowSelector?: string;
  viewportSelector?: string;
};

const DEFAULT_VIEWPORT_SELECTOR = '[data-adaptive-table-viewport="true"]';
const DEFAULT_HEADER_SELECTOR = 'thead';
const DEFAULT_ROW_SELECTOR = 'tbody tr:not(.task-table__empty-row)';

export const useAdaptiveTablePageSize = <T extends HTMLElement = HTMLDivElement>({
  fallbackPageSize,
  headerSelector = DEFAULT_HEADER_SELECTOR,
  maxPageSize = 100,
  minPageSize = 1,
  rowHeight,
  rowSelector = DEFAULT_ROW_SELECTOR,
  viewportSelector = DEFAULT_VIEWPORT_SELECTOR,
}: UseAdaptiveTablePageSizeOptions) => {
  const [containerElement, setContainerElement] = useState<T | null>(null);
  const [pageSize, setPageSize] = useState(fallbackPageSize);
  const containerRef = useCallback((node: T | null) => {
    setContainerElement(node);
  }, []);

  useLayoutEffect(() => {
    const container = containerElement;

    if (!container) {
      return;
    }

    const calculatePageSize = () => {
      const viewport = resolveViewport(container, viewportSelector);

      if (!viewport) {
        return;
      }

      const viewportHeight = viewport.getBoundingClientRect().height;

      if (viewportHeight <= 0) {
        return;
      }

      const headerHeight =
        viewport.querySelector<HTMLElement>(headerSelector)?.getBoundingClientRect().height ?? 0;
      const measuredRowHeight =
        viewport.querySelector<HTMLElement>(rowSelector)?.getBoundingClientRect().height ?? 0;
      const effectiveRowHeight = measuredRowHeight > 0 ? measuredRowHeight : rowHeight;
      const availableBodyHeight = viewportHeight - headerHeight;

      if (effectiveRowHeight <= 0 || availableBodyHeight <= 0) {
        return;
      }

      const nextPageSize = clamp(
        Math.floor(availableBodyHeight / effectiveRowHeight),
        minPageSize,
        maxPageSize,
      );

      setPageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };

    calculatePageSize();
    window.addEventListener('resize', calculatePageSize);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(calculatePageSize);
    resizeObserver?.observe(container);

    const viewport = resolveViewport(container, viewportSelector);
    if (viewport) {
      resizeObserver?.observe(viewport);
    }

    return () => {
      window.removeEventListener('resize', calculatePageSize);
      resizeObserver?.disconnect();
    };
  }, [
    containerElement,
    fallbackPageSize,
    headerSelector,
    maxPageSize,
    minPageSize,
    rowHeight,
    rowSelector,
    viewportSelector,
  ]);

  return { containerRef, pageSize };
};

const resolveViewport = (container: HTMLElement, viewportSelector: string): HTMLElement | null => {
  if (container.matches(viewportSelector)) {
    return container;
  }

  return container.querySelector<HTMLElement>(viewportSelector);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
