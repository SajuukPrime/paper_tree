import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../shared/types";
import PdfReader from "./components/PdfReader";
import PaperTree from "./components/PaperTree";

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>({ papers: [], relations: [], tasks: [] });
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("导入论文，从疑问开始建立关联");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const importTask = useRef<string | undefined>(undefined);
  const paper = workspace.papers.find((p) => p.id === selectedId);
  const relation = workspace.relations.find((r) => r.targetId === selectedId);
  const task = [...workspace.tasks].reverse().find((t) => t.paperId === selectedId);
  const refresh = async () => setWorkspace(await window.paperTree.loadWorkspace());
  const select = (id: string, sourcePage = 1) => {
    setSelectedId(id);
    setPage(sourcePage);
    setSelection("");
    setResultsOpen(false);
  };
  useEffect(() => {
    void window.paperTree.loadWorkspace().then((data) => {
      setWorkspace(data);
      setSelectedId(data.papers[0]?.id || "");
    });
    return window.paperTree.onUpdate((update) => {
      setMessage(update.message);
      void refresh();
      if (update.paperId) select(update.paperId);
    });
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  function importFile(file: File, taskId?: string) {
    void run(async () => {
      const imported = await window.paperTree.importPaper({
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        taskId,
      });
      select(imported.id);
      setMessage(taskId ? "PDF 已补入，并与源论文关联" : "PDF 已导入");
    });
  }
  function pickFile(taskId?: string) {
    importTask.current = taskId;
    input.current?.click();
  }
  return (
    <div className="app">
      <header>
        <strong>♧ Paper Tree</strong>
      </header>
      <div className="layout">
        <aside className="library-rail">
          <h2>阅读路线</h2>
          <button onClick={() => pickFile()} disabled={busy}>
            ＋ 导入根论文
          </button>
          <p className="hint">按概念展开 · 点击箭头折叠 · 悬停看论文全名</p>
          <PaperTree workspace={workspace} selectedId={selectedId} onSelect={select} />
          <small>
            {workspace.papers.length} 篇论文 · {workspace.relations.length} 条关联
          </small>
        </aside>
        <main
          onPointerDownCapture={(e) => {
            if ((e.target as Element).closest(".pdf-scroll")) setResultsOpen(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && !busy) importFile(file, task?.status === "waiting-pdf" ? task.id : undefined);
          }}
        >
          {paper ? (
            <>
              <div className="paper-heading">
                <h1>{paper.title}</h1>
                <small>
                  {paper.topic || "正在建立论文索引…"} · {paper.referenceCount ?? "—"} 条参考文献
                </small>
                {relation && (
                  <div className="breadcrumb">
                    <button onClick={() => select(relation.sourceId, relation.page)}>
                      ← 回到源论文 p.{relation.page}
                    </button>
                    <span>因为：{relation.selectedText || relation.question}</span>
                  </div>
                )}
              </div>
              <div className="associate-bar">
                <span>{selection || "在 PDF 中划选概念或引用"}</span>
                {task && (
                  <button onClick={() => setResultsOpen(!resultsOpen)}>关联结果 {task.candidates.length}</button>
                )}
                <button
                  disabled={!selection.trim() || busy}
                  onClick={() =>
                    void run(async () => {
                      setResultsOpen(true);
                      await window.paperTree.expand({ paperId: paper.id, page, selectedText: selection });
                      setMessage("已筛选关联论文，请选择获取");
                    })
                  }
                >
                  {busy ? "检索中…" : "关联选中内容 ↗"}
                </button>
              </div>
              <PdfReader
                paperId={paper.id}
                page={page}
                onPage={(p) => {
                  setPage(p);
                  setSelection("");
                }}
                onSelection={setSelection}
              />
            </>
          ) : (
            <div className="welcome">
              <h1>导入 PDF，开始探索论文之间的关联。</h1>
              <button onClick={() => pickFile()}>选择 PDF</button>
              <p className="hint">也可以直接拖入。导入后提取主题并缓存参考文献。</p>
            </div>
          )}
        </main>
        {resultsOpen && (task || busy) && (
          <aside className="research-panel" aria-label="关联论文气泡">
            <div className="bubble-heading">
              <h2>关联论文</h2>
              <button aria-label="收起关联论文" onClick={() => setResultsOpen(false)}>
                ×
              </button>
            </div>
            {busy && <p role="status">正在寻找关联论文…</p>}
            <div className="results">
              {task && (
                <div className="search-context">
                  <strong>{task.selectedText}</strong>
                  <small>
                    原论文 p.{task.page} · 检索词：{task.query}
                  </small>
                  {task.report && <p>{task.report}</p>}
                </div>
              )}
              {task?.status === "waiting-pdf" ? (
                <section className="waiting">
                  <small>等待下载 · 完成后自动关联</small>
                  <h3>{task.chosen?.title}</h3>
                  <p>在获取窗口登录并点击 PDF 下载。下载完成后会直接保存成子节点。</p>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => window.paperTree.acquire(task.id, task.chosen!))}
                  >
                    重新打开获取窗口
                  </button>
                  <button onClick={() => void run(() => window.paperTree.openExternal(task.chosen!.url))}>
                    用系统浏览器打开
                  </button>
                  <p>若机构登录不支持获取窗口，可用系统浏览器下载后手动补入。</p>
                  <button disabled={busy} onClick={() => pickFile(task.id)}>
                    手动补入 PDF
                  </button>
                </section>
              ) : (
                task?.candidates.map((candidate, index) => (
                  <article className="candidate" key={candidate.url + index}>
                    <small>
                      {candidate.source} · {candidate.year || "年份未提供"}
                    </small>
                    <h3>{candidate.title}</h3>
                    <p>{candidate.authors}</p>
                    <p>{candidate.reason}</p>
                    <small>
                      {candidate.access === "open"
                        ? "公开全文"
                        : candidate.access === "subscription"
                          ? "需要订阅权限"
                          : "全文权限待确认"}
                    </small>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => window.paperTree.acquire(task!.id, candidate))}
                    >
                      {candidate.access === "open" && candidate.pdfUrl ? "获取 PDF 并关联" : "打开页面，下载并关联"} ↗
                    </button>
                  </article>
                ))
              )}
              {task?.status === "failed" && <p role="alert">{task.error}</p>}
              {task?.status === "choosing" && !task.candidates.length && (
                <p>没有相关候选，请选中更完整的方法名或引用。</p>
              )}
            </div>
          </aside>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <footer role="status">{message}</footer>
      <input
        type="file"
        accept=".pdf"
        hidden
        ref={input}
        data-testid="pdf-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importFile(file, importTask.current);
          e.target.value = "";
        }}
      />
    </div>
  );
}
