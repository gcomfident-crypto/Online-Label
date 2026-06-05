export const resolvePagePathTitle = (pathname: string): string => {
  if (pathname === '/login') {
    return '登录';
  }

  if (pathname === '/forbidden') {
    return '无权限访问';
  }

  if (pathname === '/dev/renderer') {
    return '开发调试 / Renderer 调试台';
  }

  if (/^\/owner\/tasks\/[^/]+\/dataset$/.test(pathname)) {
    return '任务负责人后台 / 题目数据';
  }

  if (/^\/owner\/tasks\/[^/]+$/.test(pathname)) {
    return '任务负责人后台 / 任务详情';
  }

  if (pathname === '/owner' || pathname === '/owner/tasks') {
    return '任务负责人后台 / 任务管理';
  }

  if (pathname === '/owner/templates') {
    return '任务负责人后台 / 评测模板';
  }

  if (pathname === '/owner/ai-rules') {
    return '任务负责人后台 / AI 规则';
  }

  if (pathname === '/owner/exports') {
    return '任务负责人后台 / 导出中心';
  }

  if (/^\/labeler\/tasks\/[^/]+\/items\/[^/]+$/.test(pathname)) {
    return '标注员工作台 / 标注台';
  }

  if (pathname === '/labeler' || pathname === '/labeler/market') {
    return '标注员工作台 / 任务广场';
  }

  if (pathname === '/labeler/my-data') {
    return '标注员工作台 / 工作台';
  }

  if (pathname === '/agent' || pathname === '/agent/dashboard') {
    return 'AI 预审后台 / 数据看板';
  }

  if (pathname === '/agent/ai-review') {
    return 'AI 预审后台 / 机审队列';
  }

  if (/^\/reviewer\/reviews\/[^/]+$/.test(pathname)) {
    return '审核与质检 / 人工审核 / 审核详情';
  }

  if (pathname === '/reviewer' || pathname === '/reviewer/reviews') {
    return '审核与质检 / 人工审核 / 审核任务列表';
  }

  return 'LabelHub';
};
