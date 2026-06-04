import type { FieldLinkageCondition, StructuredFieldLinkageAction, StructuredFieldLinkageRule } from '@labelhub/shared';

import { createEmptyCondition, createEmptyVisibilityAction, type LinkageRuleEditorNode } from './ruleEditorAst';

const cloneCondition = (condition?: FieldLinkageCondition): FieldLinkageCondition => ({
  ...createEmptyCondition(),
  ...condition,
});

const cloneAction = (action?: StructuredFieldLinkageAction): StructuredFieldLinkageAction => ({
  ...createEmptyVisibilityAction(),
  ...action,
});

const resolveActionIndexForKeyword = (
  nodes: readonly LinkageRuleEditorNode[],
  keywordIndex: number,
): number | null => {
  const fieldNode = nodes.slice(keywordIndex).find((item) => item.type === 'field_ref');

  if (fieldNode?.type === 'field_ref' && fieldNode.binding.kind === 'action') {
    return fieldNode.binding.actionIndex;
  }

  const optionNode = nodes.slice(keywordIndex).find((item) => item.type === 'action_options');
  return optionNode?.type === 'action_options' ? optionNode.actionIndex : null;
};

export const parseConditionNodesToRuleDraft = (
  nodes: readonly LinkageRuleEditorNode[],
  fallbackRule?: StructuredFieldLinkageRule,
): Pick<StructuredFieldLinkageRule, 'combinator' | 'conditions'> => {
  const conditionIndexes = new Set<number>();

  for (const node of nodes) {
    if (node.type === 'field_ref' && node.binding.kind === 'condition') {
      conditionIndexes.add(node.binding.conditionIndex);
    }

    if (node.type === 'operator' || node.type === 'literal') {
      conditionIndexes.add(node.conditionIndex);
    }
  }

  const orderedIndexes = [...conditionIndexes].sort((left, right) => left - right);
  const conditions = orderedIndexes.map((conditionIndex) =>
    cloneCondition(fallbackRule?.conditions[conditionIndex]),
  );

  for (const node of nodes) {
    if (node.type === 'field_ref' && node.binding.kind === 'condition') {
      conditions[node.binding.conditionIndex] = {
        ...conditions[node.binding.conditionIndex],
        fieldKey: node.fieldKey,
      };
    }

    if (node.type === 'operator') {
      conditions[node.conditionIndex] = {
        ...conditions[node.conditionIndex],
        operator: node.value,
      };
    }

    if (node.type === 'literal') {
      conditions[node.conditionIndex] = {
        ...conditions[node.conditionIndex],
        value: node.value,
      };
    }
  }

  const normalizedConditions = conditions.map((condition) =>
    condition.operator === 'exists' || condition.operator === 'notExists'
      ? { ...condition, value: undefined }
      : condition,
  );

  return {
    combinator: nodes.some((node) => node.type === 'keyword' && node.text === '或') ? 'or' : 'and',
    conditions: normalizedConditions.length > 0 ? normalizedConditions : [cloneCondition(fallbackRule?.conditions[0])],
  };
};

export const parseActionNodesToRuleDraft = (
  nodes: readonly LinkageRuleEditorNode[],
  fallbackRule?: StructuredFieldLinkageRule,
): Pick<StructuredFieldLinkageRule, 'actions'> => {
  const actionIndexes = new Set<number>();

  for (const node of nodes) {
    if (node.type === 'field_ref' && node.binding.kind === 'action') {
      actionIndexes.add(node.binding.actionIndex);
    }

    if (node.type === 'action_options') {
      actionIndexes.add(node.actionIndex);
    }
  }

  const orderedIndexes = [...actionIndexes].sort((left, right) => left - right);
  const actions = orderedIndexes.map((actionIndex) => cloneAction(fallbackRule?.actions[actionIndex]));

  for (const [nodeIndex, node] of nodes.entries()) {
    if (node.type === 'keyword') {
      const actionIndex = resolveActionIndexForKeyword(nodes, nodeIndex);

      if (actionIndex === null) {
        continue;
      }

      if (node.text === '显示' || node.text === '隐藏' || node.text === '限制') {
        actions[actionIndex] = {
          ...actions[actionIndex],
          type: node.text === '显示' ? 'show' : node.text === '隐藏' ? 'hide' : 'limitOptions',
        };
      }
    }

    if (node.type === 'field_ref' && node.binding.kind === 'action') {
      actions[node.binding.actionIndex] = {
        ...actions[node.binding.actionIndex],
        targetFieldKey: node.fieldKey,
      };
    }

    if (node.type === 'action_options') {
      actions[node.actionIndex] = {
        ...actions[node.actionIndex],
        type: 'limitOptions',
        optionValues: [...node.optionValues],
      };
    }
  }

  return {
    actions: actions.length > 0 ? actions : [cloneAction(fallbackRule?.actions[0])],
  };
};

export const parseEditorNodesToStructuredRule = (
  input: {
    actionNodes: readonly LinkageRuleEditorNode[];
    conditionNodes: readonly LinkageRuleEditorNode[];
  },
  fallbackRule?: StructuredFieldLinkageRule,
): StructuredFieldLinkageRule => {
  const parsedConditions = parseConditionNodesToRuleDraft(input.conditionNodes, fallbackRule);
  const parsedActions = parseActionNodesToRuleDraft(input.actionNodes, fallbackRule);

  return {
    ...fallbackRule,
    ...parsedConditions,
    ...parsedActions,
  };
};
