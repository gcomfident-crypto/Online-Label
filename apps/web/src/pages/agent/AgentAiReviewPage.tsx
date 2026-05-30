export const AgentAiReviewPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="agent-review-title">
      <div className="page-heading">
        <div>
          <h1 id="agent-review-title">机审队列</h1>
        </div>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>待处理队列区域</h2>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>机审结果区域</h2>
        </article>
      </div>
    </section>
  );
};
