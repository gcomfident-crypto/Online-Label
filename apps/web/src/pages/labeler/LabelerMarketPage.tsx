export const LabelerMarketPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="labeler-market-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Labeler / 任务广场</p>
          <h1 id="labeler-market-title">任务广场</h1>
          <p>这里是 Labeler 端任务广场基础壳，后续会展示可领取任务、任务要求和标注入口。</p>
        </div>
        <button className="disabled-action" type="button" disabled>
          后续接入领取任务
        </button>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>可领取任务区域</h2>
          <p>预留任务类型、酬劳、截止时间和领取状态位置。</p>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>我的进行中区域</h2>
          <p>为后续标注工作流入口和待提交状态保留空间。</p>
        </article>
      </div>
    </section>
  );
};
