export const AgentAiReviewPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="agent-review-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI Agent / 机审队列</p>
          <h1 id="agent-review-title">机审队列</h1>
          <p>这里是 AI Agent 端机审队列基础壳，后续会接入待机审样本、模型结果和异常标记。</p>
        </div>
        <button className="disabled-action" type="button" disabled>
          后续接入机审任务
        </button>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>待处理队列区域</h2>
          <p>为后续队列优先级、任务来源和处理状态保留布局。</p>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>机审结果区域</h2>
          <p>为后续置信度、规则命中和复核建议保留入口。</p>
        </article>
      </div>
    </section>
  );
};
