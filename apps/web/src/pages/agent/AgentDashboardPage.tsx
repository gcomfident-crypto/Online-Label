import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
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
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [range]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const [nextData] = await Promise.all([loadAgentDashboardData(range), wait(160)]);
      setData(nextData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '数据看板接口请求失败，请稍后重试。');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExport = () => {
    console.log('export-agent-dashboard-report', {
      range,
      updatedAt: data.updatedAt,
    });
  };

  return (
    <section className="agent-dashboard-page" aria-label="AI 预审数据看板">
      <DashboardHeader
        activeRange={range}
        isRefreshing={isRefreshing}
        onExport={handleExport}
        onRangeChange={setRange}
        onRefresh={handleRefresh}
      />

      {errorMessage ? <p className="agent-dashboard-alert" role="alert">{errorMessage}</p> : null}

      <div className={`agent-dashboard-grid${isLoading || isRefreshing ? ' is-loading' : ''}`} aria-busy={isLoading || isRefreshing}>
        <ul className="agent-dashboard-kpi-grid" aria-label="核心 KPI">
          {data.kpis.map((metric) => (
            <KpiCard key={metric.label} metric={metric} />
          ))}
        </ul>

        <TrendChartCard data={data} isLoading={isLoading || isRefreshing} />
        <QualityDistributionCard data={data} isLoading={isLoading || isRefreshing} />
        <ProblemReasonCard items={data.problemReasons} isLoading={isLoading || isRefreshing} />
        <HighRiskTaskCard tasks={data.highRiskTasks} isLoading={isLoading || isRefreshing} />
        <AbnormalBatchCard batches={data.abnormalBatches} isLoading={isLoading || isRefreshing} />
        <TaskStatusOverviewCard items={data.taskStatus} totalTasks={data.totalTasks} />
      </div>
    </section>
  );
};

const DashboardHeader = ({
  activeRange,
  isRefreshing,
  onExport,
  onRangeChange,
  onRefresh,
}: {
  activeRange: DashboardRange;
  isRefreshing: boolean;
  onExport: () => void;
  onRangeChange: (range: DashboardRange) => void;
  onRefresh: () => void;
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
      <button className="agent-dashboard-button" disabled={isRefreshing} onClick={onRefresh} type="button">
        {isRefreshing ? '刷新中' : '刷新'}
      </button>
      <button className="agent-dashboard-button agent-dashboard-button--primary" onClick={onExport} type="button">
        导出报告
      </button>
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
      aside="处理题目数 / 通过率"
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
  const [activePoint, setActivePoint] = useState<TrendPoint | null>(null);
  const chart = useMemo(() => buildTrendChart(points), [points]);

  return (
    <div className="agent-dashboard-trend-chart">
      <div className="agent-dashboard-chart-legend" aria-hidden="true">
        <span className="is-bar">处理题目数</span>
        <span className="is-line">通过率</span>
      </div>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="处理趋势图">
        <title>处理趋势图</title>
        {chart.horizontalGrid.map((y) => (
          <line className="agent-dashboard-chart-grid" key={y} x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={y} y2={y} />
        ))}
        {chart.yAxisLabels.map((label) => (
          <text className="agent-dashboard-axis-label" key={label.text} x={chart.padding.left - 12} y={label.y + 4} textAnchor="end">
            {label.text}
          </text>
        ))}
        {chart.rateAxisLabels.map((label) => (
          <text className="agent-dashboard-axis-label" key={label.text} x={chart.width - chart.padding.right + 12} y={label.y + 4}>
            {label.text}
          </text>
        ))}
        {chart.bars.map((bar) => (
          <g key={bar.label}>
            <rect className="agent-dashboard-trend-bar" height={bar.height} rx="7" width={bar.width} x={bar.x} y={bar.y} />
            {bar.showLabel ? (
              <text className="agent-dashboard-axis-label" textAnchor="middle" x={bar.centerX} y={chart.height - 12}>
                {bar.label}
              </text>
            ) : null}
          </g>
        ))}
        <polyline className="agent-dashboard-trend-line" points={chart.linePoints} />
        {chart.lineDots.map((dot) => (
          <circle className="agent-dashboard-trend-dot" cx={dot.x} cy={dot.y} key={dot.label} r="4.5" />
        ))}
      </svg>

      <div className="agent-dashboard-trend-hotspots" aria-label="趋势图数据点">
        {chart.hotspots.map((hotspot) => (
          <button
            aria-label={`${hotspot.point.label} 处理题目数 ${hotspot.point.processed.toLocaleString()} 通过率 ${hotspot.point.passRate}%`}
            key={hotspot.point.label}
            onBlur={() => setActivePoint(null)}
            onFocus={() => setActivePoint(hotspot.point)}
            onMouseEnter={() => setActivePoint(hotspot.point)}
            onMouseLeave={() => setActivePoint(null)}
            style={{
              left: `${hotspot.left}%`,
              top: `${hotspot.top}%`,
            }}
            type="button"
          />
        ))}
      </div>

      {activePoint ? (
        <div className="agent-dashboard-tooltip" role="tooltip">
          <strong>{activePoint.label}</strong>
          <span>处理题目数 {activePoint.processed.toLocaleString()}</span>
          <span>通过率 {activePoint.passRate}%</span>
        </div>
      ) : null}
    </div>
  );
};

const buildTrendChart = (points: TrendPoint[]) => {
  const width = 720;
  const height = 286;
  const padding = { bottom: 36, left: 58, right: 58, top: 24 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxProcessed = Math.max(0, ...points.map((point) => point.processed));
  const processedCeil = Math.max(1, Math.ceil(maxProcessed / 1000) * 1000);
  const minPassRate = Math.min(75, ...points.map((point) => point.passRate));
  const maxPassRate = Math.max(90, ...points.map((point) => point.passRate));
  const rateMin = Math.max(0, Math.floor(minPassRate / 5) * 5);
  const rateMax = Math.max(rateMin + 5, Math.ceil(maxPassRate / 5) * 5);
  const barWidth = Math.max(8, Math.min(34, (plotWidth / Math.max(1, points.length)) * 0.48));
  const labelInterval = points.length > 14 ? 5 : points.length > 10 ? 2 : 1;
  const horizontalGrid = [0, 1, 2, 3, 4].map((index) => padding.top + (plotHeight / 4) * index);
  const yAxisLabels = horizontalGrid.map((y, index) => ({
    text: `${Math.round(processedCeil - (processedCeil / 4) * index).toLocaleString()}`,
    y,
  }));
  const rateAxisLabels = horizontalGrid.map((y, index) => ({
    text: `${Math.round(rateMax - ((rateMax - rateMin) / 4) * index)}%`,
    y,
  }));
  const bars = points.map((point, index) => {
    const centerX = padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
    const heightValue = (point.processed / processedCeil) * plotHeight;

    return {
      centerX,
      height: heightValue,
      label: point.label,
      showLabel: index === 0 || index === points.length - 1 || index % labelInterval === 0,
      width: barWidth,
      x: centerX - barWidth / 2,
      y: padding.top + plotHeight - heightValue,
    };
  });
  const lineDots = points.map((point, index) => {
    const x = padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - ((point.passRate - rateMin) / (rateMax - rateMin)) * plotHeight;

    return { label: point.label, x, y };
  });
  const linePoints = lineDots.map((dot) => `${dot.x.toFixed(1)},${dot.y.toFixed(1)}`).join(' ');
  const hotspots = lineDots.map((dot, index) => ({
    left: (dot.x / width) * 100,
    point: points[index],
    top: (dot.y / height) * 100,
  }));

  return {
    bars,
    height,
    horizontalGrid,
    hotspots,
    lineDots,
    linePoints,
    padding,
    rateAxisLabels,
    width,
    yAxisLabels,
  };
};

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
