import { contextBridge, ipcRenderer } from "electron";
import type { PaperTreeAPI, Update } from "./shared/types";
const api: PaperTreeAPI = {
  language: (value) => ipcRenderer.invoke("language", value),
  settings: (value) => ipcRenderer.invoke("settings", value),
  renamePaper: (id, title) => ipcRenderer.invoke("paper:rename", id, title),
  deletePaper: (id) => ipcRenderer.invoke("paper:delete", id),
  deleteMark: (id) => ipcRenderer.invoke("mark:delete", id),
  recognize: (image) => ipcRenderer.invoke("paper:recognize", image),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  importPaper: (input) => ipcRenderer.invoke("paper:import", input),
  readPdf: (id) => ipcRenderer.invoke("paper:read", id),
  expand: (input) => ipcRenderer.invoke("paper:expand", input),
  acquire: (id, candidate, localPdf) => ipcRenderer.invoke("paper:acquire", id, candidate, localPdf),
  openExternal: (url) => ipcRenderer.invoke("paper:external", url),
  onUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: Update) => callback(update);
    ipcRenderer.on("workspace:update", listener);
    return () => ipcRenderer.removeListener("workspace:update", listener);
  },
};
contextBridge.exposeInMainWorld("paperTree", api);
