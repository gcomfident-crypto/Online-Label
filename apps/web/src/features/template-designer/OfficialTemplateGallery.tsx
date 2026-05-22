import type { OfficialTemplateKey } from './templateStore';

type OfficialTemplateGalleryProps = {
  onUseTemplate: (templateKey: OfficialTemplateKey) => void;
};

const TEMPLATES: readonly {
  key: OfficialTemplateKey;
  title: string;
  description: string;
  action: string;
}[] = [
  {
    key: 'qa_quality',
    title: '问答质量 qa_quality',
    description: '媒体展示、四维评分、问题标签和 AI 预评分参考。',
    action: '使用 qa_quality',
  },
  {
    key: 'preference_compare',
    title: '偏好对比 preference_compare',
    description: 'A/B 并排展示、偏好结论、安全风险和证据上传。',
    action: '使用 preference_compare',
  },
  {
    key: 'title_cleanup',
    title: '商品标题清洗 v3',
    description: '对齐图 2 蓝本，包含 ShowItem、清洗标题、类目、关键词和 LLM 触发组件。',
    action: '使用商品标题清洗 v3',
  },
];

export const OfficialTemplateGallery = ({ onUseTemplate }: OfficialTemplateGalleryProps) => {
  return (
    <section className="designer-gallery" aria-label="官方模板库">
      {TEMPLATES.map((template) => (
        <article key={template.key}>
          <h3>{template.title}</h3>
          <p>{template.description}</p>
          <button type="button" onClick={() => onUseTemplate(template.key)}>
            {template.action}
          </button>
        </article>
      ))}
    </section>
  );
};
