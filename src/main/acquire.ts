import { app, BrowserWindow, session } from "electron";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tr, type Candidate, type Update } from "../shared/types";
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
    notify({ message: tr("正在下载 PDF，完成后自动加入阅读树…", "Downloading PDF; it will be added to the reading tree…") });
    item.once("done", async (_event, state) => {
      try {
        if (state !== "completed")
          throw new Error(tr("下载中断，请在获取窗口重试 PDF 下载；公开论文无需机构登录。", "Download interrupted. Retry in the paper window; open-access papers do not require institutional sign-in."));
        const paper = await flow.importPaper({
          taskId: owner.taskId,
          fileName: item.getFilename(),
          bytes: new Uint8Array(await readFile(path)),
        });
        notify({ message: tr("PDF 已下载，并与源论文建立关联", "PDF downloaded and linked to the source paper"), paperId: paper.id });
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
    if (downloading) throw new Error(tr("请等待当前 PDF 下载完成。", "Please wait for the current PDF download."));
    for (const url of [candidate.url, candidate.pdfUrl].filter(Boolean) as string[])
      if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error(tr("论文地址必须是网页链接。", "The paper URL must be a web link."));
    await flow.chooseCandidate(taskId, candidate);
    current?.window.close();
    const window = new BrowserWindow({
      width: 1050,
      height: 800,
      title: tr("获取论文 · 下载后自动关联", "Get paper · Automatically linked after download"),
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
    notify({ message: tr("在获取窗口获取 PDF；公开论文自动下载，受限全文需登录，完成后自动关联", "Get the PDF in the paper window. Open-access PDFs download automatically; restricted papers may require sign-in.") });
    try {
      await window.loadURL(candidate.url);
      if (candidate.access === "open" && candidate.pdfUrl && !window.isDestroyed())
        window.webContents.downloadURL(candidate.pdfUrl);
    } catch (error) {
      if (!String(error).includes("ERR_ABORTED")) notify({ message: tr(`页面打开失败，可手动补入 PDF：${String(error)}`, `Could not open page; import the PDF manually: ${String(error)}`) });
    }
  };
}
