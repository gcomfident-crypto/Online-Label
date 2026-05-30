export const ReviewerReviewsPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="reviewer-reviews-title">
      <div className="page-heading">
        <div>
          <h1 id="reviewer-reviews-title">验收台</h1>
        </div>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>待验收区域</h2>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>质量反馈区域</h2>
        </article>
      </div>
    </section>
  );
};
