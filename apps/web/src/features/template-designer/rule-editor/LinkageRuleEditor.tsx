import type { FieldLinkageCondition, SchemaField, StructuredFieldLinkageAction, StructuredFieldLinkageRule } from '@labelhub/shared';

import conditionIcon from '../../../assets/condition.svg';
import lighteningIcon from '../../../assets/lightening.svg';
import { FieldReferenceToken } from './FieldReferenceToken';
import { InlineChoicePopover } from './InlineChoicePopover';
import {
  createEmptyCondition,
  createEmptyLimitOptionsAction,
  createEmptySetValueAction,
  createEmptyVisibilityAction,
  type LinkageRuleFieldOption,
} from './ruleEditorAst';
import { validateStructuredLinkageRuleDraft } from './ruleEditorValidation';

const CONDITION_OPERATOR_OPTIONS: Array<{ label: string; value: FieldLinkageCondition['operator'] }> = [
  { label: '等于', value: 'equals' },
  { label: '不等于', value: 'notEquals' },
  { label: '为空', value: 'notExists' },
  { label: '不为空', value: 'exists' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
] as const;

const ACTION_KIND_OPTIONS: Array<{ label: string; value: StructuredFieldLinkageAction['type'] }> = [
  { label: '设置', value: 'setValue' },
  { label: '显示', value: 'show' },
  { label: '隐藏', value: 'hide' },
  { label: '限制选项', value: 'limitOptions' },
  { label: '设为必填', value: 'require' },
  { label: '禁用字段', value: 'disable' },
] as const;

const HIDDEN_DRAFT_ERROR_MESSAGES = new Set(['条件字段未设置。', '动作目标字段未设置。']);

export const LinkageRuleEditor = ({
  index,
  rule,
  fieldsByKey,
  conditionFieldOptions,
  targetFieldOptions,
  limitTargetFieldOptions,
  onChange,
}: {
  index: number;
  rule: StructuredFieldLinkageRule;
  fieldsByKey: ReadonlyMap<string, SchemaField>;
  conditionFieldOptions: readonly LinkageRuleFieldOption[];
  targetFieldOptions: readonly LinkageRuleFieldOption[];
  limitTargetFieldOptions: readonly LinkageRuleFieldOption[];
  onChange: (rule: StructuredFieldLinkageRule) => void;
}) => {
  const validationErrors = validateStructuredLinkageRuleDraft(rule, fieldsByKey);
  const visibleValidationErrors = validationErrors.filter((error) => !HIDDEN_DRAFT_ERROR_MESSAGES.has(error.message));

  const updateRule = (patch: Partial<StructuredFieldLinkageRule>) => {
    onChange({
      ...rule,
      ...patch,
    });
  };

  const updateCondition = (conditionIndex: number, patch: Partial<FieldLinkageCondition>) => {
    const nextConditions = rule.conditions.map((condition, currentIndex) => (
      currentIndex === conditionIndex ? { ...condition, ...patch } : condition
    ));

    updateRule({
      conditions: nextConditions,
    });
  };

  const updateAction = (actionIndex: number, patch: Partial<StructuredFieldLinkageAction>) => {
    const nextActions = rule.actions.map((action, currentIndex) => (
      currentIndex === actionIndex ? { ...action, ...patch } : action
    ));

    updateRule({
      actions: nextActions,
    });
  };

  const replaceAction = (actionIndex: number, nextAction: StructuredFieldLinkageAction) => {
    const nextActions = rule.actions.map((action, currentIndex) => (currentIndex === actionIndex ? nextAction : action));

    updateRule({
      actions: nextActions,
    });
  };

  const addCondition = () => {
    updateRule({
      conditions: [...rule.conditions, createEmptyCondition()],
    });
  };

  const removeCondition = (conditionIndex: number) => {
    const nextConditions = rule.conditions.filter((_, currentIndex) => currentIndex !== conditionIndex);

    updateRule({
      conditions: nextConditions.length > 0 ? nextConditions : [createEmptyCondition()],
    });
  };

  const toggleCombinator = () => {
    updateRule({
      combinator: (rule.combinator ?? 'and') === 'and' ? 'or' : 'and',
    });
  };

  const addAction = () => {
    updateRule({
      actions: [...rule.actions, createEmptyVisibilityAction()],
    });
  };

  const removeAction = (actionIndex: number) => {
    const nextActions = rule.actions.filter((_, currentIndex) => currentIndex !== actionIndex);

    updateRule({
      actions: nextActions.length > 0 ? nextActions : [createEmptyVisibilityAction()],
    });
  };

  const hasMultipleConditions = rule.conditions.length > 1;
  const combinatorLabel = (rule.combinator ?? 'and') === 'and' ? '且' : '或';
  const nextCombinatorLabel = (rule.combinator ?? 'and') === 'and' ? '或' : '且';

  return (
    <div className="designer-linkage-rule-editor">
      <div className="designer-linkage-rule-editor__blocks">
        <section
          aria-label={`联动 ${index + 1} 条件`}
          className="designer-linkage-rule-editor__block designer-linkage-rule-editor__block--conditions"
          role="group"
        >
          <div className="designer-linkage-rule-editor__block-header">
            <span className="designer-linkage-rule-editor__block-title">
              <img
                alt=""
                aria-hidden="true"
                className="designer-linkage-rule-editor__block-title-icon"
                src={conditionIcon}
              />
              条件
            </span>
            <button
              aria-label="添加条件"
              className="designer-linkage-rule-editor__add-row"
              type="button"
              onClick={addCondition}
            >
              + 添加条件
            </button>
          </div>
          <div
            className={[
              'designer-linkage-rule-editor__condition-stack',
              hasMultipleConditions
                ? 'designer-linkage-rule-editor__condition-stack--joined'
                : 'designer-linkage-rule-editor__condition-stack--single',
            ].join(' ')}
          >
            {hasMultipleConditions ? (
              <div className="designer-linkage-rule-editor__condition-combinator">
                <span
                  aria-hidden="true"
                  className="designer-linkage-rule-editor__condition-curve designer-linkage-rule-editor__condition-curve--top"
                />
                <button
                  aria-label={`条件组合：${combinatorLabel}，点击切换为${nextCombinatorLabel}`}
                  className="designer-linkage-rule-editor__combinator-toggle"
                  type="button"
                  onClick={toggleCombinator}
                >
                  <span className="designer-linkage-rule-editor__combinator-toggle-text">{combinatorLabel}</span>
                  <span aria-hidden="true" className="designer-linkage-rule-editor__combinator-toggle-icon">
                    ↕
                  </span>
                </button>
                <span
                  aria-hidden="true"
                  className="designer-linkage-rule-editor__condition-curve designer-linkage-rule-editor__condition-curve--bottom"
                />
              </div>
            ) : null}
            <div className="designer-linkage-rule-editor__rows designer-linkage-rule-editor__rows--conditions">
              {rule.conditions.map((condition, conditionIndex) => (
                <ConditionRow
                  key={`condition:${conditionIndex}`}
                  condition={condition}
                  conditionFieldOptions={conditionFieldOptions}
                  conditionIndex={conditionIndex}
                  fieldsByKey={fieldsByKey}
                  index={index}
                  onChange={(patch) => updateCondition(conditionIndex, patch)}
                  onRemove={() => removeCondition(conditionIndex)}
                />
              ))}
            </div>
          </div>
        </section>
        <section
          aria-label={`联动 ${index + 1} 动作`}
          className="designer-linkage-rule-editor__block designer-linkage-rule-editor__block--actions"
          role="group"
        >
          <div className="designer-linkage-rule-editor__block-header">
            <span className="designer-linkage-rule-editor__block-title">
              <img
                alt=""
                aria-hidden="true"
                className="designer-linkage-rule-editor__block-title-icon"
                src={lighteningIcon}
              />
              动作
            </span>
            <button
              aria-label="添加动作"
              className="designer-linkage-rule-editor__add-row"
              type="button"
              onClick={addAction}
            >
              + 添加动作
            </button>
          </div>
          <div className="designer-linkage-rule-editor__rows">
            {rule.actions.map((action, actionIndex) => (
              <ActionRow
                key={`action:${actionIndex}`}
                action={action}
                actionIndex={actionIndex}
                fieldsByKey={fieldsByKey}
                index={index}
                limitTargetFieldOptions={limitTargetFieldOptions}
                targetFieldOptions={targetFieldOptions}
                onChange={(patch) => updateAction(actionIndex, patch)}
                onRemove={() => removeAction(actionIndex)}
                onReplace={(nextAction) => replaceAction(actionIndex, nextAction)}
              />
            ))}
          </div>
        </section>
      </div>
      {visibleValidationErrors.length > 0 ? (
        <div className="designer-linkage-rule-editor__errors" role="alert">
          {visibleValidationErrors.map((error) => (
            <p key={error.message}>{error.message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
};

type ConditionRowProps = {
  condition: FieldLinkageCondition;
  conditionFieldOptions: readonly LinkageRuleFieldOption[];
  conditionIndex: number;
  fieldsByKey: ReadonlyMap<string, SchemaField>;
  index: number;
  onChange: (patch: Partial<FieldLinkageCondition>) => void;
  onRemove: () => void;
};

const ConditionRow = ({
  condition,
  conditionFieldOptions,
  conditionIndex,
  fieldsByKey,
  index,
  onChange,
  onRemove,
}: ConditionRowProps) => {
  const field = fieldsByKey.get(condition.fieldKey);
  const needsValue = condition.operator !== 'exists' && condition.operator !== 'notExists';

  const rowClassName = [
    'designer-linkage-rule-editor__row',
    'designer-linkage-rule-editor__row--condition',
    conditionIndex === 0 ? 'designer-linkage-rule-editor__row--condition-primary' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClassName}>
      <div className="designer-linkage-rule-editor__row-body">
        <FieldReferenceToken
          ariaLabel={`规则 ${index + 1} 条件字段 ${conditionIndex + 1}`}
          options={conditionFieldOptions}
          value={condition.fieldKey}
          onChange={(fieldKey) => {
            const nextField = fieldsByKey.get(fieldKey);
            onChange({
              fieldKey,
              value: needsValue ? inferValue(nextField, condition.value) : undefined,
            });
          }}
        />
        <InlineChoicePopover
          ariaLabel={`规则 ${index + 1} 条件 ${conditionIndex + 1} 操作符`}
          options={CONDITION_OPERATOR_OPTIONS}
          tone="operator"
          value={condition.operator}
          onChange={(operator) => {
            onChange({
              operator,
              value: operator === 'exists' || operator === 'notExists' ? undefined : inferValue(field, condition.value),
            });
          }}
        />
        {needsValue ? (
          <LinkageValueToken
            ariaLabel={`规则 ${index + 1} 条件 ${conditionIndex + 1} 值`}
            field={field}
            value={condition.value}
            onChange={(value) => onChange({ value })}
          />
        ) : null}
      </div>
      <button
        aria-label={`删除条件 ${conditionIndex + 1}`}
        className="designer-linkage-rule-editor__remove-row"
        type="button"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
};

type ActionRowProps = {
  action: StructuredFieldLinkageAction;
  actionIndex: number;
  fieldsByKey: ReadonlyMap<string, SchemaField>;
  index: number;
  limitTargetFieldOptions: readonly LinkageRuleFieldOption[];
  targetFieldOptions: readonly LinkageRuleFieldOption[];
  onChange: (patch: Partial<StructuredFieldLinkageAction>) => void;
  onRemove: () => void;
  onReplace: (action: StructuredFieldLinkageAction) => void;
};

const ActionRow = ({
  action,
  actionIndex,
  fieldsByKey,
  index,
  limitTargetFieldOptions,
  targetFieldOptions,
  onChange,
  onRemove,
  onReplace,
}: ActionRowProps) => {
  const targetField = fieldsByKey.get(action.targetFieldKey);
  const actionFieldOptions = action.type === 'limitOptions' ? limitTargetFieldOptions : targetFieldOptions;
  const actionTypeToken = (
    <InlineChoicePopover
      ariaLabel={`规则 ${index + 1} 动作 ${actionIndex + 1} 类型`}
      options={ACTION_KIND_OPTIONS}
      tone="action"
      value={action.type}
      onChange={(nextType) => onReplace(createActionForType(nextType, action, fieldsByKey))}
    />
  );
  const fieldToken = (
    <FieldReferenceToken
      ariaLabel={`规则 ${index + 1} 动作字段 ${actionIndex + 1}`}
      options={actionFieldOptions}
      value={action.targetFieldKey}
      onChange={(targetFieldKey) => {
        const nextTargetField = fieldsByKey.get(targetFieldKey);

        if (action.type === 'limitOptions') {
          onReplace(createEmptyLimitOptionsAction(targetFieldKey));
          return;
        }

        if (action.type === 'setValue') {
          onReplace(createEmptySetValueAction(targetFieldKey, inferValue(nextTargetField, action.value)));
          return;
        }

        onChange({ targetFieldKey });
      }}
    />
  );

  const rowClassName = [
    'designer-linkage-rule-editor__row',
    'designer-linkage-rule-editor__row--action',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClassName}>
      <span className="designer-linkage-rule-editor__row-prefix">{actionTypeToken}</span>
      <div className="designer-linkage-rule-editor__row-body">
        {action.type === 'setValue' ? (
          <>
            {fieldToken}
            <span className="designer-linkage-rule-editor__keyword designer-linkage-rule-editor__keyword--action">
              为
            </span>
            <LinkageValueToken
              ariaLabel={`规则 ${index + 1} 动作 ${actionIndex + 1} 值`}
              field={targetField}
              value={action.value}
              onChange={(value) => onChange({ value })}
            />
          </>
        ) : null}
        {action.type === 'limitOptions' ? (
          <>
            {fieldToken}
            <span className="designer-linkage-rule-editor__keyword">为</span>
            <LimitOptionsToken
              action={action}
              actionIndex={actionIndex}
              index={index}
              targetField={targetField}
              onChange={(optionValues) => onChange({ optionValues })}
            />
          </>
        ) : null}
        {action.type !== 'setValue' && action.type !== 'limitOptions' ? fieldToken : null}
      </div>
      <button
        aria-label={`删除动作 ${actionIndex + 1}`}
        className="designer-linkage-rule-editor__remove-row"
        type="button"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
};

const createActionForType = (
  nextType: StructuredFieldLinkageAction['type'],
  currentAction: StructuredFieldLinkageAction,
  fieldsByKey: ReadonlyMap<string, SchemaField>,
): StructuredFieldLinkageAction => {
  const targetFieldKey = currentAction.targetFieldKey ?? '';
  const targetField = fieldsByKey.get(targetFieldKey);

  if (nextType === 'limitOptions') {
    return createEmptyLimitOptionsAction(targetFieldKey);
  }

  if (nextType === 'setValue') {
    return createEmptySetValueAction(targetFieldKey, inferValue(targetField, currentAction.value));
  }

  if (nextType === 'show' || nextType === 'hide') {
    return createEmptyVisibilityAction(targetFieldKey, nextType);
  }

  return { type: nextType, targetFieldKey };
};

const LinkageValueToken = ({
  ariaLabel,
  field,
  value,
  onChange,
}: {
  ariaLabel: string;
  field: SchemaField | undefined;
  value: unknown;
  onChange: (value: string) => void;
}) => {
  const options = field?.options ?? [];

  return (
    <InlineChoicePopover
      ariaLabel={ariaLabel}
      emptyLabel={field ? '当前字段没有可选值' : '请先选择字段'}
      options={options.map((option) => ({ label: option.label, value: option.value }))}
      placeholder="填写值"
      tone="value"
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
    />
  );
};

const LimitOptionsToken = ({
  action,
  index,
  targetField,
  onChange,
}: {
  action: StructuredFieldLinkageAction;
  actionIndex: number;
  index: number;
  targetField: SchemaField | undefined;
  onChange: (optionValues: readonly string[]) => void;
}) => {
  const targetOptions = targetField?.options ?? [];

  return (
    <div className="designer-linkage-rule-editor__option-chips" role="group" aria-label={`规则 ${index + 1} 限制选项`}>
      {targetOptions.map((option) => {
        const selected = action.type === 'limitOptions' && (action.optionValues ?? []).includes(option.value);

        return (
          <button
            key={option.value}
            aria-pressed={selected}
            className={selected ? 'is-selected' : ''}
            type="button"
            onClick={() => {
              if (action.type !== 'limitOptions') {
                return;
              }

              const currentValues = action.optionValues ?? [];
              const nextOptionValues = selected
                ? currentValues.filter((value) => value !== option.value)
                : [...currentValues, option.value];

              onChange(nextOptionValues);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

const inferValue = (field: SchemaField | undefined, currentValue: unknown): unknown => {
  if (!field?.options || field.options.length === 0) {
    return currentValue ?? '';
  }

  if (field.options.some((option) => option.value === currentValue)) {
    return currentValue;
  }

  return field.options[0]?.value ?? '';
};
