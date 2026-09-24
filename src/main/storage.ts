import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PaperIndex, Workspace } from "../shared/types";

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
        "CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT); CREATE TABLE IF NOT EXISTS paper_index (id TEXT PRIMARY KEY, json TEXT)",
      );
      const row = db.prepare("SELECT json FROM state WHERE id=1").get();
      if (row) workspace = JSON.parse(row.json as string);
      // A closed app cannot keep a request running. Keep the context for a retry.
      for (const task of workspace.tasks) {
        if (task.status === "researching") {
          task.status = "failed";
          task.error = "上次搜索被中断，请重新拓展。";
        }
      }
    },
    get: () => workspace,
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
      if (!workspace.papers.some((paper) => paper.id === id)) throw new Error("找不到这篇论文。");
      return new Uint8Array(await readFile(join(directory, "papers", `${id}.pdf`)));
    },
  };
}
export type Storage = ReturnType<typeof createStorage>;
