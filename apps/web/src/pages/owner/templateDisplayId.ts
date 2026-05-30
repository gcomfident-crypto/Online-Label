type TemplateWithId = {
  id: string;
};

const BUSINESS_TEMPLATE_ID_PATTERN = /^M-\d+$/i;

export const createTemplateDisplayIdMap = <Template extends TemplateWithId>(
  templates: Template[],
): Map<string, string> =>
  new Map(
    templates.map((template, index) => [
      template.id,
      BUSINESS_TEMPLATE_ID_PATTERN.test(template.id) ? template.id : formatTemplateDisplayId(index + 1),
    ]),
  );

export const formatTemplateDisplayId = (index: number): string => `M-${index.toString().padStart(3, '0')}`;
