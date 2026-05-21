export const OwnerTasksPage = () => {
  return (
    <section className="workspace-page" aria-labelledby="owner-tasks-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Owner / 任务管理</p>
          <h1 id="owner-tasks-title">任务管理</h1>
          <p>这里是 Owner 端任务管理基础壳，后续会接入任务创建、导入、分发和进度追踪。</p>
        </div>
        <button className="disabled-action" type="button" disabled>
          后续接入创建任务
        </button>
      </div>
      <div className="placeholder-grid">
        <article className="placeholder-card">
          <span>01</span>
          <h2>任务列表区域</h2>
          <p>预留筛选、状态、批次和负责人列位，不展示伪造业务数据。</p>
        </article>
        <article className="placeholder-card">
          <span>02</span>
          <h2>进度概览区域</h2>
          <p>预留标注、机审、验收状态汇总入口。</p>
        </article>
      </div>
    </section>
  );
};
