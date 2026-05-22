export const OwnerTemplatesPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="owner-templates-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Owner / 模板配置</p>
          <h1 id="owner-templates-title">模板配置</h1>
          <p>这里是模板配置基础壳，后续会承载字段、标注规范、验收规则和版本管理入口。</p>
        </div>
        <button className="disabled-action" type="button" disabled>
          后续接入模板编辑
        </button>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>模板目录区域</h2>
          <p>为后续模板列表、版本状态和适用任务类型保留布局。</p>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>规则预览区域</h2>
          <p>为后续标注字段、校验规则和示例说明保留布局。</p>
        </article>
      </div>
    </section>
  );
};
