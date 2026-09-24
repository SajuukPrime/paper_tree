export type PaperIndex = { title: string; topic: string; doi: string; pages: string[]; references: string[] };
export type Candidate = {
  title: string;
  url: string;
  pdfUrl?: string;
  authors: string;
  doi?: string;
  abstract?: string;
  access?: "open" | "unknown" | "subscription";
  reason?: string;
  year?: number;
  source?: string;
};
export type Paper = {
  id: string;
  title: string;
  fileName: string;
  sourceUrl?: string;
  topic?: string;
  referenceCount?: number;
};
export type ExpandInput = { paperId: string; selectedText: string; question?: string; page: number };
export type Relation = Omit<ExpandInput, "paperId"> & { id: string; sourceId: string; targetId: string };
export type Task = ExpandInput & {
  id: string;
  status: "researching" | "choosing" | "waiting-pdf" | "completed" | "failed";
  query: string;
  candidates: Candidate[];
  chosen?: Candidate;
  error?: string;
  report?: string;
};
export type Workspace = { papers: Paper[]; relations: Relation[]; tasks: Task[] };
export type ImportInput = { fileName: string; bytes: Uint8Array; taskId?: string };
export type Update = { message: string; paperId?: string };
export type PaperTreeAPI = {
  loadWorkspace(): Promise<Workspace>;
  importPaper(input: ImportInput): Promise<Paper>;
  readPdf(id: string): Promise<Uint8Array>;
  expand(input: ExpandInput): Promise<Task>;
  openExternal(url: string): Promise<void>;
  acquire(taskId: string, candidate: Candidate): Promise<void>;
  onUpdate(callback: (update: Update) => void): () => void;
};
declare global {
  interface Window {
    paperTree: PaperTreeAPI;
  }
}
