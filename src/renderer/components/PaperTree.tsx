import { useEffect, useRef } from "react";
import { Network } from "vis-network/standalone";
import { tr, type Workspace } from "../../shared/types";
export default function PaperTree({
  workspace,
  selectedId,
  onSelect,
}: {
  workspace: Workspace;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    graph = useRef<Network | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const parents = new Map(workspace.relations.map((r) => [r.targetId, r]));
  const path = new Set<string>();
  for (let id: string | undefined = selectedId; id && !path.has(id); id = parents.get(id)?.sourceId) path.add(id);
  // Only paper metadata or relation changes rebuild the layout; reading a different paper keeps the map still.
  const structure = workspace.papers.map((p) => p.id + p.title).join() + workspace.relations.map((r) => r.id).join();
  useEffect(() => {
    const palette = ["#7edfc4", "#9dafff", "#edb784", "#d598e8", "#8cc9ee"];
    const roots = workspace.papers.filter((p) => !parents.has(p.id));
    const nodes: { id: string; label: string; x: number; y: number; size: number; color: string }[] = [];
    const place = (id: string, x: number, y: number, angle: number, depth: number, color: string) => {
      const paper = workspace.papers.find((p) => p.id === id)!;
      const task = workspace.tasks.find((t) => t.chosen?.url && t.chosen.url === paper.sourceUrl);
      const label = paper.renamed ? paper.title : task?.plan?.terms[0] || parents.get(id)?.selectedText || paper.title.split(/[:：]/)[0];
      nodes.push({
        id,
        label: label.replace(/(.{10,16})\s/g, "$1\n"),
        x,
        y,
        size: depth === 0 ? 23 : depth === 1 ? 13 : 8,
        color,
      });
      const children = workspace.relations.filter((r) => r.sourceId === id);
      children.forEach((r, i) => {
        const a =
          depth === 0
            ? (i * Math.PI * 2) / children.length - Math.PI / 2
            : angle + (i - (children.length - 1) / 2) * (children.length === 2 ? 1.2 : 0.75);
        const distance = depth === 0 ? 175 : 115;
        place(
          r.targetId,
          x + Math.cos(a) * distance,
          y + Math.sin(a) * distance,
          a,
          depth + 1,
          depth === 0 ? palette[i % palette.length] : color,
        );
      });
    };
    roots.forEach((p, i) => place(p.id, i * 650, 0, 0, 0, "#e9f4ee"));
    const network = new Network(
      host.current!,
      {
        nodes,
        edges: workspace.relations.map((r) => ({ id: r.id, from: r.sourceId, to: r.targetId })),
      },
      {
        physics: false,
        nodes: {
          shape: "dot",
          borderWidth: 0,
          borderWidthSelected: 3,
          font: { color: "#becedc", size: 14, face: "-apple-system", strokeWidth: 0 },
          shadow: { enabled: true, color: "#73cdb84d", size: 18, x: 0, y: 0 },
        },
        edges: {
          color: { color: "#3e5668", highlight: "#b5f3dd", inherit: false },
          width: 1.2,
          smooth: { enabled: true, type: "continuous", roundness: 0.15 },
        },
        interaction: { hover: true, selectConnectedEdges: false, zoomSpeed: 0.45 },
      },
    );
    graph.current = network;
    const resize = new ResizeObserver(() => requestAnimationFrame(() => {
      if (graph.current === network) network.fit({ animation: false });
    }));
    resize.observe(host.current!);
    network.on("click", ({ nodes }) => {
      if (nodes.length) select.current(String(nodes[0]));
    });
    network.fit({ animation: { duration: 600, easingFunction: "easeInOutQuad" } });
    return () => {
      resize.disconnect();
      network.destroy();
      graph.current = null;
    };
  }, [structure]);
  useEffect(() => {
    graph.current?.setSelection(
      {
        nodes: workspace.papers.filter((p) => p.id === selectedId).map((p) => p.id),
        edges: workspace.relations.filter((r) => path.has(r.targetId)).map((r) => r.id),
      },
      { highlightEdges: false },
    );
  }, [selectedId, structure]);
  return (
    <section className="paper-map" aria-label={tr("论文探索网络", "Paper exploration map")}>
      <button onClick={() => graph.current?.fit({ animation: true })}>{tr("适合窗口", "Fit to view")}</button>
      <div className="network-canvas" ref={host} />
      <select
        className="paper-picker"
        aria-label={tr("切换论文", "Switch paper")}
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {workspace.papers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </section>
  );
}
