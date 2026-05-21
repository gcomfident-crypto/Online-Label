import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { TemplateDesignerPage } from './TemplateDesignerPage';
import { useTemplateDesignerStore } from '../../features/template-designer/templateStore';

describe('TemplateDesignerPage', () => {
  beforeEach(() => {
    useTemplateDesignerStore.getState().resetDesigner();
  });

  it('从商品标题清洗 v3 蓝本进入三栏 Designer 并同步属性修改', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);

    expect(screen.getByRole('heading', { name: '模板搭建器（Designer）' })).toBeInTheDocument();
    expect(screen.getByText('物料')).toBeInTheDocument();
    expect(screen.getByText('画布')).toBeInTheDocument();
    expect(screen.getByText('属性配置')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '使用商品标题清洗 v3' }));

    expect(screen.getByText('原始商品标题')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '选择 清洗后标题' }));
    expect(screen.getByText('属性配置 · cleaned_title')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '校验' }));
    await user.clear(screen.getByLabelText('最大长度'));
    await user.type(screen.getByLabelText('最大长度'), '42');
    fireEvent.change(screen.getByLabelText('正则'), { target: { value: '^[^#]+$' } });
    await user.selectOptions(screen.getByLabelText('自定义函数'), 'valid_json');

    const schemaJson = screen.getByRole('region', { name: 'Schema JSON' });
    expect(schemaJson).toHaveTextContent('"maxLength": 42');
    expect(schemaJson).toHaveTextContent('"pattern": "^[^#]+$"');
    expect(schemaJson).toHaveTextContent('"customValidatorKey": "valid_json"');

    await user.click(screen.getByRole('tab', { name: '联动' }));
    await user.click(screen.getByRole('button', { name: '新增联动规则' }));
    expect(screen.getByText('条件字段')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '预览' }));
    const preview = screen.getByRole('region', { name: 'Renderer 预览' });
    expect(within(preview).getByText('展示项 ShowItem')).toBeInTheDocument();
    expect(within(preview).getByLabelText('清洗后标题')).toBeInTheDocument();
  });

  it('能从物料面板添加字段并撤销重做', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);

    await user.click(screen.getByRole('button', { name: '添加单行输入' }));
    expect(screen.getByRole('button', { name: '选择 单行输入' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拖拽排序 单行输入' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByRole('button', { name: '选择 单行输入' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.getByRole('button', { name: '选择 单行输入' })).toBeInTheDocument();
  });
});
