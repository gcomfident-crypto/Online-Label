import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAdaptiveTablePageSize } from './useAdaptiveTablePageSize';

const createDomRect = ({ height }: { height: number }): DOMRect => {
  const rect = {
    bottom: height,
    height,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => rect,
  };

  return rect as DOMRect;
};

describe('useAdaptiveTablePageSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('根据表格可用高度计算当前页可展示的行数，并随窗口尺寸变化更新', async () => {
    let viewportHeight = 44 + 66 * 12;

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.adaptiveTableViewport === 'true') {
        return createDomRect({ height: viewportHeight });
      }

      if (this.tagName === 'THEAD') {
        return createDomRect({ height: 44 });
      }

      if (this.tagName === 'TR') {
        return createDomRect({ height: 66 });
      }

      return createDomRect({ height: 0 });
    });

    const Probe = () => {
      const { containerRef, pageSize } = useAdaptiveTablePageSize({
        fallbackPageSize: 7,
        rowHeight: 66,
      });

      return (
        <div ref={containerRef}>
          <div data-adaptive-table-viewport="true">
            <table>
              <thead>
                <tr>
                  <th>标题</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>内容</td>
                </tr>
              </tbody>
            </table>
          </div>
          <span data-testid="page-size">{pageSize}</span>
        </div>
      );
    };

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('page-size')).toHaveTextContent('12'));

    viewportHeight = 44 + 66 * 15;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => expect(screen.getByTestId('page-size')).toHaveTextContent('15'));
  });
});
