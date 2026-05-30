import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('global styles', () => {
  it('保留所有文本输入控件的原生输入光标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

    expect(styles).not.toContain('caret-color: transparent;');
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
    const toastExitRule = styles.match(/\.toast\.is-exiting\s*\{[^}]+\}/)?.[0] ?? '';

    expect(toastStackRule).toContain('top: calc(var(--platform-topbar-height) + 24px);');
    expect(toastStackRule).toContain('left: 50%;');
    expect(toastStackRule).toContain('transform: translateX(-50%);');
    expect(toastExitRule).toContain('animation: toastOut 220ms ease-in both;');
    expect(styles).toContain('@keyframes toastOut');
    expect(styles).toContain('transform: translateY(-14px) scale(0.98);');
  });

  it('平台顶栏尺寸随屏幕断点自适应', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rootRule = styles.match(/:root\s*\{[^}]+\}/)?.[0] ?? '';
    const topbarRule = styles.match(/\.platform-topbar\s*\{[^}]+\}/)?.[0] ?? '';
    const brandRule = styles.match(/\.platform-brand\s*\{[^}]+\}/)?.[0] ?? '';
    const navLinkRule = styles.match(/\.platform-topbar__nav a\s*\{[^}]+\}/)?.[0] ?? '';
    const userRule = [...styles.matchAll(/\.platform-user\s*\{[^}]+\}/g)].map((match) => match[0]).join('\n');
    const avatarRule = styles.match(/\.platform-user__avatar\s*\{[^}]+\}/)?.[0] ?? '';
    const mobileTopbarRule =
      styles.match(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.platform-topbar\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rootRule).toContain('--platform-topbar-height: 48px;');
    expect(rootRule).toContain('--platform-topbar-inline-padding: 18px;');
    expect(rootRule).toContain('--platform-topbar-font-size: 14px;');
    expect(topbarRule).toContain('min-height: var(--platform-topbar-height);');
    expect(topbarRule).toContain('gap: var(--platform-topbar-gap);');
    expect(topbarRule).toContain('padding: 0 var(--platform-topbar-inline-padding);');
    expect(brandRule).toContain('font-size: var(--platform-topbar-brand-font-size);');
    expect(navLinkRule).toContain('min-height: var(--platform-topbar-nav-height);');
    expect(navLinkRule).toContain('font-size: var(--platform-topbar-font-size);');
    expect(userRule).toContain('font-size: var(--platform-topbar-font-size);');
    expect(avatarRule).toContain('width: var(--platform-topbar-avatar-size);');
    expect(styles).toContain('--platform-topbar-height: 56px;');
    expect(styles).toContain('--platform-topbar-height: 64px;');
    expect(styles).toContain('--platform-topbar-height: 44px;');
    expect(mobileTopbarRule).toContain('padding: 8px var(--platform-topbar-inline-padding);');
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
    expect(emptyIllustrationRule).toContain('width: clamp(104px, min(8vw, 14vh), 220px);');
    expect(emptyTitleRule).toContain('font-size: clamp(13px, min(0.78vw, 1.5vh), 18px);');
    expect(emptyDescriptionRule).toContain('font-size: clamp(12px, min(0.62vw, 1.25vh), 15px);');
    expect(emptyFillerRule).toContain('display: none;');
    expect(emptyTableRule).toContain('height: 100%;');
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

  it('桌面大屏断点限制后台列表阅读宽度并放大登录面板', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

    expect(styles).toContain('@media (min-width: 2200px)');
    expect(styles).toContain('width: min(1840px, calc(100vw - 192px));');
    expect(styles).toContain('min-height: min(960px, calc(100vh - 144px));');
    expect(styles).toContain('width: min(2560px, calc(100% - 64px));');
    expect(styles).toContain('width: min(2720px, calc(100% - 64px));');
    expect(styles).toContain('margin-left: 32px;');
    expect(styles).toContain('@media (min-width: 3200px)');
    expect(styles).toContain('width: min(2800px, calc(100% - 160px));');
    expect(styles).toContain('width: min(2960px, calc(100% - 160px));');
    expect(styles).toContain('margin-left: 80px;');
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

  it('标注台报告题目按钮固定在操作栏最右侧', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const reportButtonRule = styles.match(
      /\.annotation-canvas-toolbar\s+\.annotation-canvas-toolbar__report\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(reportButtonRule).toContain('margin-left: auto;');
  });

  it('侧边栏收起按钮上边线与任务表格底部分页分隔线对齐', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const sidebarRule = styles.match(/\.portal-sidebar\s*\{[^}]+\}/)?.[0] ?? '';

    expect(sidebarRule).toContain('padding: 18px 10px 24px;');
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
    expect(iconRule).toContain('background: transparent;');
    expect(iconRule).toContain('box-shadow: none;');
    expect(activeIconRule).toContain('background: transparent;');
    expect(activeIconRule).toContain('box-shadow: none;');
    expect(hoverIconRule).toContain('background: transparent;');
    expect(hoverIconRule).toContain('box-shadow: none;');
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

  it('评测模板筛选栏只保留搜索和筛选控件，避免控件掉到第二行', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templateFilterRule = styles.match(/\.task-filter-bar\.template-manager-filter-bar\s*\{[^}]+\}/)?.[0] ?? '';
    const templateSearchRule = styles.match(/\.template-manager-filter-bar\s*>\s*input\s*\{[^}]+\}/)?.[0] ?? '';

    expect(templateFilterRule).toContain(
      'grid-template-columns: minmax(160px, 1fr) minmax(92px, 148px) minmax(92px, 148px);',
    );
    expect(templateFilterRule).toContain('width: 100%;');
    expect(templateSearchRule).toContain('min-width: 0;');
  });

  it('评测模板表格顶部使用和导出中心一致的面板外框', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const templatePanelRule = styles.match(/\.template-manager-table-panel\s*\{[^}]+\}/)?.[0] ?? '';
    const templateScrollRule =
      styles.match(/\.template-manager-table-panel\s+\.template-manager-table-scroll\s*\{[^}]+\}/)?.[0] ?? '';
    const headingActionRule = styles.match(
      /\.export-batch-action,\s*\.template-manager-list-heading__create\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(templatePanelRule).toContain('margin-top: 0;');
    expect(templateScrollRule).toContain('border: 0;');
    expect(templateScrollRule).toContain('border-radius: 0;');
    expect(headingActionRule).toContain('min-height: 36px;');
  });

  it('模板配置物料 SVG 图标替换旧的富文本和 JSON 伪元素图标', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const fileUploadSvgRule = styles.match(
      /\.designer-material__icon--file_upload\s+\.designer-material__icon-svg\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(styles).not.toContain(".designer-material__icon--rich_text::before {\n  content: 'B';");
    expect(styles).not.toContain(".designer-material__icon--json_editor::before {\n  content: '{}';");
    expect(fileUploadSvgRule).toContain('width: 16px;');
    expect(fileUploadSvgRule).toContain('height: 16px;');
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
    const saveRules = [...styles.matchAll(/\.task-close-confirm__save\s*\{[^}]+\}/g)].map((match) => match[0]);
    const saveRule = saveRules.join('\n');
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
    expect(closeHoverRule).toContain('background: #f3f7ff;');
    expect(closeHoverRule).toContain('color: #306df7;');
    expect(actionsRule).toContain('justify-content: flex-end;');
    expect(actionsRule).toContain('gap: 12px;');
    expect(cancelRule).toContain('border: 1px solid #c9d8f6;');
    expect(cancelRule).toContain('color: #306df7;');
    expect(cancelRule).toContain('background: transparent;');
    expect(saveRule).toContain('min-height: 40px;');
    expect(saveRule).toContain('border-radius: 10px;');
    expect(saveRule).toContain('padding: 0 20px;');
    expect(saveRule).toContain('background: #306df7;');
    expect(largeDesktopRule).toContain('width: min(520px, 30vw);');
    expect(tabletRule).toContain('width: 80vw;');
    expect(mobileRule).toContain('width: calc(100vw - 32px);');
  });

  it('ShowItem 字段配置卡片使用只读 chip 和轻量表单控件', () => {
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const cardRule = styles.match(/\.designer-show-item-field\s*\{[^}]+\}/)?.[0] ?? '';
    const sourceRule = styles.match(/\.designer-show-item-field__source\s*\{[^}]+\}/)?.[0] ?? '';
    const controlRule = styles.match(
      /\.designer-show-item-control input,\s*\.designer-show-item-control select\s*\{[^}]+\}/,
    )?.[0] ?? '';
    const deleteHoverRule = styles.match(
      /\.template-designer-page \.designer-show-item-field__delete:hover:not\(:disabled\),\s*\.template-designer-page \.designer-show-item-field__delete:focus-visible:not\(:disabled\)\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(cardRule).toContain('border-radius: 8px;');
    expect(cardRule).toContain('padding: 12px;');
    expect(cardRule).toContain('backwards;');
    expect(cardRule).toContain('transform 180ms ease;');
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
    const triggerRule = styles.match(/\.designer-canvas__template-name-trigger\s*\{[^}]+\}/)?.[0] ?? '';
    const inputRule = Array.from(styles.matchAll(/\.designer-canvas__template-name-input\s*\{[^}]+\}/g))
      .map((match) => match[0])
      .find((rule) => rule.includes('border-bottom')) ?? '';
    const iconRule = styles.match(/\.designer-canvas__template-name-icon\s*\{[^}]+\}/)?.[0] ?? '';
    const templateButtonVarsRule = styles.match(
      /\.template-designer-page \.designer-canvas__template-name-trigger\s*\{[^}]+\}/,
    )?.[0] ?? '';

    expect(triggerRule).toContain('width: fit-content;');
    expect(triggerRule).toContain('color: #000000;');
    expect(triggerRule).toContain('background: transparent;');
    expect(triggerRule).not.toMatch(/border:\s*1px/);
    expect(inputRule).toContain('border-bottom: 2px solid #306df8;');
    expect(inputRule).toContain('color: #000000;');
    expect(inputRule).toContain('background: transparent;');
    expect(inputRule).toContain('caret-color: #306df8;');
    expect(styles).toContain('font-size: 22px;');
    expect(iconRule).toContain('width: 16px;');
    expect(iconRule).toContain('color: #8a9ab0;');
    expect(templateButtonVarsRule).toContain('--designer-button-background: transparent;');
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
    expect(taskDrawerRule).toContain('position: absolute;');
    expect(taskDrawerRule).toContain('top: 0;');
    expect(taskDrawerRule).toContain('height: 100%;');
    expect(templateShellRule).toContain('position: absolute;');
    expect(templateShellRule).not.toContain('position: fixed;');
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
});
