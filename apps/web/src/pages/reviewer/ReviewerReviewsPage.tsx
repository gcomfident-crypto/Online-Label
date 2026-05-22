export const ReviewerReviewsPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="reviewer-reviews-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reviewer / 验收台</p>
          <h1 id="reviewer-reviews-title">验收台</h1>
          <p>这里是 Reviewer 端验收台基础壳，后续会接入抽检、驳回、通过和质量统计入口。</p>
        </div>
        <button className="disabled-action" type="button" disabled>
          后续接入验收任务
        </button>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>待验收区域</h2>
          <p>预留任务批次、提交人、抽检比例和验收状态位置。</p>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>质量反馈区域</h2>
          <p>为后续问题分类、反馈记录和通过率统计保留布局。</p>
        </article>
      </div>
    </section>
  );
};
