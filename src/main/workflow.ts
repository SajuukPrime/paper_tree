import { randomUUID } from "node:crypto";
import type { Candidate, ExpandInput, ImportInput, Paper, Task } from "../shared/types";
import type { Storage } from "./storage";
import { indexPdf } from "./model";
import { research } from "./research";

// Product loop: question → candidates → download → paper + relation.
export function createWorkflow(storage: Storage, progress: (message: string) => void) {
  const indexing = new Map<string, Promise<import("../shared/types").PaperIndex>>();
  async function buildIndex(id: string) {
    let index = storage.index(id);
    if (!index) {
      progress("提取论文主题和参考文献，保存到 SQLite…");
      index = await indexPdf(await storage.readPdf(id));
      storage.cache(id, index);
      Object.assign(
        storage.get().papers.find((p) => p.id === id)!,
        { title: index.title, topic: index.topic, referenceCount: index.references.length },
      );
      await storage.save();
    }
    return index;
  }
  function ensureIndex(id: string) {
    if (!indexing.has(id))
      indexing.set(
        id,
        buildIndex(id).finally(() => indexing.delete(id)),
      );
    return indexing.get(id)!;
  }
  return {
    ensureIndex,
    async importPaper(input: ImportInput) {
      if (!Buffer.from(input.bytes).subarray(0, 1024).includes(Buffer.from("%PDF-")))
        throw new Error("下载内容不是 PDF，请在论文页面点击 PDF 下载。");
      const task = storage.get().tasks.find((t) => t.id === input.taskId);
      if (input.taskId && (!task || task.status !== "waiting-pdf")) throw new Error("该任务不在等待 PDF。");
      const paper: Paper = {
        id: randomUUID(),
        fileName: input.fileName,
        title: task?.chosen?.title || input.fileName.replace(/\.pdf$/i, ""),
        sourceUrl: task?.chosen?.url,
      };
      await storage.writePdf(paper.id, input.bytes);
      storage.get().papers.push(paper);
      if (task) {
        storage.get().relations.push({
          id: randomUUID(),
          sourceId: task.paperId,
          targetId: paper.id,
          question: task.question,
          selectedText: task.selectedText,
          page: task.page,
        });
        task.status = "completed";
      }
      await storage.save();
      return paper;
    },
    async expand(input: ExpandInput) {
      const parent = storage.get().papers.find((p) => p.id === input.paperId);
      if (!parent) throw new Error("找不到源论文。");
      const task: Task = { ...input, id: randomUUID(), status: "researching", query: "", candidates: [] };
      storage.get().tasks.push(task);
      await storage.save();
      try {
        Object.assign(task, await research(input, await ensureIndex(parent.id), progress));
        task.status = "choosing";
      } catch (error) {
        task.status = "failed";
        task.error = String(error);
        throw error;
      } finally {
        await storage.save();
      }
      return task;
    },
    async chooseCandidate(taskId: string, candidate: Candidate) {
      const task = storage.get().tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("找不到待处理任务。");
      task.chosen = candidate;
      task.status = "waiting-pdf";
      await storage.save();
    },
  };
}
export type Workflow = ReturnType<typeof createWorkflow>;
