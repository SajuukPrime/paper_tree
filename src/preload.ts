import { contextBridge, ipcRenderer } from "electron";
import type { PaperTreeAPI, Update } from "./shared/types";
const api: PaperTreeAPI = {
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  importPaper: (input) => ipcRenderer.invoke("paper:import", input),
  readPdf: (id) => ipcRenderer.invoke("paper:read", id),
  expand: (input) => ipcRenderer.invoke("paper:expand", input),
  acquire: (id, candidate) => ipcRenderer.invoke("paper:acquire", id, candidate),
  openExternal: (url) => ipcRenderer.invoke("paper:external", url),
  onUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: Update) => callback(update);
    ipcRenderer.on("workspace:update", listener);
    return () => ipcRenderer.removeListener("workspace:update", listener);
  },
};
contextBridge.exposeInMainWorld("paperTree", api);
