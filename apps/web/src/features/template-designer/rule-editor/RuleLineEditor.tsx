import type { ReactNode } from 'react';

import type { LinkageRuleEditorNode } from './ruleEditorAst';

export const RuleLineEditor = ({
  className = '',
  nodes,
  renderKeyword,
  renderFieldReference,
  renderOperator,
  renderLiteral,
  renderOptions,
}: {
  className?: string;
  nodes: readonly LinkageRuleEditorNode[];
  renderKeyword?: (node: Extract<LinkageRuleEditorNode, { type: 'keyword' }>, index: number) => ReactNode;
  renderFieldReference: (node: Extract<LinkageRuleEditorNode, { type: 'field_ref' }>) => ReactNode;
  renderOperator: (node: Extract<LinkageRuleEditorNode, { type: 'operator' }>) => ReactNode;
  renderLiteral: (node: Extract<LinkageRuleEditorNode, { type: 'literal' }>) => ReactNode;
  renderOptions: (node: Extract<LinkageRuleEditorNode, { type: 'action_options' }>) => ReactNode;
}) => {
  return (
    <div className={`designer-linkage-rule-editor__line${className ? ` ${className}` : ''}`}>
      {nodes.map((node, index) => {
        if (node.type === 'keyword') {
          return renderKeyword ? (
            <span key={`${node.text}:${index}`}>{renderKeyword(node, index)}</span>
          ) : (
            <span className="designer-linkage-rule-editor__keyword" key={`${node.text}:${index}`}>
              {node.text}
            </span>
          );
        }

        if (node.type === 'whitespace') {
          return <span aria-hidden="true" key={`space:${index}`}>{node.text}</span>;
        }

        if (node.type === 'field_ref') {
          return <span key={`field:${node.binding.kind}:${index}`}>{renderFieldReference(node)}</span>;
        }

        if (node.type === 'operator') {
          return <span key={`operator:${node.conditionIndex}`}>{renderOperator(node)}</span>;
        }

        if (node.type === 'literal') {
          return <span key={`literal:${node.conditionIndex}`}>{renderLiteral(node)}</span>;
        }

        if (node.type === 'action_options') {
          return <span key={`options:${node.actionIndex}`}>{renderOptions(node)}</span>;
        }

        return <span key={`break:${index}`} className="designer-linkage-rule-editor__break" />;
      })}
    </div>
  );
};
