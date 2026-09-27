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
  renamed?: boolean;
  fileName: string;
  sourceUrl?: string;
  topic?: string;
  referenceCount?: number;
};
export type SelectionRect = { x: number; y: number; w: number; h: number };
export type ExpandInput = {
  paperId: string;
  selectedText: string;
  question?: string;
  page: number;
  rect?: SelectionRect;
};
export type Relation = Omit<ExpandInput, "paperId"> & { id: string; sourceId: string; targetId: string };
export type SearchPlan = {
  mode: "paper" | "concept";
  intent: string;
  terms: string[];
  queries: { text: string; kind: "title" | "keywords" }[];
  reference?: string;
};
export type SkillRun = {
  name: "aiq-research";
  endpoint: string;
  revision: string;
  startedAt: string;
  report: string;
  jobId?: string;
};
export type Task = ExpandInput & {
  plan?: SearchPlan;
  skill?: SkillRun;
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
export type ModelSettings = { url: string; model: string; key?: string; hasKey?: boolean };
export type PaperTreeAPI = {
  language(value?: "zh" | "en"): Promise<"zh" | "en">;
  settings(value?: ModelSettings): Promise<ModelSettings>;
  renamePaper(id: string, title: string): Promise<void>;
  deletePaper(id: string): Promise<boolean>;
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

// UI text stays next to its translation; paper content is never translated here.
export function tr(zh: string, en: string): string {
  const language = typeof document === "undefined" ? process.env.PAPER_TREE_LANGUAGE : document.documentElement.lang;
  return language === "en" ? en : zh;
}
