import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createStorage } from "./storage";
import { createWorkflow } from "./workflow";
import { createAcquirer } from "./acquire";
import type { Candidate, ExpandInput, ImportInput, Update } from "../shared/types";

config({ path: join(process.cwd(), ".env"), quiet: true });
if (process.env.PAPER_TREE_DATA_DIR) app.setPath("userData", process.env.PAPER_TREE_DATA_DIR);
const directory = fileURLToPath(new URL(".", import.meta.url));
app.whenReady().then(async () => {
  const storage = createStorage(process.env.PAPER_TREE_DATA_DIR || join(app.getPath("userData"), "workspace"));
  await storage.initialize();
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
  ipcMain.handle("workspace:load", () => storage.get());
  ipcMain.handle("paper:import", (_e, input: ImportInput) => flow.importPaper(input));
  ipcMain.handle("paper:read", (_e, id: string) => {
    void flow
      .ensureIndex(id)
      .then(() => notify({ message: "论文主题与参考文献已缓存" }))
      .catch((e) => notify({ message: `索引未完成：${String(e)}` }));
    return storage.readPdf(id);
  });
  ipcMain.handle("paper:expand", (_e, input: ExpandInput) => flow.expand(input));
  ipcMain.handle("paper:acquire", (_e, id: string, candidate: Candidate) => acquire(id, candidate));
  ipcMain.handle("paper:external", (_e, url: string) => {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error("仅支持网页链接");
    return shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => app.quit());
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(directory, "../renderer/index.html"));
});
app.on("window-all-closed", () => app.quit());
