export const loadOwnerTasksPage = () =>
  import('../pages/owner/OwnerTasksPage').then(({ OwnerTasksPage }) => ({ default: OwnerTasksPage }));

export const loadTemplateDesignerPage = () =>
  import('../pages/owner/TemplateDesignerPage').then(({ TemplateDesignerPage }) => ({ default: TemplateDesignerPage }));

export const loadExportCenterPage = () =>
  import('../pages/owner/ExportCenterPage').then(({ ExportCenterPage }) => ({ default: ExportCenterPage }));

export function prefetchOwnerPortalRoutes() {
  void loadOwnerTasksPage();
  void loadTemplateDesignerPage();
  void loadExportCenterPage();
}
