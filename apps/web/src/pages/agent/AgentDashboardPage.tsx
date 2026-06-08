import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  DASHBOARD_RANGE_OPTIONS,
  type AbnormalBatch,
  type AgentDashboardData,
  type DashboardRange,
  type HighRiskTask,
  type KpiMetric,
  type ProblemReasonItem,
  type QualityDistributionItem,
  type TaskStatusItem,
  type TrendPoint,
  emptyAgentDashboardData,
  loadAgentDashboardData,
} from './agentDashboardData';

export const AgentDashboardPage = () => <DashboardPage />;

const DashboardPage = () => {
  const [range, setRange] = useState<DashboardRange>('7d');
  const [data, setData] = useState<AgentDashboardData>(() => emptyAgentDashboardData('7d'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRangeChanging, setIsRangeChanging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const isRangeChangingRef = useRef(false);
  const isBusy = isLoading || isRangeChanging || isExporting;

  useEffect(() => {
    let isCurrent = true;
    if (!isRangeChangingRef.current) {
      setIsLoading(true);
    }
    setErrorMessage(null);

    loadAgentDashboardData(range)
      .then((nextData) => {
        if (isCurrent) {
          setData(nextData);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setErrorMessage(error instanceof Error ? error.message : '数据看板接口请求失败，请稍后重试。');
          setData(emptyAgentDashboardData(range));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
          setIsRangeChanging(false);
          isRangeChangingRef.current = false;
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [range]);

  const handleRangeChange = (nextRange: DashboardRange) => {
    if (nextRange === range) {
      return;
    }
    isRangeChangingRef.current = true;
    setIsRangeChanging(true);
    setExportMessage(null);
    setRange(nextRange);
  };

  const handleExport = async () => {
    setErrorMessage(null);
    setExportMessage(null);
    setIsExporting(true);
    try {
      const filename = triggerDashboardReportDownload(dashboardRef.current, data.rangeSubtitle);
      setExportMessage(`已生成报告：${filename}`);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? `导出报告失败：${error.message}` : '导出报告失败，请稍后重试。');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="agent-dashboard-page" aria-label="AI 预审数据看板">
      <DashboardHeader
        activeRange={range}
        isExporting={isExporting}
        isBusy={isBusy}
        exportMessage={exportMessage}
        onExport={handleExport}
        onRangeChange={handleRangeChange}
      />

      {errorMessage ? <p className="agent-dashboard-alert" role="alert">{errorMessage}</p> : null}

      <div
        ref={dashboardRef}
        className={`agent-dashboard-grid${isLoading || isRangeChanging ? ' is-range-transitioning' : ''}`}
        aria-busy={isLoading || isRangeChanging}
      >
        <ul className="agent-dashboard-kpi-grid" aria-label="核心 KPI">
          {data.kpis.map((metric) => (
            <KpiCard key={metric.label} metric={metric} />
          ))}
        </ul>

        <TrendChartCard data={data} isLoading={isLoading} />
        <QualityDistributionCard data={data} isLoading={isLoading} />
        <ProblemReasonCard items={data.problemReasons} isLoading={isLoading} />
        <HighRiskTaskCard tasks={data.highRiskTasks} isLoading={isLoading} />
        <AbnormalBatchCard batches={data.abnormalBatches} isLoading={isLoading} />
        <TaskStatusOverviewCard items={data.taskStatus} totalTasks={data.totalTasks} />
      </div>
    </section>
  );
};

const DashboardHeader = ({
  activeRange,
  isExporting,
  isBusy,
  exportMessage,
  onExport,
  onRangeChange,
}: {
  activeRange: DashboardRange;
  isExporting: boolean;
  isBusy: boolean;
  exportMessage: string | null;
  onExport: () => void;
  onRangeChange: (range: DashboardRange) => void;
}) => (
  <header className="agent-dashboard-header">
    <div className="agent-dashboard-heading">
      <p>集中查看任务运行、质检结果、异常原因和交付趋势</p>
    </div>

    <div className="agent-dashboard-actions" aria-label="数据看板操作">
      <div className="agent-dashboard-range" aria-label="时间范围选择器">
        {DASHBOARD_RANGE_OPTIONS.map((option) => (
          <button
            className={option.value === activeRange ? 'is-active' : ''}
            key={option.value}
            onClick={() => onRangeChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        className="agent-dashboard-button agent-dashboard-button--primary"
        disabled={isBusy}
        onClick={onExport}
        type="button"
      >
        {isExporting ? '导出中' : '导出报告'}
      </button>
      {exportMessage ? (
        <p className="agent-dashboard-export-message" role="status" aria-live="polite">
          {exportMessage}
        </p>
      ) : null}
    </div>
  </header>
);

const KpiCard = ({ metric }: { metric: KpiMetric }) => (
  <li className="agent-dashboard-kpi-card">
    <span className={`agent-dashboard-kpi-icon is-${metric.icon}`} aria-hidden="true">
      <KpiIcon type={metric.icon} />
    </span>
    <div className="agent-dashboard-kpi-copy">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small className={`is-${metric.trendTone}`}>{metric.change}</small>
    </div>
    <Sparkline values={metric.sparkline} />
  </li>
);

const KpiIcon = ({ type }: { type: KpiMetric['icon'] }) => {
  const paths: Record<KpiMetric['icon'], ReactNode> = {
    batch: (
      <>
        <rect height="12" rx="3" width="14" x="5" y="6" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
    duration: (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 8v4l3 2" />
      </>
    ),
    items: (
      <>
        <rect height="6" rx="2" width="7" x="4" y="5" />
        <rect height="6" rx="2" width="7" x="13" y="5" />
        <rect height="6" rx="2" width="7" x="4" y="13" />
        <rect height="6" rx="2" width="7" x="13" y="13" />
      </>
    ),
    pass: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    reject: (
      <>
        <path d="M6 7h12" />
        <path d="M8 7l1 12h6l1-12" />
        <path d="M10 11v4M14 11v4" />
        <path d="M10 5h4" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[type]}
    </svg>
  );
};

const Sparkline = ({ values }: { values: number[] }) => {
  const points = useMemo(() => {
    const width = 74;
    const height = 32;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = Math.max(1, max - min);

    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 6) - 3;

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values]);

  return (
    <svg className="agent-dashboard-sparkline" viewBox="0 0 74 32" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
};

const CardHeader = ({
  aside,
  id,
  subtitle,
  title,
}: {
  aside?: string;
  id?: string;
  subtitle?: string;
  title: string;
}) => (
  <div className="agent-dashboard-card__header">
    <div>
      <h2 id={id}>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {aside ? <span>{aside}</span> : null}
  </div>
);

const TrendChartCard = ({ data, isLoading }: { data: AgentDashboardData; isLoading: boolean }) => (
  <section className="agent-dashboard-card agent-dashboard-card--trend" aria-labelledby="agent-dashboard-trend-title">
    <CardHeader
      id="agent-dashboard-trend-title"
      subtitle={data.rangeSubtitle}
      title="处理趋势"
    />
    <div className="agent-dashboard-card__content">
      {isLoading ? <DashboardSkeleton rows={5} /> : <TrendChart points={data.trend} />}
    </div>
  </section>
);

const TrendChart = ({ points }: { points: TrendPoint[] }) => {
  const chart = useMemo(() => buildTrendChartGeometry(points), [points]);

  return (
    <div className="agent-dashboard-trend-chart">
      <div className="agent-dashboard-chart-legend" aria-hidden="true">
        <span className="is-line">通过率</span>
      </div>

      <svg
        className="agent-dashboard-trend-plot"
        role="img"
        aria-label="处理趋势图"
        viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`}
      >
        <title>{chart.accessibleLabel}</title>
        <defs>
          <linearGradient id="trend-pass-rate-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.86" />
            <stop offset="100%" stopColor="#dcfce7" stopOpacity="0.24" />
          </linearGradient>
        </defs>
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              className="agent-dashboard-trend-grid-line"
              x1={TREND_CHART_MARGIN.left}
              x2={TREND_CHART_WIDTH - TREND_CHART_MARGIN.right}
              y1={tick.y}
              y2={tick.y}
            />
            <text className="agent-dashboard-trend-y-label" x={TREND_CHART_MARGIN.left - 8} y={tick.y + 4}>
              {tick.value}%
            </text>
          </g>
        ))}
        {chart.areaPath ? <path className="agent-dashboard-trend-area" d={chart.areaPath} /> : null}
        {chart.linePath ? <path className="agent-dashboard-trend-line" d={chart.linePath} /> : null}
        {chart.points.map((point) => (
          <g className="agent-dashboard-trend-point" key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.2">
              <title>{`${point.label} 通过率 ${point.passRate.toFixed(1)}%`}</title>
            </circle>
          </g>
        ))}
        {chart.xLabels.map((label) => (
          <text className="agent-dashboard-trend-x-label" key={label.label} x={label.x} y={TREND_CHART_HEIGHT - 8}>
            {label.label}
          </text>
        ))}
      </svg>
    </div>
  );
};

const TREND_CHART_WIDTH = 760;
const TREND_CHART_HEIGHT = 236;
const TREND_CHART_MARGIN = {
  top: 12,
  right: 26,
  bottom: 28,
  left: 58,
};

function buildTrendChartGeometry(points: TrendPoint[]) {
  const plotWidth = TREND_CHART_WIDTH - TREND_CHART_MARGIN.left - TREND_CHART_MARGIN.right;
  const plotHeight = TREND_CHART_HEIGHT - TREND_CHART_MARGIN.top - TREND_CHART_MARGIN.bottom;
  const baseline = TREND_CHART_MARGIN.top + plotHeight;
  const coordinates = points.map((point, index) => {
    const x = TREND_CHART_MARGIN.left + (index / Math.max(1, points.length - 1)) * plotWidth;
    const clampedPassRate = Math.min(100, Math.max(0, point.passRate));
    const y = TREND_CHART_MARGIN.top + ((100 - clampedPassRate) / 100) * plotHeight;

    return {
      label: point.label,
      passRate: clampedPassRate,
      x,
      y,
    };
  });
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = coordinates.length > 0
    ? `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`
    : '';
  const xLabelStep = Math.max(1, Math.ceil(points.length / 8));

  return {
    accessibleLabel: coordinates.length > 0
      ? `处理趋势图，${coordinates.map((point) => `${point.label} 通过率 ${point.passRate.toFixed(1)}%`).join('，')}`
      : '处理趋势图，暂无数据',
    areaPath,
    linePath,
    points: coordinates,
    xLabels: coordinates.filter((point, index) =>
      index === 0 ||
      index === coordinates.length - 1 ||
      index % xLabelStep === 0,
    ),
    yTicks: [0, 25, 50, 75, 100].map((value) => ({
      value,
      y: TREND_CHART_MARGIN.top + ((100 - value) / 100) * plotHeight,
    })),
  };
}

const QualityDistributionCard = ({ data, isLoading }: { data: AgentDashboardData; isLoading: boolean }) => (
  <section className="agent-dashboard-card agent-dashboard-card--distribution" aria-labelledby="agent-dashboard-quality-title">
    <CardHeader id="agent-dashboard-quality-title" subtitle="当前质检建议构成" title="质检结果分布" />
    <div className="agent-dashboard-card__content">
      {isLoading ? (
        <DashboardSkeleton rows={4} />
      ) : (
        <>
          <QualityDonut items={data.qualityDistribution} total={data.qualityTotal} />
          <p className="agent-dashboard-updated">更新时间：{data.updatedAt}</p>
        </>
      )}
    </div>
  </section>
);

const QualityDonut = ({ items, total }: { items: QualityDistributionItem[]; total: string }) => {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let dashOffset = 0;

  return (
    <div className="agent-dashboard-quality">
      <svg className="agent-dashboard-donut" viewBox="0 0 150 150" role="img" aria-label="质检结果分布图">
        <title>质检结果分布图</title>
        <circle className="agent-dashboard-donut__track" cx="75" cy="75" r={radius} />
        {items.map((item) => {
          const dashLength = (item.percent / 100) * circumference;
          const segmentStyle = {
            stroke: item.color,
            strokeDasharray: `${dashLength} ${circumference - dashLength}`,
            strokeDashoffset: -dashOffset,
          };
          dashOffset += dashLength;

          return (
            <circle
              className="agent-dashboard-donut__segment"
              cx="75"
              cy="75"
              key={item.label}
              r={radius}
              style={segmentStyle}
            />
          );
        })}
        <text className="agent-dashboard-donut__label" textAnchor="middle" x="75" y="68">
          总计
        </text>
        <text className="agent-dashboard-donut__value" textAnchor="middle" x="75" y="91">
          {total}
        </text>
      </svg>
      <div className="agent-dashboard-quality-list">
        {items.map((item) => (
          <div className="agent-dashboard-quality-row" key={item.label}>
            <span className="agent-dashboard-quality-dot" style={{ background: item.color }} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.count.toLocaleString()}</strong>
            <small>{item.percent}%</small>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProblemReasonCard = ({ isLoading, items }: { isLoading: boolean; items: ProblemReasonItem[] }) => (
  <section className="agent-dashboard-card agent-dashboard-card--analysis" aria-labelledby="agent-dashboard-problems-title">
    <CardHeader id="agent-dashboard-problems-title" title="高频问题原因 Top 5" />
    <div className="agent-dashboard-card__content">
      {isLoading ? <DashboardSkeleton rows={5} /> : <ProblemReasonList items={items} />}
    </div>
    <CardFooter label="查看全部问题原因" />
  </section>
);

const ProblemReasonList = ({ items }: { items: ProblemReasonItem[] }) => (
  <ol className="agent-dashboard-problem-list" aria-label="高频问题原因 Top 5">
    {items.length > 0 ? (
      items.map((item) => (
        <li key={item.label}>
          <div className="agent-dashboard-problem-row">
            <span title={item.label}>{item.label}</span>
            <strong>{item.count.toLocaleString()}</strong>
            <small>{item.percent}%</small>
          </div>
          <div className="agent-dashboard-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, item.percent * 2.6)}%` }} />
          </div>
        </li>
      ))
    ) : (
      <li>
        <DashboardEmptyState text="当前范围内暂无高频问题" />
      </li>
    )}
  </ol>
);

const HighRiskTaskCard = ({ isLoading, tasks }: { isLoading: boolean; tasks: HighRiskTask[] }) => (
  <section className="agent-dashboard-card agent-dashboard-card--analysis" aria-labelledby="agent-dashboard-risk-title">
    <CardHeader id="agent-dashboard-risk-title" title="高风险任务" />
    <div className="agent-dashboard-card__content agent-dashboard-card__content--table">
      {isLoading ? <DashboardSkeleton rows={5} /> : <HighRiskTaskTable tasks={tasks} />}
    </div>
    <CardFooter label="查看全部任务" />
  </section>
);

const HighRiskTaskTable = ({ tasks }: { tasks: HighRiskTask[] }) => (
  <table className="agent-dashboard-table" aria-label="高风险任务">
    <thead>
      <tr>
        <th>任务名称</th>
        <th>负责人</th>
        <th>处理量</th>
        <th>打回率</th>
        <th>风险等级</th>
      </tr>
    </thead>
    <tbody>
      {tasks.length > 0 ? (
        tasks.map((task) => (
          <tr key={task.name}>
            <td title={task.name}>{task.name}</td>
            <td>{task.owner}</td>
            <td>{task.volume}</td>
            <td>{task.rejectRate}</td>
            <td>
              <span className={`agent-dashboard-risk-badge is-${riskClassNameMap[task.risk]}`}>{task.risk}</span>
            </td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={5}>
            <DashboardEmptyState text="当前范围内暂无高风险任务" />
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

const AbnormalBatchCard = ({ batches, isLoading }: { batches: AbnormalBatch[]; isLoading: boolean }) => (
  <section className="agent-dashboard-card agent-dashboard-card--analysis" aria-labelledby="agent-dashboard-abnormal-title">
    <CardHeader id="agent-dashboard-abnormal-title" title="异常批次" />
    <div className="agent-dashboard-card__content agent-dashboard-card__content--table">
      {isLoading ? <DashboardSkeleton rows={5} /> : <AbnormalBatchTable batches={batches} />}
    </div>
    <CardFooter label="查看全部异常批次" />
  </section>
);

const AbnormalBatchTable = ({ batches }: { batches: AbnormalBatch[] }) => (
  <table className="agent-dashboard-table agent-dashboard-table--abnormal" aria-label="异常批次">
    <thead>
      <tr>
        <th>任务名称</th>
        <th>异常原因</th>
        <th>耗时</th>
        <th>时间</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      {batches.length > 0 ? (
        batches.map((batch) => (
          <tr key={`${batch.taskName}-${batch.time}`}>
            <td title={batch.taskName}>{batch.taskName}</td>
            <td title={batch.reason}>{batch.reason}</td>
            <td>{batch.duration}</td>
            <td>{batch.time}</td>
            <td>
              <button
                aria-label={`查看 ${batch.taskName} ${batch.reason}`}
                className="agent-dashboard-text-button"
                onClick={() => console.log('view-abnormal-batch', batch)}
                type="button"
              >
                查看
              </button>
            </td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={5}>
            <DashboardEmptyState text="当前范围内暂无异常批次" />
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

const TaskStatusOverviewCard = ({ items, totalTasks }: { items: TaskStatusItem[]; totalTasks: string }) => (
  <section className="agent-dashboard-card agent-dashboard-card--status" aria-label="任务状态概览">
    <div className="agent-dashboard-card__header agent-dashboard-card__header--compact">
      <div>
        <h2>任务状态概览</h2>
      </div>
      <span>总任务数：{totalTasks}</span>
    </div>
    <div className="agent-dashboard-status-overview">
      <div className="agent-dashboard-segmented-bar" aria-hidden="true">
        {items.map((item) => (
          <span
            key={item.label}
            style={
              {
                '--segment-color': item.color,
                flexBasis: `${item.percent}%`,
              } as CSSProperties
            }
          >
            <strong>{item.label}</strong>
            <small>{item.count}</small>
          </span>
        ))}
      </div>
      <div className="agent-dashboard-status-legend">
        {items.map((item) => (
          <div key={item.label}>
            <span style={{ background: item.color }} aria-hidden="true" />
            <strong>{item.label}</strong>
            <small>{item.percent}%</small>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const CardFooter = ({ label }: { label: string }) => (
  <div className="agent-dashboard-card__footer">
    <button onClick={() => console.log('dashboard-footer-action', label)} type="button">
      {label} &gt;
    </button>
  </div>
);

const DashboardSkeleton = ({ rows }: { rows: number }) => (
  <div className="agent-dashboard-skeleton" aria-label="数据加载中">
    {Array.from({ length: rows }).map((_, index) => (
      <span key={index} style={{ width: `${88 - index * 8}%` }} />
    ))}
  </div>
);

const DashboardEmptyState = ({ text }: { text: string }) => (
  <div className="agent-dashboard-empty">{text}</div>
);

const riskClassNameMap: Record<HighRiskTask['risk'], 'high' | 'medium' | 'low'> = {
  中: 'medium',
  低: 'low',
  高: 'high',
};

function triggerDashboardReportDownload(dashboardElement: HTMLElement | null, subtitle: string): string {
  if (typeof Blob === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前运行环境不支持导出功能。');
  }
  if (!dashboardElement) {
    throw new Error('导出失败：找不到可导出的看板区域。');
  }

  const dateLabel = new Date().toISOString().slice(0, 10);
  const exportTime = new Date().toLocaleString('zh-CN', { hour12: false });
  const styles = collectAllStyles();
  const content = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 预审数据看板 - 看板快照</title>
    <style>
      ${styles}
    </style>
  </head>
  <body>
    <main style="padding: 24px; background: #f8fafc; min-height: 100vh;">
      <h1>AI 预审数据看板</h1>
      <p>导出时间：${exportTime}</p>
      <p>时间范围：${subtitle}</p>
      ${dashboardElement.outerHTML}
    </main>
  </body>
</html>`;
  const filename = `数据看板报告-${dateLabel}.html`;
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });

  const href = URL.createObjectURL ? URL.createObjectURL(blob) : `data:text/html;charset=utf-8,${encodeURIComponent(content)}`;
  const link = document.createElement('a');

  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (typeof URL.revokeObjectURL === 'function' && href.startsWith('blob:')) {
    URL.revokeObjectURL(href);
  }

  return filename;
}

function collectAllStyles(): string {
  const stylesheetChunks: string[] = [];

  for (const styleSheet of Array.from(document.styleSheets)) {
    const node = styleSheet.ownerNode;
    if (node instanceof HTMLStyleElement && node.textContent) {
      stylesheetChunks.push(node.textContent);
      continue;
    }

    try {
      stylesheetChunks.push(Array.from(styleSheet.cssRules).map((rule) => rule.cssText).join('\n'));
    } catch {
      if (typeof styleSheet.href === 'string' && styleSheet.href) {
        stylesheetChunks.push(`/* Unable to inline cross-origin stylesheet: ${styleSheet.href} */`);
      }
    }
  }

  return stylesheetChunks.join('\n\n');
}
