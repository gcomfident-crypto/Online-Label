import { useMemo, useState } from 'react';

import type { SchemaField } from '@labelhub/shared';

import { CUSTOM_VALIDATOR_OPTIONS } from './templateStore';

type PropertyPanelProps = {
  field: SchemaField | null;
  onUpdateField: (patch: Partial<SchemaField>) => void;
  onUpdateValidation: (patch: NonNullable<SchemaField['validation']>) => void;
  onAddLinkageRule: () => void;
};

type PropertyTab = 'basic' | 'validation' | 'linkage';

const TABS: readonly { key: PropertyTab; label: string }[] = [
  { key: 'basic', label: '基础' },
  { key: 'validation', label: '校验' },
  { key: 'linkage', label: '联动' },
];

export const PropertyPanel = ({
  field,
  onUpdateField,
  onUpdateValidation,
  onAddLinkageRule,
}: PropertyPanelProps) => {
  const [activeTab, setActiveTab] = useState<PropertyTab>('basic');
  const optionsDraft = useMemo(() => formatOptions(field), [field]);

  return (
    <aside className="designer-panel designer-properties" aria-label="属性配置">
      <h2>{field ? `属性配置 · ${field.fieldKey ?? field.key}` : '属性配置'}</h2>
      <div className="designer-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            aria-selected={activeTab === tab.key}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!field ? (
        <p>请选择画布中的字段后配置属性。</p>
      ) : (
        <>
          {activeTab === 'basic' ? (
            <BasicProperties field={field} optionsDraft={optionsDraft} onUpdateField={onUpdateField} />
          ) : null}
          {activeTab === 'validation' ? (
            <ValidationProperties field={field} onUpdateValidation={onUpdateValidation} />
          ) : null}
          {activeTab === 'linkage' ? (
            <LinkageProperties field={field} onAddLinkageRule={onAddLinkageRule} />
          ) : null}
        </>
      )}
    </aside>
  );
};

const BasicProperties = ({
  field,
  optionsDraft,
  onUpdateField,
}: {
  field: SchemaField;
  optionsDraft: string;
  onUpdateField: (patch: Partial<SchemaField>) => void;
}) => {
  return (
    <div className="designer-form-grid">
      <label>
        字段名
        <input
          aria-label="字段名"
          value={field.fieldKey ?? field.key}
          onChange={(event) => onUpdateField({ fieldKey: event.target.value })}
        />
      </label>
      <label>
        标题
        <input
          aria-label="标题"
          value={field.label}
          onChange={(event) => onUpdateField({ label: event.target.value })}
        />
      </label>
      <label>
        占位符
        <input
          aria-label="占位符"
          value={field.placeholder ?? ''}
          onChange={(event) => onUpdateField({ placeholder: event.target.value })}
        />
      </label>
      <label>
        原始数据 sourceKey
        <input
          aria-label="原始数据 sourceKey"
          value={field.sourceKey ?? field.sourceKeys?.join(',') ?? ''}
          onChange={(event) => onUpdateField({ sourceKey: event.target.value })}
        />
      </label>
      <label>
        LLM targetFieldKey
        <input
          aria-label="LLM targetFieldKey"
          value={field.targetFieldKey ?? ''}
          onChange={(event) => onUpdateField({ targetFieldKey: event.target.value })}
        />
      </label>
      <label>
        选项
        <textarea
          aria-label="选项"
          value={optionsDraft}
          onChange={(event) => onUpdateField({ options: parseOptions(event.target.value) })}
        />
      </label>
    </div>
  );
};

const ValidationProperties = ({
  field,
  onUpdateValidation,
}: {
  field: SchemaField;
  onUpdateValidation: (patch: NonNullable<SchemaField['validation']>) => void;
}) => {
  return (
    <div className="designer-form-grid">
      <label className="designer-toggle">
        <input
          aria-label="必填"
          checked={Boolean(field.validation?.required)}
          type="checkbox"
          onChange={(event) => onUpdateValidation({ required: event.target.checked })}
        />
        必填
      </label>
      <label>
        最小长度
        <input
          aria-label="最小长度"
          min="0"
          type="number"
          value={field.validation?.minLength ?? ''}
          onChange={(event) => onUpdateValidation({ minLength: numericValue(event.target.value) })}
        />
      </label>
      <label>
        最大长度
        <input
          aria-label="最大长度"
          min="0"
          type="number"
          value={field.validation?.maxLength ?? ''}
          onChange={(event) => onUpdateValidation({ maxLength: numericValue(event.target.value) })}
        />
      </label>
      <label>
        正则
        <input
          aria-label="正则"
          value={field.validation?.pattern ?? ''}
          onChange={(event) => onUpdateValidation({ pattern: event.target.value })}
        />
      </label>
      <label>
        自定义函数
        <select
          aria-label="自定义函数"
          value={field.validation?.customValidatorKey ?? ''}
          onChange={(event) =>
            onUpdateValidation({
              customValidatorKey: event.target.value
                ? (event.target.value as NonNullable<SchemaField['validation']>['customValidatorKey'])
                : undefined,
            })
          }
        >
          <option value="">不使用</option>
          {CUSTOM_VALIDATOR_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const LinkageProperties = ({
  field,
  onAddLinkageRule,
}: {
  field: SchemaField;
  onAddLinkageRule: () => void;
}) => {
  return (
    <div className="designer-linkage">
      <button type="button" onClick={onAddLinkageRule}>
        新增联动规则
      </button>
      {(field.linkageRules ?? []).map((rule, index) => (
        <div key={`${rule.targetFieldKey}:${index}`} className="designer-linkage__rule">
          <span>条件字段</span>
          <code>{rule.when.fieldKey}</code>
          <span>动作</span>
          <code>{rule.action}</code>
          <span>目标字段</span>
          <code>{rule.targetFieldKey}</code>
        </div>
      ))}
    </div>
  );
};

const numericValue = (value: string): number | undefined => {
  return value === '' ? undefined : Number(value);
};

const formatOptions = (field: SchemaField | null): string => {
  return (field?.options ?? []).map((option) => `${option.label}=${option.value}`).join('\n');
};

const parseOptions = (value: string): SchemaField['options'] => {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, optionValue] = line.split('=');

      return {
        label: label.trim(),
        value: (optionValue ?? label).trim(),
      };
    });
};
