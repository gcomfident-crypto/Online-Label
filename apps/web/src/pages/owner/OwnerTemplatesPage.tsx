export const OwnerTemplatesPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="owner-templates-title">
      <div className="page-heading">
        <div>
          <h1 id="owner-templates-title">评测模板</h1>
        </div>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>模板目录区域</h2>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>规则预览区域</h2>
        </article>
      </div>
    </section>
  );
};
