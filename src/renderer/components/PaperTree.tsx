import { useState } from "react";
import type { Workspace } from "../../shared/types";
export default function PaperTree({
  workspace,
  selectedId,
  onSelect,
}: {
  workspace: Workspace;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const parents = new Map(workspace.relations.map((r) => [r.targetId, r]));
  const path = new Set<string>();
  for (let id: string | undefined = selectedId; id && !path.has(id); id = parents.get(id)?.sourceId) path.add(id);
  const node = (id: string) => {
    const paper = workspace.papers.find((p) => p.id === id)!;
    const edge = parents.get(id);
    const children = workspace.relations.filter((r) => r.sourceId === id);
    const label = edge?.selectedText || paper.title.split(/[:：]/)[0];
    const folded = collapsed.has(id);
    return (
      <li key={id}>
        <div className={`tree-row ${selectedId === id ? "selected" : path.has(id) ? "on-path" : ""}`}>
          <button
            className="tree-toggle"
            aria-label={`${folded ? "展开" : "收起"} ${label}`}
            aria-expanded={!folded}
            disabled={!children.length}
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          >
            {children.length ? (folded ? "▸" : "▾") : "·"}
          </button>
          <button
            className="tree-node"
            aria-label={paper.title}
            aria-current={selectedId === id ? "page" : undefined}
            title={`${paper.title}${edge ? `\n来自 ${edge.selectedText} · p.${edge.page}` : "\n起点论文"}`}
            onClick={() => onSelect(id)}
          >
            <span>{label}</span>
            <small>{children.length ? `${children.length} 分支` : edge ? `p.${edge.page}` : "起点"}</small>
          </button>
        </div>
        {!folded && children.length > 0 && <ul>{children.map((r) => node(r.targetId))}</ul>}
      </li>
    );
  };
  return (
    <nav aria-label="论文关系树">
      <ul className="tree">{workspace.papers.filter((p) => !parents.has(p.id)).map((p) => node(p.id))}</ul>
    </nav>
  );
}
