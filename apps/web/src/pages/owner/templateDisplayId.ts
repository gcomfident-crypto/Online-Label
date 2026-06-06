type TemplateWithId = {
  id: string;
};

const BUSINESS_TEMPLATE_ID_PATTERN = /^M-?\d+$/i;

export const createTemplateDisplayIdMap = <Template extends TemplateWithId>(
  templates: Template[],
): Map<string, string> =>
  new Map(
    templates.map((template, index) => {
      const templateId = template.id.trim();
      const displayId = BUSINESS_TEMPLATE_ID_PATTERN.test(templateId)
        ? templateId
        : formatTemplateDisplayId(index + 1);

      return [template.id, displayId];
    }),
  );

export const formatTemplateDisplayId = (index: number): string => `M-${index.toString().padStart(3, '0')}`;
