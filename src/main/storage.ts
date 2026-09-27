import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tr, type PaperIndex, type Workspace } from "../shared/types";
// SQLite stores the reading tree and the extracted PDF index.
export function createStorage(directory: string) {
  const workspacePath = join(directory, "workspace.json");
  let workspace: Workspace = { papers: [], relations: [], tasks: [] };
  let db: DatabaseSync;
  return {
    async initialize() {
      await mkdir(join(directory, "papers"), { recursive: true });
      try {
        workspace = JSON.parse(await readFile(workspacePath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      db = new DatabaseSync(join(directory, "workspace.sqlite"));
      db.exec(
        "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, json TEXT); CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT); CREATE TABLE IF NOT EXISTS paper_index (id TEXT PRIMARY KEY, json TEXT)",
      );
      const row = db.prepare("SELECT json FROM state WHERE id=1").get();
      if (row) workspace = JSON.parse(row.json as string);
      // A closed app cannot keep a request running. Keep the context for a retry.
      for (const task of workspace.tasks) {
        if (task.status === "researching") {
          task.status = "failed";
          task.error = tr("上次搜索被中断，请重新拓展。", "The previous search was interrupted. Please retry.");
        }
      }
    },
    get: () => workspace,
    settings(value?: object) {
      if (value) db.prepare("INSERT OR REPLACE INTO settings VALUES (1, ?)").run(JSON.stringify(value));
      const row = db.prepare("SELECT json FROM settings WHERE id=1").get();
      return row ? JSON.parse(row.json as string) : undefined;
    },
    async rename(id: string, title: string) {
      const paper = workspace.papers.find((p) => p.id === id);
      if (!paper || !title.trim()) throw new Error(tr("请输入论文标题。", "Enter a paper title."));
      Object.assign(paper, { title: title.trim(), renamed: true });
      await this.save();
    },
    branch(id: string) {
      const ids = new Set(workspace.papers.some((p) => p.id === id) ? [id] : []);
      for (const source of ids)
        for (const edge of workspace.relations) if (edge.sourceId === source) ids.add(edge.targetId);
      return ids;
    },
    async remove(id: string) {
      const ids = this.branch(id);
      workspace.papers = workspace.papers.filter((p) => !ids.has(p.id));
      workspace.relations = workspace.relations.filter((r) => !ids.has(r.sourceId) && !ids.has(r.targetId));
      workspace.tasks = workspace.tasks.filter((t) => !ids.has(t.paperId));
      for (const task of workspace.tasks)
        if (task.status === "completed" && !workspace.relations.some((r) =>
          r.sourceId === task.paperId && r.page === task.page && r.selectedText === task.selectedText)) {
          task.status = "choosing";
          delete task.chosen;
        }
      await this.save();
      for (const removed of ids) {
        db.prepare("DELETE FROM paper_index WHERE id=?").run(removed);
        await rm(join(directory, "papers", `${removed}.pdf`), { force: true });
      }
    },
    async save() {
      db.prepare("INSERT OR REPLACE INTO state VALUES (1, ?)").run(JSON.stringify(workspace));
    },
    index(id: string): PaperIndex | undefined {
      const row = db.prepare("SELECT json FROM paper_index WHERE id=?").get(id);
      return row ? JSON.parse(row.json as string) : undefined;
    },
    cache(id: string, index: PaperIndex) {
      db.prepare("INSERT OR REPLACE INTO paper_index VALUES (?, ?)").run(id, JSON.stringify(index));
    },
    async writePdf(id: string, bytes: Uint8Array) {
      await writeFile(join(directory, "papers", `${id}.pdf`), bytes);
    },
    async readPdf(id: string) {
      if (!workspace.papers.some((paper) => paper.id === id)) throw new Error(tr("找不到这篇论文。", "Paper not found."));
      return new Uint8Array(await readFile(join(directory, "papers", `${id}.pdf`)));
    },
  };
}
export type Storage = ReturnType<typeof createStorage>;
