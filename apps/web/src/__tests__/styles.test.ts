import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('global styles', () => {
  it('保留所有文本输入控件的原生输入光标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

    expect(styles).not.toContain('caret-color: transparent;');
  });

  it('属性配置表单普通输入左侧顶头，字段元信息右侧顶头但保持正常输入方向', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const propertyControlRule = styles.match(
      /\.designer-property-row input,\s*\.designer-property-row select,\s*\.designer-property-row textarea\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const metadataControlRule = styles.match(/\.designer-property-row--metadata input\s*\{[^}]+\}/)?.[0] ?? '';

    expect(propertyControlRule).toContain('direction: ltr;');
    expect(propertyControlRule).toContain('text-align: left;');
    expect(propertyControlRule).not.toContain('text-align: right;');
    expect(metadataControlRule).toContain('direction: ltr;');
    expect(metadataControlRule).toContain('text-align: right;');
  });

  it('属性配置表单自适应文本域按内容高度展示', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const autoResizeTextareaRule =
      styles.match(/\.designer-property-row textarea\.designer-auto-resize-textarea\s*\{[^}]+\}/)?.[0] ?? '';

    expect(autoResizeTextareaRule).toContain('field-sizing: content;');
    expect(autoResizeTextareaRule).toContain('overflow-y: auto;');
    expect(autoResizeTextareaRule).toContain('resize: none;');
  });

  it('项目内自定义下拉菜单统一置于顶层且不被属性折叠区裁剪', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rootRule = styles.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
    const expandedCollapseRule = styles.match(/\.designer-property-collapse\.is-expanded\s*\{[^}]+\}/)?.[0] ?? '';
    const expandedInnerRule =
      styles.match(/\.designer-property-collapse\.is-expanded > \.designer-property-collapse__inner\s*\{[^}]+\}/)
        ?.[0] ?? '';
    const taskFilterOpenRule =
      styles.match(/\.task-filter-select:has\(\.task-filter-select__menu\)\s*\{[^}]+\}/)?.[0] ?? '';
    const taskFilterMenuRule = styles.match(/\.task-filter-select__menu\s*\{[^}]+\}/)?.[0] ?? '';
    const loginRoleMenuRule = styles.match(/\.login-role-menu\s*\{[^}]+\}/)?.[0] ?? '';
    const platformUserMenuRule = styles.match(/\.platform-user-menu\s*\{[^}]+\}/)?.[0] ?? '';
    const templatePickerMenuRule = styles.match(/\.task-template-picker__menu\s*\{[^}]+\}/)?.[0] ?? '';
    const deadlinePopoverRule = styles.match(/\.task-deadline-picker__popover\s*\{[^}]+\}/)?.[0] ?? '';
    const fieldMentionMenuRule =
      Array.from(styles.matchAll(/\.designer-field-mention__menu\s*\{[^}]+\}/g))
        .map((match) => match[0])
        .find((rule) => rule.includes('position: absolute;')) ?? '';
    const inlineChoiceMenuRule =
      styles.match(/\.designer-linkage-rule-editor__inline-choice-menu\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rootRule).toContain('--overlay-dropdown-z-index: 1000;');
    expect(expandedCollapseRule).toContain('overflow: visible;');
    expect(expandedInnerRule).toContain('overflow: visible;');
    expect(taskFilterOpenRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(taskFilterMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(loginRoleMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(platformUserMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(templatePickerMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(deadlinePopoverRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(fieldMentionMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(inlineChoiceMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
  });

  it('全局页面允许双指放大后的纵向平移', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rootRule = styles.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
    const universalRule = styles.match(/\*\s*\{[^}]+\}/)?.[0] ?? '';
    const bodyRule = styles.match(/body\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rootRule).toContain('overscroll-behavior-y: auto;');
    expect(bodyRule).toContain('overscroll-behavior-y: auto;');
    expect(rootRule).not.toContain('overscroll-behavior: none;');
    expect(bodyRule).not.toContain('overscroll-behavior: none;');
    expect(universalRule).not.toContain('overscroll-behavior-y: none;');
  });

  it('任务发布抽屉表单按固定间距靠上排列', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const formRule = styles.match(/\.task-publish-form\s*\{[^}]+\}/)?.[0] ?? '';

    expect(formRule).toContain('align-content: start;');
    expect(formRule).toContain('grid-auto-rows: max-content;');
    expect(formRule).toContain('gap: 12px;');
  });

  it('任务发布抽屉奖励列短于截止时间列', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const metricsRule = styles.match(/\.task-publish-form\s*>\s*\.task-publish-form__metrics\s*\{[^}]+\}/)?.[0] ?? '';

    expect(metricsRule).toContain(
      'grid-template-columns: minmax(104px, 0.72fr) minmax(0, 1.28fr);',
    );
    expect(metricsRule).toContain('column-gap: 14px;');
  });

  it('任务表格图标按钮悬浮时不向上位移，避免被表格单元格裁剪', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const hoverRule = styles.match(
      /\.task-table-action--icon:hover:not\(:disabled\),\s*\.task-table-action--icon:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(hoverRule).not.toContain('transform: translateY(-1px);');
  });

  it('标注字段必填星号使用红色且优先级高于通用字段文字样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const requiredMarkRule = styles.match(
      /\.schema-field\s+\.schema-field__required-mark\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(requiredMarkRule).toContain('color: #f04438;');
  });

  it('LLM 生成建议按钮使用更小的文字和图标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const triggerRule = styles.match(/\.schema-field__llm-trigger-button\s*\{[^}]+\}/)?.[0] ?? '';
    const iconRule = styles.match(/\.schema-field__llm-trigger-button img\s*\{[^}]+\}/)?.[0] ?? '';

    expect(triggerRule).toContain('font-size: 12px;');
    expect(triggerRule).toContain('padding: 7px 10px;');
    expect(triggerRule).toContain('gap: 4px;');
    expect(iconRule).toContain('width: 13px;');
    expect(iconRule).toContain('height: 13px;');
  });

  it('所有垃圾桶删除图标悬浮效果与题目展示字段删除按钮一致', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const deleteHoverRule = styles.match(
      /\.template-manager-row-action--delete:hover:not\(:disabled\),[\s\S]*?\.task-table-action--delete:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(deleteHoverRule).toContain('.template-designer-page .designer-show-item-field__delete:hover:not(:disabled)');
    expect(deleteHoverRule).toContain('.template-designer-page .designer-field-card__delete-button:hover:not(:disabled)');
    expect(deleteHoverRule).toContain('.template-designer-page .designer-linkage__delete:hover:not(:disabled)');
    expect(deleteHoverRule).toContain('.template-manager-row-action--delete:hover:not(:disabled)');
    expect(deleteHoverRule).toContain('.task-table-action--delete:hover:not(:disabled)');
    expect(deleteHoverRule).toContain('border-color: #fecaca;');
    expect(deleteHoverRule).toContain('color: #dc2626;');
    expect(deleteHoverRule).toContain('background: #fff1f2;');
    expect(deleteHoverRule).toContain('transform: none;');
  });

  it('任务表格发起和暂停图标比其他操作图标更小', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const compactIconRule = styles.match(
      /\.task-table-action__icon--publish,\s*\.task-table-action__icon--pause\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(compactIconRule).toContain('width: 16px;');
    expect(compactIconRule).toContain('height: 16px;');
  });

  it('系统通知从页面顶部向下弹出并提供退出动画', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const toastStackRule = styles.match(/\.toast-stack\s*\{[^}]+\}/)?.[0] ?? '';
    const toastBannerRule = styles.match(/\.toast-stack--banner\s*\{[^}]+\}/)?.[0] ?? '';
    const toastExitRule = styles.match(/\.toast\.is-exiting\s*\{[^}]+\}/)?.[0] ?? '';

    expect(toastStackRule).toContain('top: calc(var(--platform-topbar-height) + 24px);');
    expect(toastStackRule).toContain('left: 50%;');
    expect(toastStackRule).toContain('width: min(320px, calc(100vw - 32px));');
    expect(toastStackRule).toContain('transform: translateX(-50%);');
    expect(toastBannerRule).toContain('width: min(360px, calc(100vw - 48px));');
    expect(toastExitRule).toContain('animation: toastOut 220ms ease-in both;');
    expect(styles).toContain('@keyframes toastOut');
    expect(styles).toContain('transform: translateY(-14px) scale(0.98);');
  });

  it('平台顶栏尺寸随屏幕断点自适应', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rootRule = styles.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
    const topbarRule = styles.match(/\.platform-topbar\s*\{[^}]+\}/)?.[0] ?? '';
    const topbarLeftRule = styles.match(/\.platform-topbar__left\s*\{[^}]+\}/)?.[0] ?? '';
    const brandRule = styles.match(/\.platform-brand\s*\{[^}]+\}/)?.[0] ?? '';
    const brandMarkRule = styles.match(/\.platform-brand__mark\s*\{[^}]+\}/)?.[0] ?? '';
    const brandTextRule = styles.match(/\.platform-brand strong\s*\{[^}]+\}/)?.[0] ?? '';
    const navLinkRule = styles.match(/\.platform-topbar__nav a\s*\{[^}]+\}/)?.[0] ?? '';
    const userRule = [...styles.matchAll(/\.platform-user\s*\{[^}]+\}/g)].map((match) => match[0]).join('\n');
    const userTriggerHoverRule =
      styles.match(/\.platform-user__trigger:hover:not\(:disabled\),[\s\S]*?\.platform-user__trigger\[aria-expanded='true'\]\s*\{[^}]+\}/)?.[0] ?? '';
    const avatarRule = styles.match(/\.platform-user__avatar\s*\{[^}]+\}/)?.[0] ?? '';
    const mobileTopbarRule =
      styles.match(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.platform-topbar\s*\{[^}]+\}/)?.[0] ?? '';
    const mobileTopbarLeftRule =
      styles.match(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.platform-topbar__left\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rootRule).toContain('--platform-topbar-height: 48px;');
    expect(rootRule).toContain('--platform-topbar-inline-padding: 18px;');
    expect(rootRule).toContain('--platform-topbar-brand-start-padding: 8px;');
    expect(rootRule).toContain('--platform-topbar-font-size: 14px;');
    expect(rootRule).toContain('--platform-topbar-brand-mark-size: 36px;');
    expect(topbarRule).toContain('min-height: var(--platform-topbar-height);');
    expect(topbarRule).toContain('gap: var(--platform-topbar-gap);');
    expect(topbarRule).toContain('padding: 0 var(--platform-topbar-inline-padding) 0 0;');
    expect(topbarLeftRule).toContain('display: grid;');
    expect(topbarLeftRule).toContain('grid-template-columns: var(--portal-sidebar-width) minmax(0, 1fr);');
    expect(brandRule).toContain('font-size: var(--platform-topbar-brand-font-size);');
    expect(brandRule).toContain('padding-left: var(--platform-topbar-brand-start-padding);');
    expect(brandMarkRule).toContain('width: var(--platform-topbar-brand-mark-size);');
    expect(brandMarkRule).toContain('object-fit: contain;');
    expect(brandTextRule).toContain('color: #0578FE;');
    expect(brandTextRule).toContain('font-family: "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif;');
    expect(styles).toContain('background: linear-gradient(45deg, #0578FE 0%, #17F7DE 100%);');
    expect(styles).toContain('-webkit-text-fill-color: transparent;');
    expect(navLinkRule).toContain('min-height: var(--platform-topbar-nav-height);');
    expect(navLinkRule).toContain('font-size: var(--platform-topbar-font-size);');
    expect(userRule).toContain('font-size: var(--platform-topbar-font-size);');
    expect(userTriggerHoverRule).toContain('border-color: transparent;');
    expect(userTriggerHoverRule).toContain('background: #f3f7ff;');
    expect(userTriggerHoverRule).toContain('box-shadow: none;');
    expect(avatarRule).toContain('width: var(--platform-topbar-avatar-size);');
    expect(styles).toContain('--platform-topbar-height: 56px;');
    expect(styles).toContain('--platform-topbar-height: 64px;');
    expect(styles).toContain('--platform-topbar-height: 44px;');
    expect(styles).toContain('--platform-topbar-brand-mark-size: 48px;');
    expect(styles).toContain('--platform-topbar-brand-mark-size: 56px;');
    expect(styles).toContain('--platform-topbar-brand-mark-size: 28px;');
    expect(styles).toContain('--platform-topbar-brand-start-padding: 10px;');
    expect(styles).toContain('--platform-topbar-brand-start-padding: 12px;');
    expect(styles).toContain('--platform-topbar-brand-start-padding: 0px;');
    expect(mobileTopbarRule).toContain('padding: 8px var(--platform-topbar-inline-padding);');
    expect(mobileTopbarLeftRule).toContain('display: flex;');
  });

  it('任务管理表格字段居中展示', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const taskTableRule = styles.match(/\.task-table\s*\{[^}]+\}/)?.[0] ?? '';

    expect(taskTableRule).toContain('text-align: center;');
  });

  it('任务表格空状态内容在空白区域正中心展示', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const emptyCellRule = styles.match(/\.task-table__empty-row td\s*\{[^}]+\}/)?.[0] ?? '';
    const emptyStateRule = styles.match(/\.task-table-empty\s*\{[^}]+\}/)?.[0] ?? '';
    const emptyIllustrationRule = styles.match(/\.task-table-empty__illustration\s*\{[^}]+\}/)?.[0] ?? '';
    const emptyTitleRule = styles.match(/\.task-table-empty strong\s*\{[^}]+\}/)?.[0] ?? '';
    const emptyDescriptionRule = styles.match(/\.task-table-empty span\s*\{[^}]+\}/)?.[0] ?? '';
    const emptyFillerRule = styles.match(
      /\.task-table-scroll:has\(\.task-table__empty-row\)::after,\s*\.task-market-table-frame:has\(\.task-table__empty-row\)::after,\s*\.template-manager-table-scroll:has\(\.task-table__empty-row\)::after,\s*\.my-data-table-frame:has\(\.task-table__empty-row\)::after\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const emptyTableRule = styles.match(
      /\.task-table-scroll:has\(\.task-table__empty-row\) \.task-table,\s*\.task-market-table-frame:has\(\.task-table__empty-row\) \.task-table,\s*\.template-manager-table-scroll:has\(\.task-table__empty-row\) \.template-manager-table,\s*\.my-data-table-frame:has\(\.task-table__empty-row\) \.my-data-table\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(emptyCellRule).toContain('height: 100%;');
    expect(emptyCellRule).toContain('padding: 0;');
    expect(emptyStateRule).toContain('height: 100%;');
    expect(emptyStateRule).toContain('min-height: clamp(220px, 42vh, 640px);');
    expect(emptyStateRule).toContain('display: flex;');
    expect(emptyStateRule).toContain('align-items: center;');
    expect(emptyStateRule).toContain('justify-content: center;');
    expect(emptyStateRule).not.toContain('translateY');
    expect(emptyIllustrationRule).toContain('width: clamp(200px, min(8vw, 14vh), 320px);');
    expect(emptyIllustrationRule).toContain('max-width: min(320px, 52vw);');
    expect(emptyTitleRule).toContain('font-size: clamp(13px, min(0.78vw, 1.5vh), 18px);');
    expect(emptyDescriptionRule).toContain('font-size: clamp(12px, min(0.62vw, 1.25vh), 15px);');
    expect(emptyFillerRule).toContain('display: none;');
    expect(emptyTableRule).toContain('height: 100%;');
  });

  it('模板配置上传文件预览使用题目数据导入同款居中弹窗尺寸', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const overlayRule = styles.match(/\.task-dataset-preview-overlay\s*\{[^}]+\}/)?.[0] ?? '';
    const drawerOverlayRule = styles.match(/\.task-dataset-preview-overlay--drawer\s*\{[^}]+\}/)?.[0] ?? '';
    const templateDrawerShellRule = styles.match(/\.template-designer-drawer-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const modalRule = styles.match(/\.task-dataset-preview-modal\s*\{[^}]+\}/)?.[0] ?? '';
    const source = readFileSync(resolve(__dirname, '../pages/owner/TemplateDesignerPage.tsx'), 'utf8');

    expect(overlayRule).toContain('place-items: center;');
    expect(overlayRule).toContain('padding: 24px;');
    expect(drawerOverlayRule).toContain('z-index: 69;');
    expect(templateDrawerShellRule).toContain('z-index: 68;');
    expect(modalRule).toContain('width: min(1280px, calc(100vw - 48px));');
    expect(modalRule).toContain('max-height: min(78vh, 760px);');
    expect(source).toContain('title="预览已上传文件"');
    expect(source).not.toContain('coverage="workspace"');
  });

  it('模板版本管理弹窗遮罩避开顶栏并提供入场退场动画', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const modalRule = styles.match(/\.template-version-modal\s*\{[^}]+\}/)?.[0] ?? '';
    const enteringRule = styles.match(/\.template-version-modal--entering\s*\{[^}]+\}/)?.[0] ?? '';
    const closingRule = styles.match(/\.template-version-modal--closing\s*\{[^}]+\}/)?.[0] ?? '';
    const panelEnteringRule = styles.match(/\.template-version-modal--entering \.template-version-modal__panel\s*\{[^}]+\}/)?.[0] ?? '';
    const panelClosingRule = styles.match(/\.template-version-modal--closing \.template-version-modal__panel\s*\{[^}]+\}/)?.[0] ?? '';

    expect(modalRule).toContain('top: var(--platform-topbar-height);');
    expect(modalRule).toContain('height: calc(100vh - var(--platform-topbar-height));');
    expect(enteringRule).toContain('animation: task-dataset-preview-overlay-in 180ms ease-out both;');
    expect(closingRule).toContain('animation: task-dataset-preview-overlay-out 180ms ease-in both;');
    expect(panelEnteringRule).toContain('animation: task-dataset-preview-modal-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both;');
    expect(panelClosingRule).toContain('animation: task-dataset-preview-modal-out 180ms cubic-bezier(0.55, 0, 0.2, 1) both;');
  });

  it('模板版本管理表格字段和内容居中展示', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const cellRule = styles.match(/\.template-version-table th,\s*\.template-version-table td\s*\{[^}]+\}/)?.[0] ?? '';
    const actionRule = styles.match(/\.template-version-table__actions\s*\{[^}]+\}/)?.[0] ?? '';

    expect(cellRule).toContain('text-align: center;');
    expect(actionRule).toContain('justify-content: center;');
    expect(actionRule).toContain('min-height: 32px;');
  });

  it('模板版本管理收缩摘要栏使用紧凑横向布局', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const summaryRule = styles.match(/\.template-version-list-summary\s*\{[^}]+\}/)?.[0] ?? '';
    const collapsedRule = styles.match(
      /\.template-version-modal__list--collapsed \.template-version-list-summary\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const expandedRule = styles.match(
      /\.template-version-modal__list--expanded \.template-version-table-scroll\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const titleRule = styles.match(/\.template-version-list-summary__title\s*\{[^}]+\}/)?.[0] ?? '';
    const metaRule = styles.match(/\.template-version-list-summary__meta\s*\{[^}]+\}/)?.[0] ?? '';
    const buttonRule = styles.match(/\.template-version-list-summary__expand\s*\{[^}]+\}/)?.[0] ?? '';

    expect(summaryRule).toContain('display: grid;');
    expect(summaryRule).toContain('align-items: center;');
    expect(summaryRule).toContain('grid-template-columns: max-content minmax(0, 1fr) max-content;');
    expect(summaryRule).toContain('min-height: 44px;');
    expect(summaryRule).toContain('border: 1px solid #dbe7ff;');
    expect(summaryRule).toContain('border-radius: 8px;');
    expect(summaryRule).toContain('background: #ffffff;');
    expect(collapsedRule).toContain('animation: template-version-list-collapse-in 180ms ease-out both;');
    expect(expandedRule).toContain('animation: template-version-list-expand-in 180ms ease-out both;');
    expect(styles).toContain('@keyframes template-version-list-collapse-in');
    expect(styles).toContain('@keyframes template-version-list-expand-in');
    expect(titleRule).toContain('font-weight: 900;');
    expect(metaRule).toContain('text-align: center;');
    expect(buttonRule).toContain('min-height: 32px;');
    expect(buttonRule).toContain('border: 1px solid #c9d8f6;');
    expect(buttonRule).toContain('border-radius: 6px;');
  });

  it('模板版本 Diff 使用左右渲染预览并支持横向和纵向滚动', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const scrollerRule = styles.match(/\.template-version-side-by-side-diff__scroller\s*\{[^}]+\}/)?.[0] ?? '';
    const gridRule = styles.match(/\.template-version-side-by-side-diff__grid\s*\{[^}]+\}/)?.[0] ?? '';
    const ownerPreviewShellRule =
      styles.match(/\.template-version-side-by-side-diff__owner-preview-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const canvasRule = styles.match(/\.template-version-side-by-side-diff__canvas\s*\{[^}]+\}/)?.[0] ?? '';
    const summaryChangedRule = styles.match(
      /\.template-version-diff__summary \[data-diff-kind='changed'\]\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const changedBadgeRule = styles.match(
      /\.schema-renderer__field-node--diff-changed > \.schema-renderer__field-diff-badge\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const addedRule = styles.match(
      /\.template-version-side-by-side-diff__owner-preview-shell \.template-version-side-by-side-diff__canvas \.schema-renderer__field-node--diff-added\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const removedRule = styles.match(
      /\.template-version-side-by-side-diff__owner-preview-shell \.template-version-side-by-side-diff__canvas \.schema-renderer__field-node--diff-removed\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const changedRule = styles.match(
      /\.template-version-side-by-side-diff__owner-preview-shell \.template-version-side-by-side-diff__canvas \.schema-renderer__field-node--diff-changed\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(scrollerRule).toContain('overflow-x: auto;');
    expect(scrollerRule).toContain('overflow-y: auto;');
    expect(scrollerRule).not.toContain('overflow-y: hidden;');
    expect(scrollerRule).toContain('min-height: 0;');
    expect(scrollerRule).toContain('max-height: min(58vh, 560px);');
    expect(gridRule).toContain('grid-template-columns: repeat(2, minmax(420px, 1fr));');
    expect(gridRule).toContain('min-width: 900px;');
    expect(ownerPreviewShellRule).toContain('min-height: 0;');
    expect(canvasRule).not.toContain('background: #f8fbff;');
    expect(styles).toContain('.designer-canvas .designer-canvas__labeler-preview-surface');
    expect(styles).not.toContain('template-version-side-by-side-diff__labeler-surface');
    expect(styles).not.toContain('.template-version-side-by-side-diff__canvas .schema-renderer {');
    expect(summaryChangedRule).toContain('color: #c2410c;');
    expect(summaryChangedRule).toContain('background: #fff7ed;');
    expect(changedBadgeRule).toContain('color: #c2410c;');
    expect(changedBadgeRule).toContain('background: #ffedd5;');
    expect(addedRule).toContain('box-shadow: inset 3px 0 0 #22c55e;');
    expect(removedRule).toContain('box-shadow: inset 3px 0 0 #ef4444;');
    expect(changedRule).toContain('border-color: #fdba74;');
    expect(changedRule).toContain('background: #fff7ed;');
    expect(changedRule).toContain('box-shadow: inset 3px 0 0 #f97316;');
  });

  it('关联模板下拉的模板 ID 使用模板表格同款标识样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const optionMainRule = styles.match(/\.task-template-picker__option-main\s*\{[^}]+\}/)?.[0] ?? '';
    const optionCodeRule = styles.match(
      /\.task-template-picker__option-main code,\s*\.task-template-picker__input-code\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(optionMainRule).toContain('display: flex;');
    expect(optionMainRule).toContain('gap: 8px;');
    expect(optionCodeRule).toContain('border: 1px solid #dbeafe;');
    expect(optionCodeRule).toContain('background: #eff6ff;');
    expect(optionCodeRule).toContain('font-family: ui-monospace');
    expect(optionCodeRule).toContain('font-size: 12px;');
    expect(optionCodeRule).toContain('font-weight: 600;');
  });

  it('任务管理任务 ID 使用评测模板 ID 同款蓝色标识样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const taskIdRule = styles.match(
      /\.task-management-table-card \.task-table__id code\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(taskIdRule).toContain('border: 0;');
    expect(taskIdRule).toContain('border-radius: 6px;');
    expect(taskIdRule).toContain('padding: 3px 6px;');
    expect(taskIdRule).toContain('color: #306df7;');
    expect(taskIdRule).toContain('background: #eaf1ff;');
    expect(taskIdRule).toContain('font-size: 12px;');
    expect(taskIdRule).toContain('font-weight: 800;');
  });

  it('模板配置选项拖拽时整个选项区域保持拖拽光标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const draggingCursorRule = styles.match(
      /\.designer-option-editor__option-list--dragging,\s*\.designer-option-editor__option-list--dragging \*,\s*\.designer-option-editor__option-list--dragging \.designer-option-bubble__surface\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(draggingCursorRule).toContain('cursor: grabbing !important;');
  });

  it('主列表表格填满剩余高度但不出现内部纵向滚动条', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const taskScrollRule = styles.match(/\.task-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const templateScrollRule = styles.match(/\.template-manager-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const marketFrameRule = styles.match(/\.task-market-table-frame\s*\{[^}]+\}/)?.[0] ?? '';

    expect(taskScrollRule).toContain('min-height: 0;');
    expect(taskScrollRule).toContain('overflow-y: hidden;');
    expect(templateScrollRule).toContain('overflow-y: hidden;');
    expect(marketFrameRule).toContain('flex: 1 1 auto;');
    expect(marketFrameRule).toContain('overflow-y: hidden;');
  });

  it('主列表表格把剩余高度放入独立空白层，避免最后一行视觉上变高', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const taskScrollRule = styles.match(/\.task-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const taskFillerRule = styles.match(
      /\.task-table-scroll::after,\s*\.task-market-table-frame::after,\s*\.template-manager-table-scroll::after,\s*\.my-data-table-frame::after\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const taskLastRowRule = styles.match(
      /\.task-table-scroll\s+\.task-table\s+tr:last-child\s+td,\s*\.task-market-table-frame\s+\.task-table\s+tr:last-child\s+td,\s*\.template-manager-table-scroll\s+\.template-manager-table\s+tr:last-child\s+td,\s*\.my-data-table-frame\s+\.my-data-table\s+tr:last-child\s+td\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(taskScrollRule).toContain('display: flex;');
    expect(taskScrollRule).toContain('flex-direction: column;');
    expect(taskFillerRule).toContain("content: '';");
    expect(taskFillerRule).toContain('flex: 1 1 auto;');
    expect(taskLastRowRule).toContain('border-bottom: 1px solid #e6eaf2;');
  });

  it('桌面大屏断点限制后台列表阅读宽度并保持登录页单卡片布局', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

    expect(styles).toContain('@media (min-width: 2200px)');
    expect(styles).toContain('width: min(540px, calc(100vw - 32px));');
    expect(styles).toContain('grid-template-columns: 1fr;');
    expect(styles).toContain('min-height: clamp(520px, 42vh, 600px);');
    expect(styles).toContain('padding: 48px 34px;');
    expect(styles).not.toContain('.login-platform-overview');
    expect(styles).not.toContain('.login-overview-card');
    expect(styles).not.toContain('.login-metric-card');
    expect(styles).toContain('width: min(2560px, calc(100% - 64px));');
    expect(styles).toContain('width: min(2720px, calc(100% - 64px));');
    expect(styles).toContain('margin-left: 32px;');
    expect(styles).toContain('@media (min-width: 3200px)');
    expect(styles).toContain('width: min(2800px, calc(100% - 160px));');
    expect(styles).toContain('width: min(2960px, calc(100% - 160px));');
    expect(styles).toContain('margin-left: 80px;');
  });

  it('登录页使用 back.png 作为页面背景图', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const loginPageRule = styles.match(/\.login-page\s*\{[^}]+\}/)?.[0] ?? '';

    expect(loginPageRule).toContain("url('./assets/back.png')");
    expect(loginPageRule).toContain('background-size: cover;');
    expect(loginPageRule).toContain('background-position: center;');
  });

  it('登录页顶部品牌图标使用放大的横向 Logo', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const lockupRule = styles.match(/\.login-brand-lockup\s*\{[^}]+\}/)?.[0] ?? '';
    const logoRule = styles.match(/\.login-brand-lockup__mark\s*\{[^}]+\}/)?.[0] ?? '';

    expect(lockupRule).toContain('justify-content: center;');
    expect(lockupRule).toContain('width: 100%;');
    expect(lockupRule).not.toContain('width: fit-content;');
    expect(logoRule).toContain('width: min(470px, 100%);');
    expect(logoRule).toContain('height: auto;');
    expect(logoRule).not.toContain('width: 34px;');
    expect(logoRule).not.toContain('height: 34px;');
  });

  it('登录卡片使用克制的轻玻璃 To B SaaS 视觉样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const shellRule = styles.match(/\.login-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const panelRule = styles.match(/\.login-form-panel\s*\{[^}]+\}/)?.[0] ?? '';
    const headingRule = styles.match(/\.login-form-heading\s*\{[^}]+\}/)?.[0] ?? '';
    const headingTextRule = styles.match(/\.login-form-heading p\s*\{[^}]+\}/)?.[0] ?? '';
    const headingPhraseRule = styles.match(/\.login-form-heading__phrase\s*\{[^}]+\}/)?.[0] ?? '';
    const headingBreatheRule = styles.match(/\.login-form-heading p\s*\{[^}]+\}/)?.[0] ?? '';
    const formRule = styles.match(/\.login-form\s*\{[^}]+\}/)?.[0] ?? '';
    const inputRule = styles.match(/\.login-form input,\s*\.login-form select\s*\{[^}]+\}/)?.[0] ?? '';
    const focusRule = styles.match(/\.login-form input:focus,\s*\.login-form select:focus\s*\{[^}]+\}/)?.[0] ?? '';
    const buttonRule = styles.match(/\.login-submit-button\s*\{[^}]+\}/)?.[0] ?? '';
    const buttonHoverRule = styles.match(/\.login-submit-button:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const rememberRule = styles.match(/\.login-remember\s*\{[^}]+\}/)?.[0] ?? '';
    const rememberInputRule = styles.match(/\.login-remember input\s*\{[^}]+\}/)?.[0] ?? '';
    const rememberBoxRule = styles.match(/\.login-remember__box\s*\{[^}]+\}/)?.[0] ?? '';
    const rememberCheckmarkRule = styles.match(/\.login-remember__box::after\s*\{[^}]+\}/)?.[0] ?? '';
    const rememberCheckedRule = styles.match(/\.login-remember input:checked \+ \.login-remember__box\s*\{[^}]+\}/)?.[0] ?? '';

    expect(shellRule).toContain('width: min(540px, calc(100vw - 32px));');
    expect(shellRule).toContain('overflow: visible;');
    expect(shellRule).toContain('border-radius: 22px;');
    expect(shellRule).toContain('background: rgba(255, 255, 255, 0.78);');
    expect(shellRule).toContain('backdrop-filter: blur(18px);');
    expect(shellRule).toContain('border: 1px solid rgba(255, 255, 255, 0.72);');
    expect(shellRule).toContain(
      'box-shadow: 0 24px 80px rgba(48, 109, 248, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8);',
    );

    expect(panelRule).toContain('padding: 48px 34px;');
    expect(panelRule).toContain('gap: 16px;');
    expect(panelRule).toContain('background: transparent;');
    expect(headingRule).toContain('justify-self: center;');
    expect(headingRule).toContain('width: min(460px, 100%);');
    expect(headingBreatheRule).toContain('animation: login-form-heading-breathe 3.2s ease-in-out 420ms infinite;');
    expect(headingTextRule).toContain('text-align: center;');
    expect(headingTextRule).toContain('font-weight: 680;');
    expect(headingPhraseRule).toContain('display: inline-block;');
    expect(headingPhraseRule).toContain('background: repeating-linear-gradient(');
    expect(headingPhraseRule).toContain('background-size: 144px 100%;');
    expect(headingPhraseRule).toContain('background-clip: text;');
    expect(headingPhraseRule).toContain('color: transparent;');
    expect(headingPhraseRule).toContain('login-form-heading-shimmer 2.4s linear 520ms infinite;');
    expect(styles).toContain('background-position: -144px 50%;');
    expect(formRule).toContain('justify-self: center;');
    expect(formRule).toContain('width: min(460px, 100%);');

    expect(styles).not.toContain('.login-form-heading span');
    expect(styles).not.toContain('.login-form-heading h1');

    expect(inputRule).toContain('height: 44px;');
    expect(inputRule).toContain('border: 1px solid rgba(148, 163, 184, 0.28);');
    expect(inputRule).toContain('border-radius: 10px;');
    expect(inputRule).toContain('background: rgba(255, 255, 255, 0.76);');
    expect(focusRule).toContain('border-color: #306DF8;');
    expect(focusRule).toContain('box-shadow: 0 0 0 4px rgba(48, 109, 248, 0.12);');

    expect(buttonRule).toContain('background: linear-gradient(90deg, #306DF8 0%, #0EA5E9 52%, #19D3D3 100%);');
    expect(buttonRule).toContain('box-shadow: 0 14px 28px rgba(48, 109, 248, 0.24);');
    expect(buttonHoverRule).toContain(
      'background: linear-gradient(90deg, #306DF8 0%, #0EA5E9 52%, #19D3D3 100%);',
    );
    expect(buttonHoverRule).toContain('transform: translateY(-1px);');
    expect(rememberRule).toContain('gap: 8px !important;');
    expect(rememberRule).toContain('min-height: 22px;');
    expect(rememberInputRule).toContain('position: absolute;');
    expect(rememberInputRule).toContain('width: 18px;');
    expect(rememberInputRule).toContain('opacity: 0;');
    expect(rememberBoxRule).toContain('width: 18px;');
    expect(rememberBoxRule).toContain('border-radius: 5px;');
    expect(rememberBoxRule).toContain('background: rgba(255, 255, 255, 0.78);');
    expect(rememberCheckmarkRule).toContain('inset: 0;');
    expect(rememberCheckmarkRule).toContain('center / 14px 14px no-repeat;');
    expect(rememberCheckmarkRule).toContain('transform: scale(0.72);');
    expect(rememberCheckedRule).toContain('background: #306df7;');
  });

  it('空状态表格行不显示最后一行边框，避免空白区域中间出现横线', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const emptyLastRowRule = styles.match(
      /\.task-table-scroll\s+\.task-table\s+tr\.task-table__empty-row:last-child\s+td,\s*\.task-market-table-frame\s+\.task-table\s+tr\.task-table__empty-row:last-child\s+td,\s*\.template-manager-table-scroll\s+\.template-manager-table\s+tr\.task-table__empty-row:last-child\s+td,\s*\.my-data-table-frame\s+\.my-data-table\s+tr\.task-table__empty-row:last-child\s+td\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(emptyLastRowRule).toContain('border-bottom: 0;');
  });

  it('标注员已领取任务列表使用和任务表格一致的底部分页结构', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const myDataPanelRule = styles.match(/\.labeler-task-workspace\s+\.my-data-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const myDataFrameRule = styles.match(/\.my-data-table-frame\s*\{[^}]+\}/)?.[0] ?? '';
    const myDataFillerRule = styles.match(
      /\.task-table-scroll::after,\s*\.task-market-table-frame::after,\s*\.template-manager-table-scroll::after,\s*\.my-data-table-frame::after\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(myDataPanelRule).toContain('display: flex;');
    expect(myDataPanelRule).toContain('flex-direction: column;');
    expect(myDataPanelRule).toContain('overflow: hidden;');
    expect(myDataFrameRule).toContain('flex: 1 1 auto;');
    expect(myDataFrameRule).toContain('overflow-y: hidden;');
    expect(myDataFillerRule).toContain('flex: 1 1 auto;');
  });

  it('标注台报告题目按钮不再使用标题栏操作区专用样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const submitBarButtonRule = styles.match(/\.annotation-submit-bar button\s*\{[^}]+\}/)?.[0] ?? '';

    expect(submitBarButtonRule).toContain('min-height: 34px;');
    expect(styles).not.toContain('.workbench-topline__actions button');
    expect(styles).not.toContain('.workbench-topline__report');
    expect(styles).not.toContain('.annotation-canvas-toolbar');
  });

  it('标注台提交栏上方不保留滚动区白色留白', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const canvasPanelRule = styles.match(/\.annotation-canvas-panel\s*\{[^}]+\}/)?.[0] ?? '';
    const canvasScrollRule = styles.match(/\.annotation-canvas-scroll\s*\{[^}]+\}/)?.[0] ?? '';

    expect(canvasPanelRule).toContain('gap: 0;');
    expect(canvasScrollRule).toContain('padding: 16px 16px 0;');
  });

  it('题目导航状态使用固定强调色、加粗和切换动画', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const statusRule = styles.match(/\.question-navigator__list small\s*\{[^}]+\}/)?.[0] ?? '';
    const statusTextRule = styles.match(/\.question-navigator__status-text\s*\{[^}]+\}/)?.[0] ?? '';

    expect(statusRule).toContain('font-weight: 800;');
    expect(styles).toContain('.question-navigator__status--in-progress');
    expect(styles).toContain('.question-navigator__status--submitted');
    expect(styles).toContain('.question-navigator__status--draft');
    expect(styles).toContain('.question-navigator__status--complete');
    expect(styles).toContain('.question-navigator__status--pending');
    expect(styles).toContain('.question-navigator__list .question-navigator__status--draft');
    expect(styles).toContain('.question-navigator__list .question-navigator__status--complete');
    expect(styles).toContain('color: #306df7;');
    expect(styles).toContain('color: #d97706;');
    expect(styles).toContain('color: #079455;');
    expect(styles).toContain('color: #64748b;');
    expect(statusTextRule).toContain('animation: question-status-change');
    expect(styles).toContain('@keyframes question-status-change');
  });

  it('侧边栏收起按钮上边线与任务表格底部分页分隔线对齐', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const shellRule = styles.match(/\.owner-shell,\s*\.labeler-shell,\s*\.agent-shell,\s*\.reviewer-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const sidebarRule = styles.match(/\.portal-sidebar\s*\{[^}]+\}/)?.[0] ?? '';

    expect(shellRule).toContain('--portal-sidebar-bottom-offset: 24px;');
    expect(sidebarRule).toContain('padding: 18px 10px var(--portal-sidebar-bottom-offset);');
  });

  it('侧边栏资源 SVG 图标使用 mask 继承导航激活颜色', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const assetIconRule = styles.match(
      /\.portal-nav__icon\.portal-nav__icon--asset::before\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const assetIconAfterRule = styles.match(
      /\.portal-nav__icon\.portal-nav__icon--asset::after\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(assetIconRule).toContain('background: currentColor;');
    expect(assetIconRule).toContain('-webkit-mask: var(--portal-nav-icon-url) center / contain no-repeat;');
    expect(assetIconRule).toContain('mask: var(--portal-nav-icon-url) center / contain no-repeat;');
    expect(assetIconAfterRule).toContain('content: none;');
  });

  it('侧边栏导航图标不再带独立圆角方形底板', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const iconRule = styles.match(/\.portal-nav__icon\s*\{[^}]+\}/)?.[0] ?? '';
    const activeIconRule = styles.match(/\.portal-nav a\.active \.portal-nav__icon\s*\{[^}]+\}/)?.[0] ?? '';
    const hoverIconRule = styles.match(/\.portal-nav a:not\(\.active\):hover \.portal-nav__icon\s*\{[^}]+\}/)?.[0] ?? '';

    expect(iconRule).toContain('border-radius: 0;');
    expect(iconRule).toContain('color: #475569;');
    expect(iconRule).toContain('background: transparent;');
    expect(iconRule).toContain('box-shadow: none;');
    expect(activeIconRule).toContain('color: #306df7;');
    expect(activeIconRule).toContain('background: transparent;');
    expect(activeIconRule).toContain('box-shadow: none;');
    expect(hoverIconRule).toContain('color: #475569;');
    expect(hoverIconRule).toContain('background: transparent;');
    expect(hoverIconRule).toContain('box-shadow: none;');
  });

  it('侧边栏激活项使用浅蓝全宽背景并保留左侧蓝色竖线', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const activeLinkRule = styles.match(/\.portal-nav a\s*\{[^}]+\}/)?.[0] ?? '';
    const activeBarRule = styles.match(/\.portal-nav a\.active::before\s*\{[^}]+\}/)?.[0] ?? '';
    const activeRule = styles.match(/\.portal-nav a\.active\s*\{[^}]+\}/)?.[0] ?? '';
    const iconRule = styles.match(/\.portal-nav__icon\s*\{[^}]+\}/)?.[0] ?? '';
    const labelRule = styles.match(/\.portal-nav__label\s*\{[^}]+\}/)?.[0] ?? '';

    expect(activeLinkRule).toContain('position: relative;');
    expect(activeLinkRule).toContain('border-radius: 3px;');
    expect(activeRule).toContain('color: #172033;');
    expect(activeRule).toContain('background: #eaf1ff;');
    expect(activeBarRule).toContain('position: absolute;');
    expect(activeBarRule).toContain('top: 0.4px;');
    expect(activeBarRule).toContain('bottom: 0.4px;');
    expect(activeBarRule).toContain('left: 0.2px;');
    expect(activeBarRule).toContain('width: 3px;');
    expect(activeBarRule).toContain('border-radius: 999px;');
    expect(activeBarRule).toContain('background: #306df7;');
    expect(iconRule).toContain('z-index: 1;');
    expect(labelRule).toContain('z-index: 1;');
  });

  it('任务管理、任务广场和导出中心导航图标使用更大的 mask 区域增强线条重量', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const weightedIconRule = styles.match(
      /\.portal-nav__icon--tasks\.portal-nav__icon--asset::before,\s*\.portal-nav__icon--market\.portal-nav__icon--asset::before,\s*\.portal-nav__icon--exports\.portal-nav__icon--asset::before\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(weightedIconRule).toContain('inset: 0;');
  });

  it('侧边栏在桌面大屏下同步放大展开态、收起态、图标和导航项尺寸', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

    expect(styles).toContain('--portal-sidebar-width: 148px;');
    expect(styles).toContain('--portal-sidebar-collapsed-width: 62px;');
    expect(styles).toContain('--portal-sidebar-width: 176px;');
    expect(styles).toContain('--portal-sidebar-collapsed-width: 72px;');
    expect(styles).toContain('--portal-sidebar-width: 196px;');
    expect(styles).toContain('--portal-sidebar-collapsed-width: 78px;');
    expect(styles).toContain('min-height: 48px;');
    expect(styles).toContain('grid-template-columns: 26px minmax(0, 1fr);');
    expect(styles).toContain('width: 48px;');
    expect(styles).toContain('min-height: 54px;');
    expect(styles).toContain('grid-template-columns: 30px minmax(0, 1fr);');
    expect(styles).toContain('width: 54px;');
  });

  it('任务抽屉底部横线与任务表格倒数第二条横线对齐', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const drawerFooterRule = styles.match(/\.task-publish-drawer__footer\s*\{[^}]+\}/)?.[0] ?? '';

    expect(drawerFooterRule).toContain('min-height: 66px;');
    expect(drawerFooterRule).toContain('padding: 11px 18px 12px;');
    expect(drawerFooterRule).toContain('border-top: 1px solid #d8e2f3;');
  });

  it('题目数据预览按钮悬浮底色紧贴图标和文案', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const previewButtonRule = styles.match(/\.task-dataset-import__preview\s*\{[^}]+\}/)?.[0] ?? '';
    const previewButtonHoverRule = styles.match(
      /\.task-dataset-import__preview:hover:not\(:disabled\),\s*\.task-dataset-import__preview:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(previewButtonRule).toContain('width: max-content;');
    expect(previewButtonRule).toContain('min-height: 36px;');
    expect(previewButtonRule).toContain('border-radius: 999px;');
    expect(previewButtonRule).toContain('padding: 0 9px;');
    expect(previewButtonHoverRule).toContain('background: #eff6ff;');
    expect(previewButtonHoverRule).toContain('box-shadow: 0 6px 14px rgba(48, 109, 248, 0.12);');
  });

  it('截止时间确定按钮悬浮态复用日期格浅蓝高亮', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const confirmRule = styles.match(/\.task-deadline-picker__confirm\s*\{[^}]+\}/)?.[0] ?? '';
    const confirmHoverRule = styles.match(
      /\.task-publish-drawer \.task-deadline-picker__confirm:hover:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(confirmRule).toContain('width: 104px;');
    expect(confirmRule).toContain('border: 1px solid #c9d8f6;');
    expect(confirmRule).toContain('color: #306df8;');
    expect(confirmRule).toContain('background: transparent;');
    expect(confirmHoverRule).toContain('color: #306df8;');
    expect(confirmHoverRule).toContain('background: #edf4ff;');
  });

  it('模板配置抽屉在桌面端占浏览器宽度的 90%', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templateDrawerRule = styles.match(/\.template-designer-page--drawer\s*\{[^}]+\}/)?.[0] ?? '';

    expect(templateDrawerRule).toContain('width: 90vw;');
    expect(templateDrawerRule).not.toContain('width: min(1280px, calc(100vw - 120px));');
  });

  it('评测模板列表顶部参照任务管理页使用统计按钮和搜索新增区', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templateFilterRule = styles.match(/\.task-filter-bar\.template-manager-filter-bar\s*\{[^}]+\}/)?.[0] ?? '';
    const templateSummaryRule = styles.match(/\.task-summary-grid\.template-summary-grid\s*\{[^}]+\}/)?.[0] ?? '';
    const templateSearchRule = styles.match(/\.template-manager-filter-bar\s*>\s*input\s*\{[^}]+\}/)?.[0] ?? '';

    expect(templateFilterRule).toContain(
      'grid-template-columns: minmax(280px, 420px) max-content;',
    );
    expect(templateFilterRule).toContain('width: 100%;');
    expect(templateSummaryRule).toContain('grid-template-columns: repeat(3, minmax(0, 122px));');
    expect(templateSummaryRule).toContain('width: auto;');
    expect(templateSearchRule).toContain('min-width: 0;');
  });

  it('导出中心搜索框宽度规则和评测模板搜索框保持一致', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templateFilterRule = styles.match(/\.task-filter-bar\.template-manager-filter-bar\s*\{[^}]+\}/)?.[0] ?? '';
    const exportFilterRule = styles.match(/\.export-task-filter-bar\s*\{[^}]+\}/)?.[0] ?? '';
    const exportSearchRule = styles.match(/\.export-task-filter-bar\s*>\s*input\s*\{[^}]+\}/)?.[0] ?? '';

    expect(templateFilterRule).toContain(
      'grid-template-columns: minmax(280px, 420px) max-content;',
    );
    expect(exportFilterRule).toContain(
      'grid-template-columns: minmax(280px, 420px) max-content;',
    );
    expect(exportFilterRule).toContain('width: 100%;');
    expect(exportSearchRule).toContain('min-width: 0;');
  });

  it('导出中心批量导出按钮和评测模板新增按钮保持同一最小宽度', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const actionWidthRule =
      styles.match(/\.template-manager-filter-bar__create,[\s\S]*?\.task-filter-bar__create\.export-batch-action\s*\{[^}]+\}/)?.[0] ??
      '';
    const exportBatchFilterActionRules = [...styles.matchAll(/\.task-filter-bar__create\.export-batch-action\s*\{[^}]+\}/g)].map(
      (match) => match[0],
    );

    expect(actionWidthRule).toContain('min-width: 102px;');
    expect(exportBatchFilterActionRules.some((rule) => rule.includes('font-size: inherit;'))).toBe(true);
  });

  it('任务管理表格使用大卡片、顶部胶囊筛选和更高表格行', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const cardRule = styles.match(/\.task-management-table-card\s*\{[^}]+\}/)?.[0] ?? '';
    const toolbarRule = styles.match(/\.task-management-table-toolbar\s*\{[^}]+\}/)?.[0] ?? '';
    const summaryGridRule = styles.match(/\.task-summary-grid\s*\{[^}]+\}/)?.[0] ?? '';
    const summaryRule = styles.match(/\.task-summary-card\s*\{[^}]+\}/)?.[0] ?? '';
    const totalSummaryRule =
      styles.match(/\.task-summary-card--total,[\s\S]*?\.task-summary-card--total\.is-active:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const totalSummaryTextRule =
      styles.match(/\.task-summary-card--total span,[\s\S]*?\.task-summary-card--total\.is-active strong\s*\{[^}]+\}/)?.[0] ?? '';
    const neutralSummaryRule =
      styles.match(/\.task-summary-card--draft,[\s\S]*?\.task-summary-card--draft\.is-active:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const neutralSummaryTextRule =
      styles.match(/\.task-summary-card--draft span,[\s\S]*?\.task-summary-card--draft\.is-active strong\s*\{[^}]+\}/)?.[0] ?? '';
    const runningSummaryRule =
      styles.match(/\.task-summary-card--running,[\s\S]*?\.task-summary-card--running\.is-active:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const runningSummaryTextRule =
      styles.match(/\.task-summary-card--running span,[\s\S]*?\.task-summary-card--running\.is-active strong\s*\{[^}]+\}/)?.[0] ?? '';
    const doneSummaryRule =
      styles.match(/\.task-summary-card--done,[\s\S]*?\.task-summary-card--done\.is-active:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const doneSummaryTextRule =
      styles.match(/\.task-summary-card--done span,[\s\S]*?\.task-summary-card--done\.is-active strong\s*\{[^}]+\}/)?.[0] ?? '';
    const pausedSummaryRule =
      styles.match(/\.task-summary-card--paused,[\s\S]*?\.task-summary-card--paused\.is-active:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ?? '';
    const pausedSummaryTextRule =
      styles.match(/\.task-summary-card--paused span,[\s\S]*?\.task-summary-card--paused\.is-active strong\s*\{[^}]+\}/)?.[0] ?? '';
    const filterRule = styles.match(/\.task-filter-bar\s*\{[^}]+\}/)?.[0] ?? '';
    const taskHeaderRule = styles.match(/\.task-management-table-card \.task-table th\s*\{[^}]+\}/)?.[0] ?? '';
    const taskCellRule = styles.match(/\.task-management-table-card \.task-table td\s*\{[^}]+\}/)?.[0] ?? '';
    const idRule = styles.match(/\.task-management-table-card \.task-table__id code\s*\{[^}]+\}/)?.[0] ?? '';

    expect(cardRule).toContain('border-radius: var(--table-card-radius);');
    expect(cardRule).toContain('background: #ffffff;');
    expect(toolbarRule).toContain('grid-template-columns: minmax(560px, 680px) minmax(0, 1fr);');
    expect(summaryGridRule).toContain('display: grid;');
    expect(summaryGridRule).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));');
    expect(summaryRule).toContain('border-radius: 10px;');
    expect(summaryRule).toContain('min-height: 46px;');
    expect(summaryRule).toContain('background: #E4EEFF;');
    expect(summaryRule).toContain('box-shadow: none;');
    expect(styles.match(/\.task-summary-grid strong\s*\{[^}]+\}/)?.[0] ?? '').toContain('font-weight: 800;');
    expect(totalSummaryRule).toContain('background: #E6F0FF;');
    expect(totalSummaryRule).toContain('box-shadow: none;');
    expect(totalSummaryTextRule).toContain('color: #2E5BFF;');
    expect(neutralSummaryRule).toContain('background: #F3F4F6;');
    expect(neutralSummaryRule).toContain('box-shadow: none;');
    expect(neutralSummaryTextRule).toContain('color: #64748B;');
    expect(runningSummaryRule).toContain('background: #FFF7E6;');
    expect(runningSummaryRule).toContain('box-shadow: none;');
    expect(runningSummaryTextRule).toContain('color: #D97706;');
    expect(doneSummaryRule).toContain('background: #E8F7EF;');
    expect(doneSummaryRule).toContain('box-shadow: none;');
    expect(doneSummaryTextRule).toContain('color: #0FB86B;');
    expect(pausedSummaryRule).toContain('background: #FEF2F2;');
    expect(pausedSummaryRule).toContain('box-shadow: none;');
    expect(pausedSummaryTextRule).toContain('color: #DC2626;');
    expect(filterRule).toContain(
      'grid-template-columns: minmax(280px, 420px) max-content;',
    );
    expect(taskHeaderRule).toContain('height: 64px;');
    expect(taskCellRule).toContain('height: 78px;');
    expect(idRule).toContain('background: #eaf1ff;');
  });

  it('评测模板表格使用任务管理页同款卡片表格外框', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templatePanelRule = styles.match(/\.template-manager-table-panel\s*\{[^}]+\}/)?.[0] ?? '';
    const templateScrollRule =
      styles.match(/\.template-manager-table-panel\.task-management-table-card \.template-manager-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const templateTableRule =
      styles.match(/\.template-manager-table-panel\.task-management-table-card \.template-manager-table\s*\{[^}]+\}/)?.[0] ?? '';

    expect(templatePanelRule).toContain('margin-top: 0;');
    expect(templateScrollRule).toContain('border: 1px solid #edf1f7;');
    expect(templateScrollRule).toContain('border-radius: 12px;');
    expect(templateTableRule).toContain('min-width: 1120px;');
  });

  it('后台列表页统一右侧灰色区域里的表格工作区尺寸规则', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rootRule = styles.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
    const pageRule =
      styles.match(
        /\.task-management-page,\s*\.template-manager-page,\s*\.export-center-page,\s*\.task-market-page,\s*\.labeler-task-workspace,\s*\.agent-review-page,\s*\.manual-review-list-page\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const headerRule =
      styles.match(
        /\.task-management-header,\s*\.export-center-header,\s*\.task-market-page-title,\s*\.labeler-task-workspace \.my-data-header,\s*\.agent-review-page__header,\s*\.manual-review-list-header\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const titleRule =
      styles.match(
        /\.task-management-header h1,\s*\.export-center-header h1,\s*\.task-market-page-title h1,\s*\.labeler-task-workspace \.my-data-header h1,\s*\.agent-review-page__header h1,\s*\.manual-review-list-header h1\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const panelRule =
      styles.match(
        /\.task-market-table-panel\.task-management-table-card,\s*\.agent-review-table-panel\.task-management-table-card,\s*\.manual-review-task-table-panel\.task-management-table-card\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const flexRule =
      styles.match(
        /\.export-center-workspace,\s*\.export-records-section,\s*\.export-task-table-panel,[\s\S]*?\.manual-review-list-page > \.task-management-table-card\s*\{[^}]+\}/,
      )?.[0] ?? '';

    expect(rootRule).toContain('--table-page-background: #F7F8FB;');
    expect(rootRule).toContain('--table-page-padding-inline: 32px;');
    expect(rootRule).toContain('--table-page-title-height: 25px;');
    expect(rootRule).toContain('--table-page-title-font-size: 20px;');
    expect(pageRule).toContain('height: calc(100vh - var(--platform-topbar-height));');
    expect(pageRule).toContain(
      'padding: var(--table-page-padding-block-start) var(--table-page-padding-inline) var(--table-page-padding-block-end);',
    );
    expect(pageRule).toContain('background: var(--table-page-background);');
    expect(headerRule).toContain('min-height: var(--table-page-title-height);');
    expect(headerRule).toContain('margin: 0 0 var(--table-page-header-gap);');
    expect(titleRule).toContain('font-size: var(--table-page-title-font-size);');
    expect(titleRule).toContain('font-weight: 700;');
    expect(panelRule).toContain('margin-top: 0;');
    expect(flexRule).toContain('flex: 1 1 auto;');
  });

  it('模板配置物料 SVG 图标替换旧的富文本和 JSON 伪元素图标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const fileUploadSvgRule = styles.match(
      /\.designer-material__icon--file_upload\s+\.designer-material__icon-svg\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const materialOverlayRule = styles.match(/\.designer-material-drag-overlay\s*\{[^}]+\}/)?.[0] ?? '';
    const materialOverlayExpandedRule =
      styles.match(/\.designer-material-drag-overlay\.is-expanded\s*\{[^}]+\}/)?.[0] ?? '';
    const fieldDropCommitKeyframes =
      styles.match(/@keyframes designer-field-drop-commit\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(styles).not.toContain(".designer-material__icon--rich_text::before {\n  content: 'B';");
    expect(styles).not.toContain(".designer-material__icon--json_editor::before {\n  content: '{}';");
    expect(fileUploadSvgRule).toContain('width: 16px;');
    expect(fileUploadSvgRule).toContain('height: 16px;');
    expect(materialOverlayRule).toContain('animation: designer-material-overlay-enter 180ms');
    expect(materialOverlayRule).toContain('transform: var(--designer-material-overlay-transform);');
    expect(materialOverlayExpandedRule).toContain('--designer-material-overlay-transform: scale(1);');
    expect(styles).toContain('@keyframes designer-material-overlay-enter');
    expect(fieldDropCommitKeyframes).toContain('box-shadow: inset 0 0 0 1px rgba(48, 109, 247, 0.28)');
    expect(fieldDropCommitKeyframes).not.toContain('transform:');
  });

  it('labeler 选项气泡的真实输入框保持在气泡原位，避免点击时页面滚动跳动', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const bubbleRule = styles.match(/\.schema-field\s+\.schema-choice-bubble\s*\{[^}]+\}/)?.[0] ?? '';
    const inputRule = styles.match(/\.schema-choice-bubble\s+input\s*\{[^}]+\}/)?.[0] ?? '';
    const surfaceRule = styles.match(/\.schema-choice-bubble__surface\s*\{[^}]+\}/)?.[0] ?? '';

    expect(bubbleRule).toContain('position: relative;');
    expect(inputRule).toContain('inset: 0;');
    expect(inputRule).toContain('width: 100%;');
    expect(inputRule).toContain('height: 100%;');
    expect(inputRule).toContain('opacity: 0;');
    expect(inputRule).not.toContain('clip-path');
    expect(surfaceRule).toContain('pointer-events: none;');

    expect(styles).toContain(
      '.schema-choice-bubble:hover input:checked:not(:disabled) + .schema-choice-bubble__surface',
    );
    expect(styles).toContain('@keyframes autosave-time-refresh');
  });

  it('模板配置布局物料使用资源 SVG 图标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const assetRule = styles.match(/\.designer-material__icon--asset\s*\{[^}]+\}/)?.[0] ?? '';
    const assetPseudoRule = styles.match(
      /\.designer-material__icon--svg::before,\s*\.designer-material__icon--svg::after,\s*\.designer-material__icon--asset::before,\s*\.designer-material__icon--asset::after\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const assetImageRule = styles.match(/\.designer-material__icon-img\s*\{[^}]+\}/)?.[0] ?? '';

    expect(assetRule).toContain('display: grid;');
    expect(assetRule).toContain('place-items: center;');
    expect(assetPseudoRule).toContain('content: none;');
    expect(assetImageRule).toContain('width: 20px;');
    expect(assetImageRule).toContain('height: 20px;');
    expect(assetImageRule).toContain('object-fit: contain;');
  });

  it('模板配置物料面板标题层级一致并缩小标题间距', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const materialsRule = styles.match(/\.designer-materials\s*\{[^}]+\}/)?.[0] ?? '';
    const groupTitleRule = styles.match(/\.designer-materials__group-title\s*\{[^}]+\}/)?.[0] ?? '';

    expect(materialsRule).toContain('gap: 10px;');
    expect(groupTitleRule).toContain('color: #172033;');
    expect(groupTitleRule).toContain('font-size: 18px;');
    expect(groupTitleRule).toContain('font-weight: 700;');
  });

  it('模板配置物料、画布和题目展示字段滚动条始终隐藏', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const materialsRule = styles.match(/\.designer-materials\s*\{[^}]+\}/)?.[0] ?? '';
    const hiddenScrollbarRule = styles.match(
      /\.designer-materials,\n\.designer-canvas,\n\.designer-show-item-fields\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const scrollbarGutterRule = styles.match(
      /\.designer-materials,\n\.designer-show-item-fields\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const webkitHiddenRule = styles.match(
      /\.designer-materials::-webkit-scrollbar,\n\.designer-canvas::-webkit-scrollbar,\n\.designer-show-item-fields::-webkit-scrollbar\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(materialsRule).toContain('scrollbar-color: transparent transparent;');
    expect(hiddenScrollbarRule).toContain('scrollbar-width: none;');
    expect(hiddenScrollbarRule).toContain('-ms-overflow-style: none;');
    expect(scrollbarGutterRule).toContain('scrollbar-gutter: auto;');
    expect(webkitHiddenRule).toContain('width: 0;');
    expect(webkitHiddenRule).toContain('height: 0;');
    expect(webkitHiddenRule).toContain('display: none;');
  });

  it('保存草稿确认弹窗使用响应式极简 SaaS 弹窗样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const panelRule = styles.match(/\.task-close-confirm__panel\s*\{[^}]+\}/)?.[0] ?? '';
    const headerRule = styles.match(/\.task-close-confirm__header\s*\{[^}]+\}/)?.[0] ?? '';
    const titleRule = styles.match(/\.task-close-confirm__panel h2\s*\{[^}]+\}/)?.[0] ?? '';
    const descriptionRule = styles.match(/\.task-close-confirm__panel p\s*\{[^}]+\}/)?.[0] ?? '';
    const closeRule = styles.match(/\.task-close-confirm__close\s*\{[^}]+\}/)?.[0] ?? '';
    const closeHoverRule =
      styles.match(/\.task-close-confirm__close:hover:not\(:disabled\),\s*\.task-close-confirm__close:focus-visible:not\(:disabled\)\s*\{[^}]+\}/)
        ?.[0] ?? '';
    const actionsRule = styles.match(/\.task-close-confirm__actions\s*\{[^}]+\}/)?.[0] ?? '';
    const cancelRule = styles.match(/\.task-close-confirm__cancel\s*\{[^}]+\}/)?.[0] ?? '';
    const cancelHoverRule = styles.match(
      /\.task-close-confirm__cancel:hover:not\(:disabled\),\s*\.task-close-confirm__cancel:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const saveRules = [...styles.matchAll(/\.task-close-confirm__save\s*\{[^}]+\}/g)].map((match) => match[0]);
    const saveRule = saveRules.join('\n');
    const saveHoverRule = styles.match(
      /\.task-close-confirm__save:hover:not\(:disabled\),\s*\.task-close-confirm__save:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const largeDesktopRule =
      styles.match(/@media \(min-width: 1600px\)\s*\{\s*\.task-close-confirm__panel\s*\{[^}]+\}\s*\}/)?.[0] ?? '';
    const tabletRule =
      styles.match(/@media \(max-width: 1024px\)\s*\{\s*\.task-close-confirm__panel\s*\{[^}]+\}\s*\}/)?.[0] ?? '';
    const mobileRule =
      styles.match(/@media \(max-width: 600px\)\s*\{[\s\S]*?\.task-close-confirm__panel\s*\{[^}]+\}/)?.[0] ?? '';

    expect(panelRule).toContain('width: min(480px, 34vw);');
    expect(panelRule).toContain('max-width: 520px;');
    expect(panelRule).toContain('min-width: min(360px, calc(100vw - 32px));');
    expect(panelRule).toContain('border: 1px solid #306df7;');
    expect(panelRule).toContain('border-radius: 16px;');
    expect(headerRule).toContain('justify-content: space-between;');
    expect(titleRule).toContain('font-size: 20px;');
    expect(titleRule).toContain('font-weight: 600;');
    expect(titleRule).toContain('color: #111827;');
    expect(descriptionRule).toContain('line-height: 1.7;');
    expect(descriptionRule).toContain('color: #6b7280;');
    expect(closeRule).toContain('width: 28px;');
    expect(closeRule).toContain('height: 28px;');
    expect(closeRule).toContain('border-radius: 8px;');
    expect(closeHoverRule).toContain('background: transparent;');
    expect(closeHoverRule).toContain('color: #9ca3af;');
    expect(closeHoverRule).toContain('box-shadow: none;');
    expect(closeHoverRule).toContain('transform: none;');
    expect(actionsRule).toContain('justify-content: flex-end;');
    expect(actionsRule).toContain('gap: 12px;');
    expect(cancelRule).toContain('border: 1px solid #c9d8f6;');
    expect(cancelRule).toContain('height: 40px;');
    expect(cancelRule).toContain('color: #306df7;');
    expect(cancelRule).toContain('background: transparent;');
    expect(cancelHoverRule).toContain('border-color: #c9d8f6;');
    expect(cancelHoverRule).toContain('height: 40px;');
    expect(cancelHoverRule).toContain('color: #306df7;');
    expect(cancelHoverRule).toContain('background: transparent;');
    expect(cancelHoverRule).toContain('box-shadow: none;');
    expect(cancelHoverRule).toContain('transform: none;');
    expect(cancelHoverRule).toContain('min-height: 40px;');
    expect(cancelHoverRule).toContain('padding: 0 18px;');
    expect(cancelHoverRule).toContain('transition: none;');
    expect(saveRule).toContain('min-height: 40px;');
    expect(saveRule).toContain('height: 40px;');
    expect(saveRule).toContain('border-radius: 10px;');
    expect(saveRule).toContain('padding: 0 20px;');
    expect(saveRule).toContain('background: #306df7;');
    expect(saveHoverRule).toContain('border-color: #306df7;');
    expect(saveHoverRule).toContain('height: 40px;');
    expect(saveHoverRule).toContain('color: #ffffff;');
    expect(saveHoverRule).toContain('background: #306df7;');
    expect(saveHoverRule).toContain('box-shadow: none;');
    expect(saveHoverRule).toContain('transform: none;');
    expect(saveHoverRule).toContain('min-height: 40px;');
    expect(saveHoverRule).toContain('padding: 0 20px;');
    expect(saveHoverRule).toContain('transition: none;');
    expect(styles).toContain('.template-designer-page .task-close-confirm__cancel:hover:not(:disabled)');
    expect(styles).toContain('.template-designer-page .task-close-confirm__save:hover:not(:disabled)');
    expect(largeDesktopRule).toContain('width: min(520px, 30vw);');
    expect(tabletRule).toContain('width: 80vw;');
    expect(mobileRule).toContain('width: calc(100vw - 32px);');
  });

  it('模板配置顶部栏更扁并不再保留右侧关闭按钮样式', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const topbarRule = styles.match(/\.template-designer-topbar\s*\{[^}]+\}/)?.[0] ?? '';
    const titleRule = styles.match(/\.template-designer-topbar h1\s*\{[^}]+\}/)?.[0] ?? '';
    const actionButtonRule = styles.match(/\.template-designer-topbar__actions button\s*\{[^}]+\}/)?.[0] ?? '';

    expect(topbarRule).toContain('padding: 9px 24px;');
    expect(topbarRule).toContain('gap: 16px;');
    expect(titleRule).toContain('font-size: 18px;');
    expect(actionButtonRule).toContain('min-height: 30px;');
    expect(actionButtonRule).toContain('padding: 5px 10px;');
    expect(styles).not.toContain('template-designer-drawer__close');
  });

  it('模板配置内部表格内容保持左对齐', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const globalCenterRule = styles.match(/\.task-table th,[\s\S]*?\.reviewer-review-table td\s*\{[^}]+\}/)?.[0] ?? '';
    const designerTableRule =
      styles.match(/\.template-designer-page table th,\s*\.template-designer-page table td\s*\{[^}]+\}/)?.[0] ?? '';

    expect(globalCenterRule).toContain('text-align: center;');
    expect(designerTableRule).toContain('text-align: left;');
  });

  it('ShowItem 展示表格在标注工作台保持左对齐', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const globalCenterRule = styles.match(/\.task-table th,[\s\S]*?\.reviewer-review-table td\s*\{[^}]+\}/)?.[0] ?? '';
    const showItemCellRule =
      styles.match(/\.schema-field__show-table th,\s*\.schema-field__show-table td\s*\{[^}]+\}/)?.[0] ?? '';
    const showItemValueRule = styles.match(/\.schema-field__show-value\s*\{[^}]+\}/)?.[0] ?? '';

    expect(globalCenterRule).not.toContain('.schema-field__show-table');
    expect(showItemCellRule).toContain('text-align: left;');
    expect(showItemCellRule).toContain('vertical-align: top;');
    expect(showItemValueRule).toContain('text-align: left;');
  });

  it('AI 预审题目列表建议文案按通过和非通过固定配色', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const passRule = styles.match(/\.agent-review-question-list__items em\.is-pass,[\s\S]*?color: #16a34a;[\s\S]*?\}/)?.[0] ?? '';
    const rejectRule = styles.match(/\.agent-review-question-list__items em\.is-reject,[\s\S]*?color: #dc2626;[\s\S]*?\}/)?.[0] ?? '';
    const oldHoverRule =
      styles.match(/\.agent-review-question-list__items button\.is-active em,\s*\.agent-review-question-list__items button:hover em,\s*\.agent-review-question-list__items button:focus-visible em\s*\{[^}]+\}/)?.[0] ?? '';

    expect(passRule).toContain('button.is-active em.is-pass');
    expect(passRule).toContain('button:hover em.is-pass');
    expect(rejectRule).toContain('button.is-active em.is-reject');
    expect(rejectRule).toContain('button:hover em.is-reject');
    expect(oldHoverRule).toBe('');
  });

  it('AI 预审字段卡片使用清晰的标题区和详情分区', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const cardRule = styles.match(/\.ai-review-context__field-card\s*\{[^}]+\}/)?.[0] ?? '';
    const headerRule = styles.match(/\.ai-review-context__field-header\s*\{[^}]+\}/)?.[0] ?? '';
    const keyRule = styles.match(/\.ai-review-context__field-key\s*\{[^}]+\}/)?.[0] ?? '';
    const detailsRule = styles.match(/\.ai-review-context__field-details\s*\{[^}]+\}/)?.[0] ?? '';
    const rowRule = styles.match(/\.ai-review-context__field-row\s*\{[^}]+\}/)?.[0] ?? '';
    const commentRowRule = styles.match(/\.ai-review-context__field-row--comment\s*\{[^}]+\}/)?.[0] ?? '';

    expect(cardRule).toContain('box-shadow:');
    expect(headerRule).toContain('border-bottom: 1px solid');
    expect(keyRule).toContain('font-family: ui-monospace');
    expect(detailsRule).toContain('display: grid;');
    expect(rowRule).toContain('grid-template-columns: minmax(128px, 0.26fr) minmax(0, 1fr);');
    expect(rowRule).toContain('gap: 16px;');
    expect(commentRowRule).toContain('background: rgba(255, 255, 255, 0.72);');
  });

  it('AI 预审后台和人工审核页隐藏所有内部滚动条但保留滚动', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const scrollbarHiddenRule = styles.match(
      /\.agent-review-page,[\s\S]*?\.manual-review-sheet-overlay \*\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const webkitScrollbarRule = styles.match(
      /\.agent-review-page::-webkit-scrollbar,[\s\S]*?\.manual-review-sheet-overlay \*::-webkit-scrollbar\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(scrollbarHiddenRule).toContain('.agent-review-page *');
    expect(scrollbarHiddenRule).toContain('.agent-review-sheet-overlay *');
    expect(scrollbarHiddenRule).toContain('.manual-review-list-page *');
    expect(scrollbarHiddenRule).toContain('.manual-review-sheet-overlay *');
    expect(scrollbarHiddenRule).toContain('scrollbar-width: none;');
    expect(scrollbarHiddenRule).toContain('-ms-overflow-style: none;');
    expect(webkitScrollbarRule).toContain('display: none;');
    expect(webkitScrollbarRule).toContain('width: 0;');
    expect(webkitScrollbarRule).toContain('height: 0;');
  });

  it('人工审核操作按钮固定在中间画布底部白色操作栏且不随内容滚动', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const mainRule = styles.match(/\.manual-review-detail-main\s*\{[^}]+\}/)?.[0] ?? '';
    const contentRule = styles.match(/\.manual-review-detail-content\s*\{[^}]+\}/)?.[0] ?? '';
    const actionBarRule = styles.match(/\.manual-review-actions\s*\{[^}]+\}/)?.[0] ?? '';

    expect(mainRule).toContain('grid-template-rows: minmax(0, 1fr) auto;');
    expect(mainRule).toContain('overflow: hidden;');
    expect(mainRule).toContain('padding: 0;');
    expect(contentRule).toContain('overflow: auto;');
    expect(contentRule).toContain('padding: 14px;');
    expect(actionBarRule).not.toContain('position: sticky;');
    expect(actionBarRule).not.toContain('bottom: -14px;');
    expect(actionBarRule).toContain('z-index: 5;');
    expect(actionBarRule).toContain('margin: 0;');
    expect(actionBarRule).toContain('border-top: 1px solid #e5e9f0;');
    expect(actionBarRule).toContain('background: #ffffff;');
    expect(actionBarRule).toContain('box-shadow: 0 -12px 24px rgba(15, 23, 42, 0.08);');
  });

  it('人工审核详情左侧队列栏收窄且批量选择区带复选框', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const shellRule = styles.match(/\.manual-review-detail-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const batchSelectionRule =
      styles.match(/\.manual-review-batch-toolbar__selection\s*\{[^}]+\}/)?.[0] ?? '';
    const batchSelectionInputRule =
      styles.match(/\.manual-review-batch-toolbar__selection input\s*\{[^}]+\}/)?.[0] ?? '';

    expect(shellRule).toContain(
      'grid-template-columns: minmax(280px, 300px) minmax(560px, 1fr) minmax(280px, 320px);',
    );
    expect(batchSelectionRule).toContain('display: inline-flex;');
    expect(batchSelectionRule).toContain('gap: 7px;');
    expect(batchSelectionInputRule).toContain('width: 15px;');
    expect(batchSelectionInputRule).toContain('accent-color: #306df8;');
  });

  it('人工审核详情关闭按钮样式与 AI 预审详情关闭按钮保持一致', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const manualCloseRule =
      styles.match(/\.manual-review-detail-toolbar__actions \.manual-review-sheet-close\s*\{[^}]+\}/)?.[0] ?? '';
    const manualCloseHoverRule =
      styles.match(/\.manual-review-detail-toolbar__actions \.manual-review-sheet-close:hover,[\s\S]*?\.manual-review-detail-toolbar__actions \.manual-review-sheet-close:focus-visible\s*\{[^}]+\}/)?.[0] ?? '';

    expect(manualCloseRule).toContain('width: 38px;');
    expect(manualCloseRule).toContain('min-width: 38px;');
    expect(manualCloseRule).toContain('min-height: 34px;');
    expect(manualCloseRule).toContain('border: 1px solid #c9d8f6;');
    expect(manualCloseRule).toContain('border-radius: 8px;');
    expect(manualCloseRule).toContain('background: #ffffff;');
    expect(manualCloseRule).toContain('color: #306df7;');
    expect(manualCloseRule).toContain('font-size: 24px;');
    expect(manualCloseHoverRule).toContain('border-color: #306df8;');
    expect(manualCloseHoverRule).toContain('background: #f8fbff;');
    expect(manualCloseHoverRule).toContain('outline: none;');
  });

  it('ShowItem 字段配置卡片使用只读 chip 和轻量表单控件', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const panelRule = styles.match(/\.designer-properties--show-item\s*\{[^}]+\}/)?.[0] ?? '';
    const inspectorPanelRule = styles.match(
      /\.designer-inspector > \.designer-properties--show-item\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const stackRule = styles.match(
      /\.designer-properties--show-item \.designer-property-stack--show-item\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const configRule = styles.match(/\.designer-show-item-config\s*\{[^}]+\}/)?.[0] ?? '';
    const headerRule = styles.match(/\.designer-show-item-config__header\s*\{[^}]+\}/)?.[0] ?? '';
    const headerBackdropRule = styles.match(/\.designer-show-item-config__header::before\s*\{[^}]+\}/)?.[0] ?? '';
    const statsRule = styles.match(/\.designer-show-item-stats\s*\{[^}]+\}/)?.[0] ?? '';
    const statCardRule = styles.match(/\.designer-show-item-stats span\s*\{[^}]+\}/)?.[0] ?? '';
    const firstStatCardRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(1\)\s*\{[^}]+\}/)?.[0] ?? '';
    const secondStatCardRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(2\)\s*\{[^}]+\}/)?.[0] ?? '';
    const thirdStatCardRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(3\)\s*\{[^}]+\}/)?.[0] ?? '';
    const firstStatNumberRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(1\) strong\s*\{[^}]+\}/)?.[0] ?? '';
    const secondStatNumberRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(2\) strong\s*\{[^}]+\}/)?.[0] ?? '';
    const thirdStatNumberRule =
      styles.match(/\.designer-show-item-stats span:nth-child\(3\) strong\s*\{[^}]+\}/)?.[0] ?? '';
    const fieldsRule = styles.match(/\.designer-show-item-fields\s*\{[^}]+\}/)?.[0] ?? '';
    const cardRule = styles.match(/\.designer-show-item-field\s*\{[^}]+\}/)?.[0] ?? '';
    const focusedCardRule = styles.match(/\.designer-show-item-field:focus-within\s*\{[^}]+\}/)?.[0] ?? '';
    const sourceRule = styles.match(/\.designer-show-item-field__source\s*\{[^}]+\}/)?.[0] ?? '';
    const filterSelectOpenRule = styles.match(
      /\.designer-show-item-control \.task-filter-select:has\(\.task-filter-select__menu\)\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const filterSelectMenuRule = styles.match(
      /\.designer-show-item-control \.task-filter-select__menu\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const addHoverRule = styles.match(
      /\.template-designer-page \.designer-show-item-config__add:hover:not\(:disabled\),\s*\.template-designer-page \.designer-show-item-config__add:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const addActiveRule = styles.match(
      /\.template-designer-page \.designer-show-item-config__add:active:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const controlRule = styles.match(
      /\.designer-show-item-control input,\s*\.designer-show-item-control select\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const deleteHoverRule = styles.match(
      /\.template-designer-page \.designer-show-item-field__delete:hover:not\(:disabled\),\s*\.template-designer-page \.designer-show-item-field__delete:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(panelRule).toContain('overflow: hidden;');
    expect(panelRule).toContain('display: flex;');
    expect(inspectorPanelRule).toContain('overflow: hidden;');
    expect(stackRule).toContain('min-height: 0;');
    expect(stackRule).toContain('overflow: hidden;');
    expect(configRule).toContain('--designer-show-item-inline-padding: 16px;');
    expect(configRule).toContain('--designer-show-item-scrollbar-gutter: 0px;');
    expect(configRule).toContain('flex-direction: column;');
    expect(configRule).toContain('overflow: hidden;');
    expect(headerRule).toContain('position: relative;');
    expect(headerRule).toContain('flex: 0 0 auto;');
    expect(headerRule).toContain('background: #ffffff;');
    expect(headerRule).toContain('backdrop-filter: none;');
    expect(headerRule).toContain('isolation: isolate;');
    expect(headerRule).toContain('z-index: 30;');
    expect(headerRule).toContain('calc(var(--designer-show-item-inline-padding) + var(--designer-show-item-scrollbar-gutter))');
    expect(headerBackdropRule).toContain('inset: 0;');
    expect(headerBackdropRule).toContain('background: #ffffff;');
    expect(statsRule).toContain('width: 100%;');
    expect(statsRule).toContain('align-self: stretch;');
    expect(statsRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(statCardRule).toContain('border: 0;');
    expect(firstStatCardRule).toContain('background: #eef4ff;');
    expect(secondStatCardRule).toContain('background: #eafbf0;');
    expect(thirdStatCardRule).toContain('background: #fff8e0;');
    expect(firstStatNumberRule).toContain('color: #306DFF;');
    expect(secondStatNumberRule).toContain('color: #06B429;');
    expect(thirdStatNumberRule).toContain('color: #FFC000;');
    expect(fieldsRule).toContain('min-height: 0;');
    expect(fieldsRule).toContain('flex: 1 1 auto;');
    expect(fieldsRule).toContain('overflow-y: auto;');
    expect(fieldsRule).toContain('scrollbar-gutter: auto;');
    expect(fieldsRule).toContain('padding: 12px var(--designer-show-item-inline-padding) 18px;');
    expect(cardRule).toContain('width: 100%;');
    expect(cardRule).toContain('border-radius: 8px;');
    expect(cardRule).toContain('padding: 12px;');
    expect(cardRule).toContain('position: relative;');
    expect(cardRule).toContain('z-index: 0;');
    expect(cardRule).toContain('backwards;');
    expect(cardRule).toContain('transform 180ms ease;');
    expect(focusedCardRule).toContain('z-index: 8;');
    expect(filterSelectOpenRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(filterSelectMenuRule).toContain('z-index: var(--overlay-dropdown-z-index);');
    expect(addHoverRule).toContain('background: #306df8;');
    expect(addHoverRule).toContain('transform: none;');
    expect(addActiveRule).toContain('transform: translateY(1px) scale(0.98);');
    expect(sourceRule).toContain('display: inline-flex;');
    expect(sourceRule).toContain('cursor: default;');
    expect(sourceRule).not.toMatch(/(^|\n)\s*width:\s*100%;/);
    expect(controlRule).toContain('min-height: 34px;');
    expect(controlRule).toContain('font-weight: 550;');
    expect(deleteHoverRule).toContain('color: #dc2626;');
    expect(deleteHoverRule).toContain('background: #fff1f2;');
  });

  it('模板名称编辑器默认无输入框外观并在编辑态使用下划线', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const canvasRule = styles.match(/\.designer-canvas\s*\{[^}]+\}/)?.[0] ?? '';
    const canvasToolbarRule = styles.match(/\.designer-canvas__toolbar\s*\{[^}]+\}/)?.[0] ?? '';
    const canvasHeaderRule = styles.match(/\.designer-canvas__header\s*\{[^}]+\}/)?.[0] ?? '';
    const canvasHeaderMetaRule = styles.match(/\.designer-canvas__header-meta\s*\{[^}]+\}/)?.[0] ?? '';
    const templateNameRule = styles.match(/\.designer-canvas__template-name\s*\{[^}]+\}/)?.[0] ?? '';
    const uploadedPreviewRule = styles.match(/\.designer-canvas__uploaded-preview\s*\{[^}]+\}/)?.[0] ?? '';
    const uploadedPreviewHoverRule =
      styles.match(/\.designer-canvas__uploaded-preview:hover,\s*\.designer-canvas__uploaded-preview:focus-visible\s*\{[^}]+\}/)?.[0] ??
      '';
    const uploadedPreviewScopedRule =
      styles.match(/\.template-designer-page \.designer-canvas__uploaded-preview\s*\{[^}]+\}/)?.[0] ?? '';
    const uploadedPreviewScopedHoverRule =
      styles.match(
        /\.template-designer-page \.designer-canvas__uploaded-preview:hover:not\(:disabled\),\s*\.template-designer-page \.designer-canvas__uploaded-preview:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const toolbarGroupRule = styles.match(/\.designer-canvas__toolbar-group\s*\{[^}]+\}/)?.[0] ?? '';
    const toolbarRightRule = styles.match(/\.designer-canvas__toolbar-group--right\s*\{[^}]+\}/)?.[0] ?? '';
    const labelerPreviewRule = styles.match(/\.designer-canvas__labeler-preview\s*\{[^}]+\}/)?.[0] ?? '';
    const triggerRule = styles.match(/\.designer-canvas__template-name-trigger\s*\{[^}]+\}/)?.[0] ?? '';
    const inputRule = Array.from(styles.matchAll(/\.designer-canvas__template-name-input\s*\{[^}]+\}/g))
      .map((match) => match[0])
      .find((rule) => rule.includes('border-bottom')) ?? '';
    const iconRule = styles.match(/\.designer-canvas__template-name-icon\s*\{[^}]+\}/)?.[0] ?? '';
    const templateButtonVarsRule = styles.match(
      /\.template-designer-page \.designer-canvas__template-name-trigger\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const templateTextScopedRule =
      styles.match(/\.template-designer-page \.designer-canvas__template-name-text\s*\{[^}]+\}/)?.[0] ?? '';

    expect(canvasRule).toContain('overflow-x: hidden;');
    expect(canvasRule).toContain('overflow-y: auto;');
    expect(canvasToolbarRule).toContain('display: flex;');
    expect(canvasToolbarRule).toContain('justify-content: space-between;');
    expect(canvasToolbarRule).toContain('gap: 12px;');
    expect(canvasToolbarRule).toContain('padding: 0 16px;');
    expect(toolbarGroupRule).toContain('display: inline-flex;');
    expect(toolbarRightRule).toContain('margin-left: auto;');
    expect(labelerPreviewRule).toContain('flex: 0 0 auto;');
    expect(canvasHeaderRule).toContain('grid-template-columns: minmax(0, 1fr) fit-content(260px);');
    expect(canvasHeaderRule).toContain('justify-content: stretch;');
    expect(canvasHeaderRule).toContain('justify-items: stretch;');
    expect(canvasHeaderMetaRule).toContain('justify-self: end;');
    expect(canvasHeaderMetaRule).toContain('flex-wrap: wrap;');
    expect(canvasHeaderMetaRule).toContain('justify-content: flex-end;');
    expect(canvasHeaderMetaRule).toContain('max-width: min(100%, 260px);');
    expect(templateNameRule).toContain('min-width: 0;');
    expect(templateNameRule).toContain('max-width: 100%;');
    expect(uploadedPreviewRule).toContain('--designer-button-color: #306df8;');
    expect(uploadedPreviewRule).toContain('--designer-button-background: #eff6ff;');
    expect(uploadedPreviewRule).toContain('max-width: 100%;');
    expect(uploadedPreviewRule).toContain('min-width: 0;');
    expect(uploadedPreviewRule).toContain('padding: 3px 6px 3px 2px;');
    expect(uploadedPreviewHoverRule).toContain('color: #306df8;');
    expect(uploadedPreviewHoverRule).toContain('background: #eff6ff;');
    expect(uploadedPreviewScopedRule).toContain('--designer-button-color: #306df8;');
    expect(uploadedPreviewScopedRule).toContain('color: #306df8;');
    expect(uploadedPreviewScopedHoverRule).toContain('color: #306df8;');
    expect(uploadedPreviewScopedHoverRule).not.toContain('color: #172033;');
    expect(triggerRule).toContain('width: fit-content;');
    expect(triggerRule).toContain('color: #000000;');
    expect(triggerRule).toContain('background: transparent;');
    expect(triggerRule).not.toMatch(/border:\s*1px/);
    expect(inputRule).toContain('border-bottom: 2px solid #306df8;');
    expect(inputRule).toContain('color: #000000;');
    expect(inputRule).toContain('background: transparent;');
    expect(inputRule).toContain('caret-color: #306df8;');
    expect(styles).toContain('font-size: 22px;');
    expect(iconRule).toContain('width: 18px;');
    expect(iconRule).toContain('color: #000000;');
    expect(templateButtonVarsRule).toContain('--designer-button-background: transparent;');
    expect(templateTextScopedRule).toContain('color: #000000;');
    expect(templateTextScopedRule).toContain('font-size: inherit;');
  });

  it('模板配置 Labeler 预览在画布内直接展示真实标注内容', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const canvasPreviewRule =
      styles.match(/\.designer-canvas\.is-previewing-labeler,\s*\.designer-canvas\.is-previewing-ai-prompt\s*\{[^}]+\}/)?.[0] ??
      '';
    const previewButtonRule = styles.match(/\.designer-canvas__labeler-preview\.is-active\s*\{[^}]+\}/)?.[0] ?? '';
    const previewButtonHoverRule = styles.match(
      /\.designer-canvas__labeler-preview\.is-active:hover,\n\.designer-canvas__labeler-preview\.is-active:focus-visible\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const previewIconRule = styles.match(/\.designer-canvas__labeler-preview-icon\s*\{[^}]+\}/)?.[0] ?? '';
    const previewSurfaceRule =
      styles.match(/\.designer-canvas \.designer-canvas__labeler-preview-surface\s*\{[^}]+\}/)?.[0] ?? '';
    const previewRendererRule =
      styles.match(/\.designer-canvas \.designer-canvas__labeler-preview-surface \.schema-renderer\s*\{[^}]+\}/)?.[0] ?? '';
    const previewFieldNodeRule =
      styles.match(/\.designer-canvas \.designer-canvas__labeler-preview-surface \.schema-renderer__field-node\s*\{[^}]+\}/)?.[0] ??
      '';

    expect(canvasPreviewRule).toContain('align-content: stretch;');
    expect(canvasPreviewRule).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(canvasPreviewRule).not.toContain('padding: 0;');
    expect(canvasPreviewRule).not.toContain('background:');
    expect(canvasPreviewRule).not.toContain('border-style: solid;');
    expect(previewButtonRule).toContain('background: transparent;');
    expect(previewButtonHoverRule).toContain('background: #eff6ff;');
    expect(previewIconRule).toContain('animation: designer-preview-icon-swap');
    expect(previewSurfaceRule).toContain('min-height: 0;');
    expect(previewSurfaceRule).toContain('height: 100%;');
    expect(previewSurfaceRule).toContain('padding: 0;');
    expect(previewSurfaceRule).toContain('background: transparent;');
    expect(previewSurfaceRule).toContain('animation: designer-labeler-preview-in');
    expect(previewRendererRule).toContain('width: 100%;');
    expect(previewFieldNodeRule).toContain('border-style: solid;');
    expect(previewFieldNodeRule).toContain('border-color: #d8e2f3;');
    expect(styles).toContain('@keyframes designer-labeler-preview-in');
    expect(styles).toContain('@keyframes designer-preview-icon-swap');
  });

  it('模板配置 AI Prompt 预览使用画布等宽卡片和实线分段', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const aiPromptButtonRule = styles.match(/\.designer-canvas__ai-prompt-preview\.is-active\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptSurfaceRule = styles.match(/\.designer-ai-prompt-preview\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptActionsRule = styles.match(/\.designer-ai-prompt-preview__header-actions\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptToggleRule =
      styles.match(/\.designer-ai-prompt-preview__header-actions\s*>\s*button\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptCardRule =
      styles.match(/\.designer-ai-prompt-preview__header,\s*\.designer-ai-prompt-preview__full,\s*\.designer-ai-prompt-preview__sections article\s*\{[^}]+\}/)?.[0] ??
      '';
    const aiPromptSectionToggleRule =
      styles.match(/\.designer-ai-prompt-preview__section-heading\s*>\s*button\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptSectionBodyRule =
      styles.match(/\.designer-ai-prompt-preview__section-body\s*\{[^}]+\}/)?.[0] ?? '';
    const aiPromptCollapsedRule =
      styles.match(/\.designer-ai-prompt-preview__sections article\.is-collapsed \.designer-ai-prompt-preview__section-body\s*\{[^}]+\}/)?.[0] ??
      '';
    const aiPromptTextareaRule = styles.match(/\.designer-ai-prompt-preview textarea\s*\{[^}]+\}/)?.[0] ?? '';

    expect(aiPromptButtonRule).toContain('background: transparent;');
    expect(aiPromptSurfaceRule).toContain('width: 100%;');
    expect(aiPromptSurfaceRule).toContain('padding: 0;');
    expect(aiPromptSurfaceRule).toContain('animation: designer-labeler-preview-in');
    expect(aiPromptActionsRule).toContain('display: inline-flex;');
    expect(aiPromptToggleRule).toContain('border-radius: 999px;');
    expect(aiPromptToggleRule).toContain('color: #306df8;');
    expect(aiPromptToggleRule).toContain('background: #eff6ff;');
    expect(aiPromptCardRule).toContain('border: 1px solid #d8e2f3;');
    expect(aiPromptCardRule).toContain('border-radius: 8px;');
    expect(aiPromptSectionToggleRule).toContain('border-radius: 999px;');
    expect(aiPromptSectionBodyRule).toContain('grid-template-rows: 1fr;');
    expect(aiPromptSectionBodyRule).toContain('transition:');
    expect(aiPromptCollapsedRule).toContain('grid-template-rows: 0fr;');
    expect(aiPromptTextareaRule).toContain('white-space: pre-wrap;');
    expect(aiPromptTextareaRule).toContain('min-height: 0;');
    expect(aiPromptTextareaRule).toContain('overflow: hidden;');
    expect(aiPromptTextareaRule).toContain('resize: none;');
    expect(aiPromptTextareaRule).toContain('height 180ms cubic-bezier');
  });

  it('模板配置抽屉放大后布局容器允许上下左右滚动', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const drawerRule = styles.match(/\.template-designer-page--drawer\s*\{[^}]+\}/)?.[0] ?? '';
    const drawerLayoutRule = styles.match(
      /\.template-designer-page--drawer\s+\.template-designer-layout\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(drawerRule).toContain('overflow: auto;');
    expect(drawerLayoutRule).toContain('overflow: auto;');
    expect(drawerLayoutRule).toContain('grid-auto-rows: minmax(640px, 1fr);');
  });

  it('抽屉遮罩和阴影跟随页面级放大平移而不是固定在视口', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const taskShellRule = styles.match(/(?:^|\n)\.task-publish-drawer-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const taskDrawerRule = styles.match(/(?:^|\n)\.task-publish-drawer\s*\{[^}]+\}/)?.[0] ?? '';
    const templateShellRule = styles.match(/(?:^|\n)\.template-designer-drawer-shell\s*\{[^}]+\}/)?.[0] ?? '';

    expect(taskShellRule).toContain('position: absolute;');
    expect(taskShellRule).not.toContain('position: fixed;');
    expect(taskShellRule).toContain('background: rgba(18, 26, 23, 0.16);');
    expect(taskDrawerRule).toContain('position: absolute;');
    expect(taskDrawerRule).toContain('top: 0;');
    expect(taskDrawerRule).toContain('height: 100%;');
    expect(templateShellRule).toContain('position: absolute;');
    expect(templateShellRule).not.toContain('position: fixed;');
    expect(templateShellRule).toContain('background: rgba(18, 26, 23, 0.16);');
  });

  it('AI 预审控件使用标准方形 checkbox 并将文字放在 checkbox 后方', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const toggleRule = styles.match(/\.task-ai-toggle\s*\{[^}]+\}/)?.[0] ?? '';
    const inputRule = styles.match(/\.task-ai-toggle input\s*\{[^}]+\}/)?.[0] ?? '';
    const labelRule = styles.match(/\.task-ai-toggle__label\s*\{[^}]+\}/)?.[0] ?? '';
    const checkRule = styles.match(/\.task-ai-toggle input::after\s*\{[^}]+\}/)?.[0] ?? '';
    const checkedRule = styles.match(/\.task-ai-toggle input:checked\s*\{[^}]+\}/)?.[0] ?? '';
    const checkedCheckRule = styles.match(/\.task-ai-toggle input:checked::after\s*\{[^}]+\}/)?.[0] ?? '';

    expect(styles).toContain('.task-publish-form .task-ai-toggle');
    expect(toggleRule).toContain('display: inline-flex;');
    expect(toggleRule).toContain('flex-direction: row;');
    expect(toggleRule).toContain('align-items: center;');
    expect(inputRule).toContain('appearance: none;');
    expect(inputRule).toContain('order: 0;');
    expect(inputRule).toContain('flex: 0 0 18px;');
    expect(inputRule).toContain('width: 18px;');
    expect(inputRule).toContain('height: 18px;');
    expect(inputRule).toContain('border-radius: 5px;');
    expect(inputRule).toContain('transition:');
    expect(labelRule).toContain('order: 1;');
    expect(labelRule).toContain('white-space: nowrap;');
    expect(checkRule).toContain('opacity: 0;');
    expect(checkRule).toContain('transform: rotate(45deg) scale(0.78);');
    expect(checkedRule).toContain('background: #306df8;');
    expect(checkedRule).toContain('border-color: #306df8;');
    expect(checkedCheckRule).toContain('opacity: 1;');
    expect(checkedCheckRule).toContain('transform: rotate(45deg) scale(1);');
  });

  it('模板属性折叠区使用胶囊按钮和折叠过渡动画', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const headerRule = styles.match(/\.designer-property-section__header\s*\{[^}]+\}/)?.[0] ?? '';
    const switchRule = styles.match(/\.designer-section-switch\s*\{[^}]+\}/)?.[0] ?? '';
    const switchInputRule = styles.match(/\.designer-section-switch input\s*\{[^}]+\}/)?.[0] ?? '';
    const switchHoverRule =
      styles.match(/\.designer-section-switch:hover span,\s*\.designer-section-switch:focus-within span\s*\{[^}]+\}/)
        ?.[0] ?? '';
    const checkedHoverRule =
      styles.match(
        /\.designer-section-switch:hover input:checked \+ span,\s*\.designer-section-switch:focus-within input:checked \+ span\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const collapseRule = styles.match(/\.designer-property-collapse\s*\{[^}]+\}/)?.[0] ?? '';
    const expandedRule = styles.match(/\.designer-property-collapse\.is-expanded\s*\{[^}]+\}/)?.[0] ?? '';

    expect(headerRule).toContain('display: flex;');
    expect(headerRule).toContain('justify-content: space-between;');
    expect(switchRule).toContain('flex: 0 0 auto;');
    expect(switchInputRule).toContain('cursor: pointer;');
    expect(switchHoverRule).toContain('box-shadow: 0 0 0 3px rgba(48, 109, 248, 0.10);');
    expect(checkedHoverRule).toContain('background: #255fe8;');
    expect(collapseRule).toContain('grid-template-rows: 0fr;');
    expect(collapseRule).toContain('opacity: 0;');
    expect(collapseRule).toContain('transition:');
    expect(expandedRule).toContain('grid-template-rows: 1fr;');
    expect(expandedRule).toContain('opacity: 1;');
  });

  it('模板配置选项编辑器把新增按钮放在选项下方并沿用任务标签胶囊规格', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const editorRule = styles.match(/\.designer-option-editor\s*\{[^}]+\}/)?.[0] ?? '';
    const compactEditorRule =
      styles.match(/\.designer-property-row\.designer-option-editor\s*\{[^}]+\}/)?.[0] ?? '';
    const bubblesRule = styles.match(/\.designer-option-editor__bubbles\s*\{[^}]+\}/)?.[0] ?? '';
    const optionListRule = styles.match(/\.designer-option-editor__option-list\s*\{[^}]+\}/)?.[0] ?? '';
    const actionRule = styles.match(/\.designer-option-editor__action\s*\{[^}]+\}/)?.[0] ?? '';
    const baseBubbleRule = styles.match(/\.designer-option-bubble\s*\{[^}]+\}/)?.[0] ?? '';
    const bubbleRule = styles.match(/\.designer-option-editor \.designer-option-bubble\s*\{[^}]+\}/)?.[0] ?? '';
    const addRule = styles.match(/\.designer-option-editor \.designer-option-bubble--add\s*\{[^}]+\}/)?.[0] ?? '';
    const composerRule = styles.match(/\.designer-option-composer\s*\{[^}]+\}/)?.[0] ?? '';
    const composerInputRule = styles.match(/\.designer-option-composer__input\s*\{[^}]+\}/)?.[0] ?? '';
    const optionLabelRule =
      styles.match(/\.designer-property-row\.designer-option-editor > \.designer-property-row__label\s*\{[^}]+\}/)
        ?.[0] ?? '';
    const enteringRule = styles.match(/\.designer-option-bubble--entering\s*\{[^}]+\}/)?.[0] ?? '';
    const dragSurfaceRule =
      styles.match(/\.designer-option-editor \.designer-option-bubble--dragging \.designer-option-bubble__surface\s*\{[^}]+\}/)?.[0] ?? '';
    const dragShiftedRule =
      styles.match(/\.designer-option-editor \.designer-option-bubble--drag-shifted\s*\{[^}]+\}/)?.[0] ?? '';

    expect(editorRule).toContain('display: grid !important;');
    expect(editorRule).toContain('--designer-option-tag-height: 28px;');
    expect(editorRule).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(compactEditorRule).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(compactEditorRule).toContain('gap: 8px;');
    expect(bubblesRule).toContain('display: flex;');
    expect(bubblesRule).toContain('flex-wrap: wrap;');
    expect(bubblesRule).toContain('justify-content: flex-start;');
    expect(bubblesRule).toContain('margin: -4px;');
    expect(optionListRule).toContain('display: contents;');
    expect(actionRule).toContain('align-items: center;');
    expect(actionRule).toContain('justify-content: flex-start;');
    expect(actionRule).toContain('min-height: 0;');
    expect(bubbleRule).toContain('min-height: var(--designer-option-tag-height);');
    expect(baseBubbleRule).toContain('font-size: 12px;');
    expect(addRule).toContain('width: var(--designer-option-tag-height);');
    expect(addRule).toContain('height: var(--designer-option-tag-height);');
    expect(addRule).toContain('min-height: var(--designer-option-tag-height);');
    expect(addRule).toContain('font-size: 12px;');
    expect(addRule).toContain('animation: task-tag-add-enter 150ms cubic-bezier(0.2, 0.8, 0.2, 1) both;');
    expect(composerRule).toContain('width: 136px;');
    expect(composerRule).toContain('height: 28px;');
    expect(composerRule).toContain('transform-origin: left center;');
    expect(composerRule).toContain('animation: designer-option-composer-expand 190ms cubic-bezier(0.16, 1, 0.3, 1) both;');
    expect(composerInputRule).toContain('height: 100%;');
    expect(composerInputRule).toContain('min-height: 0 !important;');
    expect(composerInputRule).toContain('font-size: 12px;');
    expect(optionLabelRule).toContain('font-size: 12px;');
    expect(enteringRule).toContain('animation: task-tag-bubble-materialize 210ms cubic-bezier(0.2, 0.8, 0.2, 1) both;');
    expect(dragSurfaceRule).toContain('cursor: grabbing;');
    expect(dragSurfaceRule).toContain('box-shadow: 0 10px 22px rgba(48, 109, 247, 0.18);');
    expect(dragShiftedRule).toContain('transition: transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);');
  });

  it('模板配置选项编辑器的气泡容器不被通用属性行控制样式覆盖', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    document.head.innerHTML = `<style>${styles}</style>`;
    document.body.innerHTML =
      '<div class="designer-property-row__control designer-option-editor__bubbles"></div>';

    const bubbles = document.querySelector('.designer-option-editor__bubbles');

    expect(bubbles).not.toBeNull();
    expect(getComputedStyle(bubbles as Element).display).toBe('flex');
  });

  it('任务抽屉关键输入控件聚焦时使用统一高亮过渡', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const controlRule = styles.match(/\.task-publish-form__control\s*\{[^}]+\}/)?.[0] ?? '';
    const focusRule = styles.match(
      /\.task-publish-form__control:focus,\s*\.task-publish-form__control:focus-visible,\s*\.task-reward-input:focus-within,\s*\.task-deadline-picker__trigger:focus-visible\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(controlRule).toContain('transition:');
    expect(controlRule).toContain('border-color 180ms ease');
    expect(controlRule).toContain('box-shadow 180ms ease');
    expect(focusRule).toContain('border-color: #306df8;');
    expect(focusRule).toContain('box-shadow: 0 0 0 3px rgba(48, 109, 248, 0.14);');
    expect(focusRule).toContain('outline: none;');
  });

  it('关联模板菜单的查看模板眼睛按钮不显示边框和独立背景', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const viewButtonRule = styles.match(/\.task-template-picker__view-button\s*\{[^}]+\}/)?.[0] ?? '';
    const viewButtonHoverRule = styles.match(
      /\.task-template-picker__view-button:hover:not\(:disabled\),\s*\.task-template-picker__view-button:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(viewButtonRule).toContain('border: 0;');
    expect(viewButtonRule).toContain('background: transparent;');
    expect(viewButtonHoverRule).toContain('background: transparent;');
  });

  it('任务截止时间日历浮层使用圆角和柔和弹出动效', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const popoverRule = styles.match(/\.task-deadline-picker__popover\s*\{[^}]+\}/)?.[0] ?? '';
    const dayRule = styles.match(/\.task-deadline-picker__day\s*\{[^}]+\}/)?.[0] ?? '';
    const navRule = styles.match(/\.task-deadline-picker__nav\s*\{[^}]+\}/)?.[0] ?? '';
    const weekdayRule = styles.match(/\.task-deadline-picker__weekdays\s*\{[^}]+\}/)?.[0] ?? '';
    const weekdaySpanRule = styles.match(/\.task-deadline-picker__weekdays span\s*\{[^}]+\}/)?.[0] ?? '';
    const daysRule = styles.match(/\.task-deadline-picker__weekdays,\s*\.task-deadline-picker__days\s*\{[^}]+\}/)?.[0] ?? '';
    const calendarRule = styles.match(/\.task-deadline-picker__calendar\s*\{[^}]+\}/)?.[0] ?? '';
    const timeRule = styles.match(/\.task-deadline-picker__time\s*\{[^}]+\}/)?.[0] ?? '';
    const footerRule = styles.match(/\.task-deadline-picker__footer\s*\{[^}]+\}/)?.[0] ?? '';
    const hourWheelShellRule = styles.match(/\.task-deadline-picker__hour-wheel-shell\s*\{[^}]+\}/)?.[0] ?? '';
    const hourWheelRule = styles.match(/\.task-deadline-picker__hour-wheel\s*\{[^}]+\}/)?.[0] ?? '';
    const navHoverRule =
      styles.match(/\.task-publish-drawer \.task-deadline-picker__nav:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ??
      '';
    const selectedHourRule =
      styles.match(/\.task-deadline-picker__hour-option--selected\s*\{[^}]+\}/)?.[0] ?? '';
    const selectedDayRule =
      styles.match(/\.task-deadline-picker__day--selected,\s*\.task-deadline-picker__day--selected:hover:not\(:disabled\)\s*\{[^}]+\}/)?.[0] ??
      '';

    expect(popoverRule).toContain('border-radius: 16px;');
    expect(popoverRule).toContain('width: min(364px, calc(100vw - 48px));');
    expect(popoverRule).toContain('max-height: min(360px, calc(100vh - var(--platform-topbar-height) - 72px));');
    expect(popoverRule).toContain('overflow: visible;');
    expect(popoverRule).toContain('padding: 8px;');
    expect(popoverRule).toContain('grid-template-columns: minmax(0, 1fr) 112px;');
    expect(popoverRule).toContain('row-gap: 6px;');
    expect(popoverRule).toContain('box-shadow: 0 22px 54px rgba(31, 44, 76, 0.18);');
    expect(popoverRule).toContain('animation: taskDeadlinePickerIn 180ms cubic-bezier(0.16, 1, 0.3, 1) both;');
    expect(styles).toContain('.task-publish-form:has(.task-deadline-picker__popover)');
    expect(styles).toContain('overflow-y: visible;');
    expect(navRule).toContain('display: grid;');
    expect(navRule).toContain('place-items: center;');
    expect(navRule).toContain('padding: 0;');
    expect(timeRule).toContain('grid-column: 2;');
    expect(timeRule).toContain('grid-row: 1;');
    expect(timeRule).toContain('grid-template-columns: 1fr;');
    expect(calendarRule).toContain('grid-column: 1;');
    expect(calendarRule).toContain('grid-row: 1 / span 2;');
    expect(daysRule).toContain('gap: 1px;');
    expect(weekdayRule).toContain('margin-bottom: 3px;');
    expect(weekdaySpanRule).toContain('height: 14px;');
    expect(hourWheelShellRule).toContain('width: 104px;');
    expect(hourWheelShellRule).toContain('height: 164px;');
    expect(hourWheelShellRule).toContain('perspective: 560px;');
    expect(hourWheelRule).toContain('height: 100%;');
    expect(hourWheelRule).toContain('cursor: ns-resize;');
    expect(hourWheelRule).toContain('mask-image: linear-gradient(');
    expect(hourWheelRule).toContain('scroll-snap-type: y mandatory;');
    expect(hourWheelRule).toContain('touch-action: none;');
    expect(hourWheelRule).toContain('user-select: none;');
    expect(styles).toContain('.task-deadline-picker__hour-wheel-shell::before');
    expect(styles).toContain('.task-deadline-picker__hour-wheel-shell::after');
    expect(styles).toContain('.task-deadline-picker__hour-wheel-shell.is-dragging');
    expect(selectedHourRule).toContain('color: #306df8;');
    expect(selectedHourRule).toContain('font-size: 22px;');
    expect(selectedHourRule).toContain('font-weight: 600;');
    expect(selectedHourRule).toContain('transform: translateZ(34px) scale(1.02);');
    expect(navHoverRule).toContain('border-color: #d7e1f1;');
    expect(navHoverRule).toContain('background: #f8fbff;');
    expect(footerRule).toContain('grid-column: 2;');
    expect(footerRule).toContain('grid-row: 2;');
    expect(footerRule).toContain('align-self: start;');
    expect(footerRule).toContain('justify-content: center;');
    expect(footerRule).toContain('margin-top: 0;');
    expect(dayRule).toContain('width: 28px;');
    expect(dayRule).toContain('height: 28px;');
    expect(dayRule).toContain('display: grid;');
    expect(dayRule).toContain('place-items: center;');
    expect(dayRule).toContain('border-radius: 999px;');
    expect(dayRule).toContain('padding: 0;');
    expect(dayRule).toContain('line-height: 1;');
    expect(selectedDayRule).toContain('background: #306df8;');
    expect(styles).not.toContain('task-deadline-picker__cancel');
    expect(styles).toContain('@keyframes taskDeadlinePickerIn');
    expect(styles).toContain('@keyframes taskDeadlineTitleIn');
    expect(styles).toContain('.task-deadline-picker__title-text');
  });

  it('字段联动规则在属性面板内拆成条件动作色块并自然换行', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const blocksRule = styles.match(/\.designer-linkage-rule-editor__blocks\s*\{[^}]+\}/)?.[0] ?? '';
    const blockRule = styles.match(/\.designer-linkage-rule-editor__block\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionBlockRule =
      styles.match(/\.designer-linkage-rule-editor__block--conditions\s*\{[^}]+\}/)?.[0] ?? '';
    const actionBlockRule =
      styles.match(/\.designer-linkage-rule-editor__block--actions\s*\{[^}]+\}/)?.[0] ?? '';
    const blockTitleRule = styles.match(/\.designer-linkage-rule-editor__block-title\s*\{[^}]+\}/)?.[0] ?? '';
    const blockTitleIconRule =
      styles.match(/\.designer-linkage-rule-editor__block-title-icon\s*\{[^}]+\}/)?.[0] ?? '';
    const rowRule = styles.match(/\.designer-linkage-rule-editor__row\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionStackRule =
      styles.match(/\.designer-linkage-rule-editor__condition-stack\s*\{[^}]+\}/)?.[0] ?? '';
    const joinedConditionStackRule =
      styles.match(/\.designer-linkage-rule-editor__condition-stack--joined\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionCombinatorRule =
      styles.match(/\.designer-linkage-rule-editor__condition-combinator\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionCurveRule =
      styles.match(/\.designer-linkage-rule-editor__condition-curve\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionCurveTopRule =
      styles.match(/\.designer-linkage-rule-editor__condition-curve--top\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionCurveBottomRule =
      styles.match(/\.designer-linkage-rule-editor__condition-curve--bottom\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionRowsRule =
      styles.match(
        /\.designer-linkage-rule-editor__rows--conditions \.designer-linkage-rule-editor__row--condition\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const primaryConditionRowRule =
      styles.match(/\.designer-linkage-rule-editor__row--condition-primary\s*\{[^}]+\}/)?.[0] ?? '';
    const primaryConditionBodyRule =
      styles.match(
        /\.designer-linkage-rule-editor__row--condition-primary \.designer-linkage-rule-editor__row-body\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const combinatorToggleRule =
      styles.match(/\.designer-linkage-rule-editor__combinator-toggle\s*\{[^}]+\}/)?.[0] ?? '';
    const combinatorToggleIconRule =
      styles.match(/\.designer-linkage-rule-editor__combinator-toggle-icon\s*\{[^}]+\}/)?.[0] ?? '';
    const combinatorToggleHoverRule =
      styles.match(
        /\.designer-linkage-rule-editor__combinator-toggle:hover,\s*\.designer-linkage-rule-editor__combinator-toggle:focus-visible\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const removeRowRule = styles.match(/\.designer-linkage-rule-editor__remove-row\s*\{[^}]+\}/)?.[0] ?? '';
    const addRowRule = styles.match(/\.designer-linkage-rule-editor__add-row\s*\{[^}]+\}/)?.[0] ?? '';
    const surfaceRule = styles.match(/\.designer-linkage-rule-editor__surface--sentence\s*\{[^}]+\}/)?.[0] ?? '';
    const sentenceRule = styles.match(/\.designer-linkage-rule-editor__sentence\s*\{[^}]+\}/)?.[0] ?? '';
    const valueTriggerRule =
      styles.match(
        /\.designer-linkage-rule-editor__inline-choice--value \.designer-linkage-rule-editor__inline-choice-trigger\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const inlineChoiceTriggerRule =
      styles.match(/\.designer-linkage-rule-editor__inline-choice-trigger\s*\{[^}]+\}/)?.[0] ?? '';
    const fieldChoiceRule =
      styles.match(
        /\.designer-linkage-rule-editor__inline-choice--field \.designer-linkage-rule-editor__inline-choice-trigger\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const actionKeywordRule =
      styles.match(/\.designer-linkage-rule-editor__keyword--action\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionRule = styles.match(/\.designer-linkage-rule-editor__condition\s*\{[^}]+\}/)?.[0] ?? '';
    const conditionFragmentRule =
      styles.match(
        /\.designer-linkage-rule-editor__condition \.designer-linkage-rule-editor__fragment\s*\{[^}]+\}/,
      )?.[0] ?? '';
    const inlineChoiceMenuRule =
      styles.match(/\.designer-linkage-rule-editor__inline-choice-menu\s*\{[^}]+\}/)?.[0] ?? '';
    const inlineChoiceMenuButtonRule =
      styles.match(
        /\.designer-linkage-rule-editor__inline-choice-menu button,\s*\.designer-linkage-rule-editor__inline-choice-empty\s*\{[^}]+\}/,
      )?.[0] ?? '';

    expect(blocksRule).toContain('min-width: 0;');
    expect(blockRule).toContain('border-radius: 10px;');
    expect(conditionBlockRule).toContain('background: #f4f8ff;');
    expect(actionBlockRule).toContain('background: #effcff;');
    expect(blockTitleRule).not.toContain('background:');
    expect(blockTitleRule).not.toContain('border-radius: 999px;');
    expect(blockTitleRule).toContain('gap: 4px;');
    expect(blockTitleIconRule).toContain('width: 13px;');
    expect(blockTitleIconRule).toContain('height: 13px;');
    expect(rowRule).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
    expect(rowRule).toContain('min-width: 0;');
    expect(conditionStackRule).toContain('display: grid;');
    expect(conditionStackRule).toContain('position: relative;');
    expect(joinedConditionStackRule).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(joinedConditionStackRule).toContain('column-gap: 0;');
    expect(conditionCombinatorRule).toContain('position: absolute;');
    expect(conditionCombinatorRule).toContain('left: 0;');
    expect(conditionCombinatorRule).toContain('width: 20px;');
    expect(conditionCombinatorRule).toContain('grid-template-rows: minmax(12px, 1fr) auto minmax(12px, 1fr);');
    expect(conditionCurveRule).toContain('border-color: rgba(48, 109, 250, 0.42);');
    expect(conditionCurveTopRule).toContain('border-top-left-radius: 10px;');
    expect(conditionCurveBottomRule).toContain('border-bottom-left-radius: 10px;');
    expect(conditionRowsRule).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(primaryConditionRowRule).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(primaryConditionBodyRule).toContain('flex-wrap: nowrap;');
    expect(primaryConditionBodyRule).toContain('padding-left: 28px;');
    expect(combinatorToggleRule).toContain('background: transparent;');
    expect(combinatorToggleRule).toContain('border: 0;');
    expect(combinatorToggleRule).toContain('font-size: 11px;');
    expect(combinatorToggleRule).not.toContain('transform:');
    expect(combinatorToggleIconRule).toContain('font-size: 10px;');
    expect(combinatorToggleHoverRule).toContain('background: transparent !important;');
    expect(removeRowRule).toContain('border-radius: 999px;');
    expect(addRowRule).toContain('justify-self: end;');
    expect(addRowRule).toContain('min-height: 24px;');
    expect(addRowRule).toContain('font-size: 11px;');
    expect(surfaceRule).toContain('overflow: visible;');
    expect(surfaceRule).not.toContain('overflow-x: auto;');
    expect(sentenceRule).toContain('width: 100%;');
    expect(sentenceRule).toContain('min-width: 0;');
    expect(sentenceRule).toContain('align-items: center;');
    expect(sentenceRule).toContain('font-size: 13px;');
    expect(inlineChoiceTriggerRule).toContain('min-height: 28px;');
    expect(inlineChoiceTriggerRule).toContain('border-radius: 8px;');
    expect(inlineChoiceTriggerRule).toContain('font-size: 10px;');
    expect(fieldChoiceRule).toContain('border-color: #bfd2ff;');
    expect(fieldChoiceRule).toContain('background: #eef4ff;');
    expect(fieldChoiceRule).toContain('color: #2456c7;');
    expect(actionKeywordRule).toContain('border-color: #9deaf5;');
    expect(actionKeywordRule).toContain('background: #e9fbff;');
    expect(actionKeywordRule).toContain('color: #0891b2;');
    expect(actionKeywordRule).toContain('font-size: 10px;');
    expect(conditionRule).toContain('flex-wrap: nowrap;');
    expect(conditionFragmentRule).toContain('flex-wrap: nowrap;');
    expect(inlineChoiceMenuRule).toContain('width: max-content;');
    expect(inlineChoiceMenuRule).toContain('min-width: 100%;');
    expect(inlineChoiceMenuRule).toContain('max-width: min(260px, calc(100vw - 48px));');
    expect(inlineChoiceMenuRule).toContain('max-height: 108px;');
    expect(inlineChoiceMenuRule).toContain('overflow-y: auto;');
    expect(inlineChoiceMenuRule).not.toContain('min-width: 168px;');
    expect(inlineChoiceMenuButtonRule).toContain('width: 100%;');
    expect(inlineChoiceMenuButtonRule).toContain('max-width: 100%;');
    expect(inlineChoiceMenuButtonRule).toContain('min-height: 30px;');
    expect(inlineChoiceMenuButtonRule).toContain('font-size: 12px;');
    expect(valueTriggerRule).toContain('max-width: 100%;');
    expect(valueTriggerRule).toContain('font-size: 10px;');
  });
});
