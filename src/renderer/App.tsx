import { useEffect, useRef, useState } from "react";
import { tr, type Workspace, type SelectionRect, type ModelSettings } from "../shared/types";
import PdfReader from "./components/PdfReader";
import PaperTree from "./components/PaperTree";
function Icon({ name }: { name: "settings" | "edit" | "trash" | "close" }) {
  const paths = {
    settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0",
    edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z",
    trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    close: "m6 6 12 12M6 18 18 6",
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export default function App() {
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [settings, setSettings] = useState<ModelSettings>();
  const [title, setTitle] = useState<string>();
  const [workspace, setWorkspace] = useState<Workspace>({ papers: [], relations: [], tasks: [] });
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(1);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [split, setSplit] = useState(42);
  const [jump, setJump] = useState<{ page: number; text: string; token: number; rect?: SelectionRect }>({
    page: 0,
    text: "",
    token: 0,
  });
  const [taskId, setTaskId] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(tr("导入论文，从疑问开始建立关联", "Import a paper and explore its connections"));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const importTask = useRef<string | undefined>(undefined);
  const paper = workspace.papers.find((p) => p.id === selectedId);
  const relation = workspace.relations.find((r) => r.targetId === selectedId);
  const searches = workspace.tasks.filter((t) => t.paperId === selectedId);
  const task = searches.find((t) => t.id === taskId) || searches.at(-1);
  const parents = new Map(workspace.relations.map((r) => [r.targetId, r.sourceId]));
  const rootOf = (id: string): string => (parents.has(id) ? rootOf(parents.get(id)!) : id);
  const rootId = rootOf(selectedId);
  const roots = workspace.papers.filter((p) => !parents.has(p.id));
  const activeWorkspace = {
    ...workspace,
    papers: workspace.papers.filter((p) => rootOf(p.id) === rootId),
    relations: workspace.relations.filter((r) => rootOf(r.sourceId) === rootId),
  };
  const filteredPapers = roots.filter((p) =>
    `${p.title} ${p.topic || ""} ${p.fileName}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const refresh = async () => setWorkspace(await window.paperTree.loadWorkspace());
  const select = (id: string, sourcePage = 0, text = "", rect?: SelectionRect) => {
    setJump({ page: sourcePage, text, rect, token: Date.now() });
    setTaskId("");
    setSelectedId(id);
    setPage(sourcePage || 1);
    setResultsOpen(false);
  };
  async function changeLanguage(value?: "zh" | "en") {
    const next = await window.paperTree.language(value);
    document.documentElement.lang = next;
    setLanguage(next);
    setMessage(tr("就绪", "Ready"));
  }
  useEffect(() => {
    void changeLanguage();
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
  function associate(text: string, sourcePage: number, rect: SelectionRect) {
    void run(async () => {
      setResultsOpen(true);
      setTaskId("");
      await window.paperTree.expand({ paperId: paper!.id, page: sourcePage, selectedText: text, rect });
      setMessage(tr("已筛选关联论文，请选择获取", "Related papers are ready. Choose one to download."));
    });
  }
  function importFile(file: File, taskId?: string) {
    void run(async () => {
      const imported = await window.paperTree.importPaper({
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        taskId,
      });
      select(imported.id);
      setMessage(taskId ? tr("PDF 已补入，并与源论文关联", "PDF imported and linked to the source paper") : tr("PDF 已导入", "PDF imported"));
    });
  }
  function pickFile(taskId?: string) {
    importTask.current = taskId;
    input.current?.click();
  }
  return (
    <div className="app">
      <header>
        <strong className="brand" aria-label="Paper Tree">
          <svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true">
            <path d="M18 29V8m0 13L8 11m10 6L28 7" fill="none" stroke="#326c59" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Paper <span className="brand-tree">Tree</span></span>
        </strong>
        <div className="header-actions">
          <select aria-label={tr("语言", "Language")} title={tr("语言（自动保存）", "Language (saved automatically)")} value={language} disabled={busy}
            onChange={(e) => void run(() => changeLanguage(e.target.value as "zh" | "en"))}>
            <option value="zh">简体中文</option><option value="en">English</option>
          </select>
        <button className="icon-button" title={tr("模型设置", "Settings")} aria-label={tr("设置", "Settings")} disabled={busy} onClick={() => void run(async () => setSettings(await window.paperTree.settings()))}><Icon name="settings" /></button>
        </div>
      </header>
      {(settings || title !== undefined) && <div className="modal-backdrop">
        <form className="settings-dialog" role="dialog" aria-modal="true" aria-label={settings ? tr("模型设置", "Settings") : tr("修改标题", "Rename paper")}
          onKeyDown={(e) => { if (e.key === "Escape" && !busy) { setSettings(undefined); setTitle(undefined); } }}
          onSubmit={(e) => { e.preventDefault(); void run(async () => {
            if (settings) await window.paperTree.settings(settings);
            else { await window.paperTree.renamePaper(selectedId, title!); setTitle(undefined); }
          }); }}>
          <h2>{settings ? tr("模型设置", "Settings") : tr("修改标题", "Rename paper")}</h2>
          {settings ? <>
            <label>{tr("接口 URL", "API URL")}<input autoFocus required type="url" value={settings.url} placeholder="https://…/v1"
              onChange={(e) => setSettings({ ...settings, url: e.target.value })} /></label>
            <label>API Key<input type="password" autoComplete="off" value={settings.key || ""}
              placeholder={settings.hasKey ? tr("已保存，留空保持不变", "Saved; leave blank to keep") : tr("输入 API Key", "Enter API Key")} required={!settings.hasKey}
              onChange={(e) => setSettings({ ...settings, key: e.target.value })} /></label>
            <label>{tr("模型名", "Model")}<input required value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })} /></label>
            <small>{tr("配置保存在本机。保存后应用会重启，让模型与 NVIDIA Agent 使用同一配置。", "Saved on this device. Saving API settings restarts the app to apply them to the model and NVIDIA Agent.")}</small>
          </> : <label>{tr("标题", "Title")}<textarea aria-label={tr("标题", "Title")} rows={3} autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} /></label>}
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" disabled={busy} onClick={() => { setSettings(undefined); setTitle(undefined); }}>{tr("取消", "Cancel")}</button>
            <button disabled={busy}>{settings ? tr("保存并重启", "Save and restart") : tr("保存", "Save")}</button>
          </div>
        </form>
      </div>}
      <div className="workbench">
        <aside className={`paper-library ${libraryOpen ? "expanded" : ""}`} aria-label={tr("工作区", "Workspaces")}>
          <button
            aria-label={libraryOpen ? tr("收起工作区", "Collapse workspaces") : tr("展开工作区", "Expand workspaces")}
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen(!libraryOpen)}
          >
            {libraryOpen ? tr("‹ 工作区", "‹ Workspaces") : "☰"}
          </button>
          {libraryOpen && (
            <>
              <input
                type="search"
                aria-label={tr("搜索根论文", "Search root papers")}
                placeholder={tr("搜索根论文…", "Search root papers…")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button onClick={() => pickFile()} disabled={busy}>{tr("＋ 导入根论文", "＋ Import root paper")}</button>
              <nav aria-label={tr("工作区列表", "Workspace list")}>
                {filteredPapers.map((p) => (
                  <button
                    key={p.id}
                    aria-label={p.title}
                    aria-current={rootId === p.id ? "page" : undefined}
                    title={p.title}
                    onClick={() => select(p.id)}
                  >
                    <span>{p.title}</span>
                  </button>
                ))}
                {!workspace.papers.length && <small>{tr("导入论文后显示在这里", "Imported papers appear here")}</small>}
                {!!workspace.papers.length && !filteredPapers.length && <small>{tr("没有匹配的论文", "No matching papers")}</small>}
              </nav>
            </>
          )}
        </aside>
        <div
          className="layout"
          style={{ gridTemplateColumns: `minmax(200px, min(${split}%, calc(100% - 458px))) 8px minmax(450px, 1fr)` }}
        >
          <aside className="library-rail">
            <PaperTree workspace={activeWorkspace} selectedId={selectedId} onSelect={select} />
            <small>
              {activeWorkspace.papers.length} {tr("篇论文", "papers")} · {activeWorkspace.relations.length} {tr("条关联", "links")}
            </small>
          </aside>
          <div
            className="splitter"
            role="separator"
            aria-label={tr("调整关系图宽度", "Resize paper map")}
            aria-orientation="vertical"
            tabIndex={0}
            aria-valuenow={split}
            aria-valuemin={25}
            aria-valuemax={55}
            onKeyDown={(e) => {
              if (e.key.startsWith("Arrow"))
                setSplit(Math.max(25, Math.min(55, split + (e.key === "ArrowLeft" ? -2 : 2))));
            }}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                const bounds = e.currentTarget.parentElement!.getBoundingClientRect();
                setSplit(Math.max(25, Math.min(55, ((e.clientX - bounds.left) / bounds.width) * 100)));
              }
            }}
          />
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
                  <div className="title-row"><h1>{paper.title}</h1>
                    <button className="icon-button" title={tr("修改标题", "Rename paper")} aria-label={tr("修改标题", "Rename paper")} disabled={busy} onClick={() => setTitle(paper.title)}><Icon name="edit" /></button>
                    <button className="icon-button danger" title={tr("删除节点", "Delete paper")} aria-label={tr("删除节点", "Delete paper")} disabled={busy} onClick={() => void run(async () => {
                      if (await window.paperTree.deletePaper(paper.id)) {
                        const data = await window.paperTree.loadWorkspace();
                        select(relation?.sourceId || data.papers[0]?.id || "");
                        setMessage(tr("论文分支已删除", "Paper branch deleted"));
                      }
                    })}><Icon name="trash" /></button>
                  </div>
                  <small>
                    {paper.topic || tr("正在建立论文索引…", "Indexing paper…")} · {paper.referenceCount ?? "—"} {tr("条参考文献", "references")}
                  </small>
                  {relation && (
                    <div className="breadcrumb">
                      <button
                        onClick={() => select(relation.sourceId, relation.page, relation.selectedText, relation.rect)}
                      >
                        {tr("← 回到源论文", "← Back to source")} p.{relation.page}
                      </button>
                      <span>{tr("因为：", "From: ")}{relation.selectedText || relation.question}</span>
                    </div>
                  )}
                {task && (
                  <button className="results-toggle" onClick={() => setResultsOpen(!resultsOpen)}>
                    {tr("关联结果", "Related papers")} {task.candidates.length}
                  </button>
                )}
                </div>
                <PdfReader
                  key={paper.id}
                  paperId={paper.id}
                  marks={searches}
                  jump={jump}
                  onMark={(id) => {
                    const mark = searches.find((t) => t.id === id)!;
                    setTaskId(id);
                    setJump({ page: mark.page, text: mark.selectedText, rect: mark.rect, token: Date.now() });
                    setResultsOpen(true);
                    if (mark.status === "failed" && mark.rect && !busy)
                      associate(mark.selectedText, mark.page, mark.rect);
                  }}
                  page={page}
                  onPage={setPage}
                  onAssociate={associate}
                  busy={busy}
                />
              </>
            ) : (
              <div className="welcome">
                <h1>{tr("导入 PDF，开始探索论文之间的关联。", "Import a PDF to explore connected papers.")}</h1>
                <button onClick={() => pickFile()}>{tr("选择 PDF", "Choose PDF")}</button>
                <p className="hint">{tr("也可以直接拖入。导入后提取主题并缓存参考文献。", "Or drop a PDF here. Its topic and references will be indexed.")}</p>
              </div>
            )}
          </main>
          {resultsOpen && (task || busy) && (
            <aside className="research-panel" aria-label={tr("关联论文气泡", "Related papers panel")}>
              <div className="bubble-heading">
                <h2>{tr("关联论文", "Related papers")}</h2>
                <button className="icon-button" title={tr("收起关联论文", "Close related papers")} aria-label={tr("收起关联论文", "Close related papers")} onClick={() => setResultsOpen(false)}>
                  <Icon name="close" />
                </button>
              </div>
              {busy && <p role="status">{tr("正在寻找关联论文…", "Finding related papers…")}</p>}
              <div className="results">
                {task && (
                  <div className="search-context">
                    <strong>{task.selectedText}</strong>
                    <small>
                      {tr("原论文", "Source")} p.{task.page} · {tr("检索词：", "Query: ")}{task.query}
                    </small>
                    {task.plan && (
                      <p>
                        {tr("检索意图：", "Intent: ")}{task.plan.intent}
                        <br />
                        {tr("保留术语：", "Terms: ")}{task.plan.terms.join(" · ") || tr("无专有名词", "No named terms")}
                      </p>
                    )}
                    {task.skill && (
                      <details>
                        <summary>NVIDIA {task.skill.name} · {tr("研究记录", "Research log")}</summary>
                        <p>{task.skill.endpoint}</p>
                        <p style={{ whiteSpace: "pre-wrap" }}>{task.skill.report}</p>
                      </details>
                    )}
                    {task.report && <p>{task.report}</p>}
                  </div>
                )}
                {task?.status === "waiting-pdf" ? (
                  <section className="waiting">
                    <small>{tr("等待下载 · 完成后自动关联", "Waiting for download · Links automatically")}</small>
                    <h3>{task.chosen?.title}</h3>
                    <p>{tr("在获取窗口下载 PDF；仅在页面要求身份验证时登录。下载后会自动生成子节点。", "Download the PDF in the paper window. Sign in only if the publisher requests it. A child node is added after download.")}</p>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => window.paperTree.acquire(task.id, task.chosen!))}
                    >{tr("重新打开获取窗口", "Reopen paper window")}</button>
                    <button onClick={() => void run(() => window.paperTree.openExternal(task.chosen!.url))}>{tr("用系统浏览器打开", "Open in browser")}</button>
                    <p>{tr("若获取窗口不可用，可从有权访问的来源下载后手动补入。", "If the paper window is unavailable, download from an authorized source and import the PDF.")}</p>
                    <button disabled={busy} onClick={() => pickFile(task.id)}>{tr("手动补入 PDF", "Import downloaded PDF")}</button>
                  </section>
                ) : (
                  task?.candidates.map((candidate, index) => (
                    <article className="candidate" key={candidate.url + index}>
                      <small>
                        {candidate.source} · {candidate.year || tr("年份未提供", "Year unavailable")}
                      </small>
                      <h3>{candidate.title}</h3>
                      {workspace.papers.some((p) => p.sourceUrl === candidate.url) && <small>{tr("✓ 已加入论文库", "✓ In your library")}</small>}
                      <p>{candidate.authors}</p>
                      <p>{candidate.reason}</p>
                      <small>
                        {candidate.access === "open"
                          ? tr("公开全文", "Open access")
                          : candidate.access === "subscription"
                            ? tr("需要订阅权限", "Subscription required")
                            : tr("全文权限待确认", "Access not verified")}
                      </small>
                      <button
                        disabled={busy}
                        onClick={() => void run(() => window.paperTree.acquire(task!.id, candidate))}
                      >
                        {candidate.access === "open" && candidate.pdfUrl ? tr("获取 PDF 并关联", "Get PDF and link") : tr("打开页面，下载并关联", "Open page to download and link")} ↗
                      </button>
                    </article>
                  ))
                )}
                {task?.status === "failed" && <p role="alert">{task.error}</p>}
                {task?.status === "choosing" && !task.candidates.length && (
                  <p>{tr("没有相关候选，请选中更完整的方法名或引用。", "No relevant papers found. Select a complete method name or citation.")}</p>
                )}
              </div>
            </aside>
          )}
        </div>
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
