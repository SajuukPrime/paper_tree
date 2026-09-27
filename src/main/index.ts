import { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createStorage } from "./storage";
import { createWorkflow } from "./workflow";
import { startSkills, stopSkills } from "./skills";
import { createAcquirer } from "./acquire";
import { tr, type Candidate, type ExpandInput, type ImportInput, type Update, type ModelSettings } from "../shared/types";
config({ path: join(process.cwd(), ".env"), quiet: true });
if (process.env.PAPER_TREE_DATA_DIR) app.setPath("userData", process.env.PAPER_TREE_DATA_DIR);
const directory = fileURLToPath(new URL(".", import.meta.url));
app.whenReady().then(async () => {
  const storage = createStorage(process.env.PAPER_TREE_DATA_DIR || join(app.getPath("userData"), "workspace"));
  await storage.initialize();
  let settings = storage.settings();
  function applySettings() {
    process.env.QWEN_BASE_URL = settings.url;
    process.env.QWEN_MODEL = settings.model;
    process.env.QWEN_API_KEY = settings.secret ? safeStorage.decryptString(Buffer.from(settings.secret, "base64")) : "";
  }
  if (!settings) {
    settings = { url: process.env.QWEN_BASE_URL || "", model: process.env.QWEN_MODEL || "qwen-flash",
      secret: process.env.QWEN_API_KEY ? safeStorage.encryptString(process.env.QWEN_API_KEY).toString("base64") : "" };
    storage.settings(settings);
  }
  applySettings();
  process.env.PAPER_TREE_LANGUAGE = settings.language || "zh";
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1050,
    minHeight: 700,
    title: "Paper Tree",
    backgroundColor: "#f5f6f2",
    webPreferences: {
      preload: join(directory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const notify = (update: Update) => {
    if (!window.isDestroyed()) window.webContents.send("workspace:update", update);
  };
  const flow = createWorkflow(storage, (message) => notify({ message }));
  const acquire = createAcquirer(flow, notify);
  ipcMain.handle("language", (_e, value?: "zh" | "en") => {
    if (value === "zh" || value === "en") {
      settings.language = value;
      process.env.PAPER_TREE_LANGUAGE = value;
      storage.settings(settings);
    }
    return settings.language || "zh";
  });
  ipcMain.handle("settings", async (_e, value?: ModelSettings) => {
    if (value) {
      const url = new URL(value.url.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !value.model.trim())
        throw new Error(tr("请输入有效的接口 URL 和模型名。", "Enter a valid API URL and model name."));
      settings = { language: settings.language, url: url.href.replace(/\/$/, ""), model: value.model.trim(),
        secret: value.key?.trim() ? safeStorage.encryptString(value.key.trim()).toString("base64") : settings.secret };
      storage.settings(settings);
      // Restart applies the same configuration to the model client and the AI-Q child process.
      await stopSkills();
      app.relaunch();
      app.quit();
    }
    return { url: settings.url, model: settings.model, hasKey: !!settings.secret };
  });
  ipcMain.handle("paper:rename", (_e, id: string, title: string) => storage.rename(id, title));
  ipcMain.handle("paper:delete", async (_e, id: string) => {
    const count = storage.branch(id).size;
    if (!count) return false;
    const { response } = await dialog.showMessageBox(window, {
      type: "warning", buttons: [tr("取消", "Cancel"), tr("删除", "Delete")], defaultId: 0, cancelId: 0,
      message: count > 1 ? tr(`删除这篇论文及其 ${count - 1} 篇后续论文？`, `Delete this paper and its ${count - 1} descendants?`) : tr("删除这篇论文？", "Delete this paper?"),
      detail: tr("这些节点、关联和本地 PDF 副本将被删除。原始导入文件不受影响。", "These nodes, links and local PDF copies will be deleted. Original imported files are unaffected."),
    });
    if (response !== 1) return false;
    await storage.remove(id);
    return true;
  });
  ipcMain.handle("workspace:load", () => storage.get());
  ipcMain.handle("paper:import", (_e, input: ImportInput) => flow.importPaper(input));
  ipcMain.handle("paper:read", (_e, id: string) => {
    void flow
      .ensureIndex(id)
      .then(() => notify({ message: tr("论文主题与参考文献已缓存", "Paper topic and references indexed") }))
      .catch((e) => notify({ message: tr(`索引未完成：${String(e)}`, `Indexing incomplete: ${String(e)}`) }));
    return storage.readPdf(id);
  });
  ipcMain.handle("paper:expand", (_e, input: ExpandInput) => flow.expand(input));
  ipcMain.handle("paper:acquire", (_e, id: string, candidate: Candidate) => acquire(id, candidate));
  ipcMain.handle("paper:external", (_e, url: string) => {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error(tr("仅支持网页链接", "Only web links are supported"));
    return shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => app.quit());
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(directory, "../renderer/index.html"));
  void startSkills()
    .then(() => notify({ message: tr("NVIDIA AI-Q 已就绪", "NVIDIA AI-Q is ready") }))
    .catch((e) => notify({ message: String(e) }));
});
app.on("before-quit", stopSkills);
app.on("window-all-closed", () => app.quit());
