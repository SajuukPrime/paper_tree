import { app, BrowserWindow, session } from "electron";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Candidate, Update } from "../shared/types";
import type { Workflow } from "./workflow";

// A real browser session owns the login and download; the task owns the new branch.
export function createAcquirer(flow: Workflow, notify: (update: Update) => void) {
  const browserSession = session.fromPartition("persist:paper-acquisition");
  let current: { window: BrowserWindow; taskId: string } | undefined;
  let downloading = false;
  browserSession.on("will-download", (_event, item, contents) => {
    if (!current || contents !== current.window.webContents || downloading) {
      item.cancel();
      return;
    }
    const owner = current;
    downloading = true;
    const path = join(app.getPath("temp"), `paper-tree-${randomUUID()}.pdf`);
    item.setSavePath(path);
    notify({ message: "正在下载 PDF，完成后自动加入阅读树…" });
    item.once("done", async (_event, state) => {
      try {
        if (state !== "completed")
          throw new Error("下载未完成；可能是网络或全文权限问题，请在获取窗口检查机构登录后重试。");
        const paper = await flow.importPaper({
          taskId: owner.taskId,
          fileName: item.getFilename(),
          bytes: new Uint8Array(await readFile(path)),
        });
        notify({ message: "PDF 已下载，并与源论文建立关联", paperId: paper.id });
        if (!owner.window.isDestroyed()) owner.window.close();
      } catch (error) {
        notify({ message: String(error) });
      } finally {
        downloading = false;
        await rm(path, { force: true });
      }
    });
  });
  return async (taskId: string, candidate: Candidate) => {
    if (downloading) throw new Error("请等待当前 PDF 下载完成。");
    for (const url of [candidate.url, candidate.pdfUrl].filter(Boolean) as string[])
      if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("论文地址必须是网页链接。");
    await flow.chooseCandidate(taskId, candidate);
    current?.window.close();
    const window = new BrowserWindow({
      width: 1050,
      height: 800,
      title: "获取论文 · 下载后自动关联",
      webPreferences: { session: browserSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    current = { window, taskId };
    window.on("closed", () => {
      if (current?.window === window) current = undefined;
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void window.loadURL(url).catch(() => {});
      return { action: "deny" };
    });
    notify({ message: "在获取窗口登录并下载 PDF；下载完成会自动生成关联节点" });
    try {
      await window.loadURL(candidate.url);
      if (candidate.access === "open" && candidate.pdfUrl && !window.isDestroyed())
        window.webContents.downloadURL(candidate.pdfUrl);
    } catch (error) {
      if (!String(error).includes("ERR_ABORTED")) notify({ message: `页面打开失败，可手动补入 PDF：${String(error)}` });
    }
  };
}
