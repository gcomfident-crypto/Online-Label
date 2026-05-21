import { useDraggable } from '@dnd-kit/core';

import { DESIGNER_MATERIALS, type MaterialSpec } from './templateStore';

type MaterialPanelProps = {
  onAddField: (type: MaterialSpec['type']) => void;
};

export const MaterialPanel = ({ onAddField }: MaterialPanelProps) => {
  const groups = ['基础物料', '高级物料', '布局物料'] as const;

  return (
    <aside className="designer-panel designer-materials" aria-label="物料">
      <h2>物料</h2>
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          <div className="designer-materials__list">
            {DESIGNER_MATERIALS.filter((material) => material.group === group).map((material) => (
              <DraggableMaterial key={material.type} material={material} onAddField={onAddField} />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
};

const DraggableMaterial = ({
  material,
  onAddField,
}: {
  material: MaterialSpec;
  onAddField: (type: MaterialSpec['type']) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `material:${material.type}`,
    data: { type: material.type },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div ref={setNodeRef} className="designer-material-shell" style={style}>
      <button
        aria-label={`添加${material.label}`}
        className="designer-material"
        type="button"
        onClick={() => onAddField(material.type)}
      >
        <span>{material.label}</span>
        <small>{material.type}</small>
      </button>
      <button
        aria-label={`拖拽${material.label}`}
        className="designer-material__handle"
        type="button"
        {...listeners}
        {...attributes}
      >
        拖拽
      </button>
    </div>
  );
};
