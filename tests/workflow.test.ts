import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorage } from "../src/main/storage";
import { createWorkflow } from "../src/main/workflow";

test("downloaded child keeps its question, parent and PDF across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-tree-"));
  try {
    const storage = createStorage(directory);
    await storage.initialize();
    const flow = createWorkflow(storage, () => {});
    const input = {
      fileName: "root.pdf",
      bytes: new Uint8Array(Buffer.from("%PDF-1.4 test fixture")),
    };
    const root = await flow.importPaper(input);
    storage.get().tasks.push({
      id: "task",
      paperId: root.id,
      page: 1,
      selectedText: "contrastive learning",
      rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
      question: "How does it work?",
      status: "choosing",
      query: "SimCLR",
      candidates: [],
    });
    await flow.chooseCandidate("task", {
      title: "Child paper",
      authors: "Example",
      url: "https://example.com/paper",
    });
    const child = await flow.importPaper({
      ...input,
      fileName: "child.pdf",
      taskId: "task",
    });
    const reopened = createStorage(directory);
    await reopened.initialize();
    assert.equal(reopened.get().papers.length, 2);
    assert.equal(reopened.get().relations[0].sourceId, root.id);
    assert.equal(reopened.get().relations[0].targetId, child.id);
    assert.equal(reopened.get().relations[0].question, "How does it work?");
    assert.equal(reopened.get().tasks[0].status, "completed");
    assert.deepEqual(reopened.get().relations[0].rect, { x: 0.1, y: 0.2, w: 0.3, h: 0.04 });
    assert.deepEqual(reopened.get().tasks[0].rect, reopened.get().relations[0].rect);
    assert.deepEqual(await reopened.readPdf(child.id), input.bytes);
    await assert.rejects(flow.importPaper({ ...input, taskId: "task" }), /等待 PDF/);
    // The same question can lead to another sibling without searching again.
    await flow.chooseCandidate("task", { title: "Sibling", authors: "Example", url: "https://example.com/second" });
    const sibling = await flow.importPaper({ ...input, fileName: "sibling.pdf", taskId: "task" });
    assert.equal(storage.get().relations[1].sourceId, root.id);
    assert.equal(storage.get().relations[1].targetId, sibling.id);
    assert.equal(storage.get().relations[1].question, "How does it work?");
    await storage.rename(root.id, "My reading title");
    storage.cache(child.id, { title: "Original", topic: "", doi: "", pages: [], references: [] });
    storage.get().tasks.push({ ...storage.get().tasks[0], id: "nested", paperId: child.id, status: "waiting-pdf" });
    const grandchild = await flow.importPaper({ ...input, taskId: "nested" });
    assert.equal(storage.branch(child.id).size, 2);
    await storage.remove(child.id);
    assert.deepEqual(storage.get().papers.map((p) => p.id), [root.id, sibling.id]);
    assert.equal(storage.get().tasks.length, 1);
    assert.equal(storage.get().tasks[0].status, "completed");
    assert.equal(storage.index(child.id), undefined);
    await assert.rejects(readFile(join(directory, "papers", `${grandchild.id}.pdf`)), /ENOENT/);
    await storage.remove(sibling.id);
    assert.equal(storage.get().tasks[0].status, "choosing");
    const afterDelete = createStorage(directory);
    await afterDelete.initialize();
    assert.equal(afterDelete.get().papers[0].title, "My reading title");
    assert.equal(afterDelete.get().papers[0].renamed, true);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("SQLite migrates the reading tree and persists reference cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-tree-index-"));
  await writeFile(
    join(directory, "workspace.json"),
    JSON.stringify({ papers: [{ id: "old", title: "Old", fileName: "old.pdf" }], relations: [], tasks: [] }),
  );
  const storage = createStorage(directory);
  await storage.initialize();
  storage.cache("old", {
    title: "Old",
    topic: "Vision",
    doi: "",
    pages: ["HorNet [31]"],
    references: ["[31] HorNet arXiv:2207.14284"],
  });
  await storage.save();
  const reopened = createStorage(directory);
  await reopened.initialize();
  assert.equal(reopened.get().papers[0].id, "old");
  assert.equal(reopened.index("old")?.references[0], "[31] HorNet arXiv:2207.14284");
  await rm(directory, { recursive: true });
});

test("IEEE metadata distinguishes open, subscription and unknown access", async () => {
  const { searchIEEE } = await import("../src/main/research");
  const original = globalThis.fetch;
  const key = process.env.IEEE_API_KEY;
  process.env.IEEE_API_KEY = "test-only";
  globalThis.fetch = async (url) => {
    assert.equal(new URL(String(url)).searchParams.get("apikey"), "test-only");
    return new Response(
      JSON.stringify({
        articles: ["Open Access", "Locked", "Other"].map((accessType) => ({
          title: "Fixture",
          abstract_url: "https://example.com",
          accessType,
        })),
      }),
    );
  };
  try {
    assert.deepEqual(
      (await searchIEEE("fixture")).map((c) => c.access),
      ["open", "subscription", "unknown"],
    );
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.IEEE_API_KEY;
    else process.env.IEEE_API_KEY = key;
  }
});

test("a named concept beats an unrelated nearby citation", async () => {
  const { referenceFor } = await import("../src/main/research");
  const index = {
    title: "Root",
    topic: "Detection",
    doi: "",
    pages: ["SSD differs from another method [18]."],
    references: [
      "[10] “PCB process defect detection”",
      "[18] “PCB defect detection”",
      "[41] “SSD: Single shot MultiBox detector,” arXiv:1512.02325",
    ],
  };
  assert.match(referenceFor({ paperId: "root", page: 1, selectedText: "SSD" }, index)!, /^\[41\]/);
  assert.match(referenceFor({ paperId: "root", page: 1, selectedText: "[18]" }, index)!, /^\[18\]/);
  assert.match(referenceFor({ paperId: "root", page: 1, selectedText: "another method [18]" }, index)!, /^\[18\]/);
});

test("search planning preserves names, grounds citations and uses keyword search for mechanisms", async (t) => {
  const { planSearch, research } = await import("../src/main/research");
  const oldKey = process.env.QWEN_API_KEY,
    oldBase = process.env.QWEN_BASE_URL;
  process.env.QWEN_API_KEY = "test-only";
  process.env.QWEN_BASE_URL = "https://model.example";
  let answer: object = {},
    captured: any,
    searched: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    const address = new URL(String(url));
    if (address.hostname === "model.example") {
      const messages = JSON.parse(init.body).messages;
      captured = JSON.parse(messages[1].content);
      const value = captured.candidates ? { keep: captured.candidates.map((c: any) => ({ index: c.index, score: 80, reason: "解释递归门控机制" })) } : answer;
      return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
    }
    searched.push(address);
    if (address.hostname === "api.openalex.org") return Response.json({ results: [] });
    if (address.hostname === "api.crossref.org")
      return Response.json({
        message: {
          items: [{ type: "journal-article", title: ["Mechanism paper"], URL: "https://example.com/mechanism" }],
        },
      });
    return Response.json({ articles: [] });
  });
  const index = {
    title: "Root",
    topic: "PCB detection",
    doi: "",
    pages: [],
    references: [
      "[31] “HorNet: Efficient high-order spatial interactions with recursive gated convolutions,” arXiv:2207.14284.",
      "[32] “Deep Residual Learning for Image Recognition”",
    ],
  };
  const input = {
    paperId: "root",
    page: 1,
    selectedText: "HorNet uses recursive gated convolutions to model spatial interactions.",
  };
  try {
    answer = {
      intent: "理解递归门控机制",
      terms: ["recursive gated convolutions", "invented term"],
      queries: ["recursive gated convolutions mechanism"],
      referenceNumber: 999,
    };
    const plan = await planSearch(input, { ...index, references: [] });
    assert(plan.terms.includes("HorNet"));
    assert(!plan.terms.includes("invented term"));
    assert(plan.queries[0].text.includes("HorNet"));
    assert.equal(plan.queries[0].kind, "keywords");
    assert.equal(plan.reference, undefined);
    assert.equal(captured.selected, input.selectedText);
    assert.equal(captured.topic, "PCB detection");

    answer = {
      mode: "paper",
      intent: "找方法原论文",
      terms: ["HorNet"],
      queries: ["HorNet original method"],
      referenceNumber: 31,
    };
    const exact = await planSearch({ ...input, selectedText: "HorNet" }, index);
    assert.deepEqual(exact.queries, [{ text: "arXiv:2207.14284", kind: "title" }, { text: "HorNet", kind: "keywords" }]);
    const citation = await planSearch({ ...input, selectedText: "[32]" }, { ...index, pages: ["[32]"] });
    assert.equal(citation.reference, index.references[1]);

    answer = {
      intent: "比较两种方法",
      terms: ["HorNet", "ResNet"],
      queries: ["HorNet comparison"],
      referenceNumber: 31,
    };
    const comparison = await planSearch(
      { ...input, selectedText: "HorNet and ResNet [31]" },
      { ...index, pages: ["HorNet and ResNet [31]"] },
    );
    assert.equal(comparison.queries[0].kind, "keywords");
    assert(comparison.queries[0].text.includes("ResNet"));

    answer = {
      intent: "理解递归门控机制",
      terms: ["recursive gated convolutions"],
      queries: ["recursive gated convolutions", "high order spatial interactions"],
    };
    searched = [];
    const result = await research(
      input,
      { ...index, references: [] },
      () => {},
      async () => ({
        name: "aiq-research",
        endpoint: "http://127.0.0.1",
        revision: "fixture",
        startedAt: "fixture",
        report: "Fixture research evidence",
      }),
    );
    assert.match(result.plan.intent, /理解递归门控机制/);
    assert.equal(result.candidates.length, 1);
    const arxiv = searched.filter((u) => u.hostname === "api.openalex.org");
    assert.equal(arxiv.length, 2);
    assert(arxiv.every((u) => !!u.searchParams.get("search")));
    assert(searched.every((u) => !u.href.includes(encodeURIComponent(input.selectedText))));
    assert.deepEqual(captured.terms, result.plan.terms);
    assert(result.skill);
    assert.equal(captured.researchEvidence, result.skill.report);
    const fallback = await research(input, { ...index, references: [] }, () => {}, async () => { throw new Error("Skill unavailable"); });
    assert.equal(fallback.skill, undefined);
    assert.equal(fallback.candidates.length, 1);
    assert.match(fallback.report, /AI-Q/);

    answer = { mode: "paper", intent: "查找 FPN", terms: [], queries: ["Feature Pyramid Network"] };
    const fpn = await planSearch(
      { ...input, selectedText: "e.g. Feature Pyramid Network" },
      {
        ...index,
        title: "CARAFE",
        references: ["[21] “Feature Pyramid Networks for Object Detection”", "[9] “Unrelated method”"],
      },
    );
    assert(fpn.terms.includes("Feature Pyramid Network"));
    assert.deepEqual(captured.references, ["[21] “Feature Pyramid Networks for Object Detection”", "[9] “Unrelated method”"]);
    assert.equal(fpn.queries[0].text, "Feature Pyramid Networks for Object Detection");
    searched = [];
    const unmatched = await research(
      { ...input, selectedText: "Feature Pyramid Network" },
      {
        ...index,
        references: ["[21] “Feature Pyramid Networks for Object Detection”"],
      },
      () => {},
      async () => result.skill!,
    );
    assert.equal(unmatched.candidates.length, 1, "related papers remain eligible alongside the exact citation");
    assert(searched.some((u) => u.searchParams.has("query.bibliographic")));
    assert(searched.some((u) => u.searchParams.has("query.title")));

    answer = { mode: "paper", intent: "查找 ConvNeXt 原论文", terms: ["ConvNeXt"], queries: ["ConvNeXt"] };
    const alias = await planSearch(
      { ...input, selectedText: "and ConvNeXt" },
      {
        ...index,
        pages: ["and ConvNeXt", "ConvNeXt [43] thoroughly analyzes"],
        references: ["[43] Zhuang Liu et al. A convnet for the 2020s. CVPR , 2022."],
      },
    );
    assert.equal(alias.queries[0].text, "A convnet for the 2020s");

    answer = { mode: "paper", intent: "Find ViT", terms: ["Vision Transformers", "ViTs"], queries: ["Vision Transformers"], referenceNumber: 20 };
    const vitReference = "[20] Alexey Dosovitskiy et al. An image is worth 16x16 words: Transformers for image recognition at scale. In ICLR , 2021.";
    const vit = await planSearch({ ...input, selectedText: "introduction of Vision Transformers (ViTs)," }, { ...index, references: [vitReference] });
    assert.equal(vit.reference, vitReference);
    assert.equal(vit.queries[0].text, "An image is worth 16x16 words: Transformers for image recognition at scale");
    assert.equal(vit.queries[0].kind, "title");
    assert.equal(vit.queries[1].kind, "keywords");
    answer = { intent: "invalid", queries: [] };
    await assert.rejects(planSearch(input, index), /有效检索计划/);
  } finally {
    if (oldKey === undefined) delete process.env.QWEN_API_KEY;
    else process.env.QWEN_API_KEY = oldKey;
    if (oldBase === undefined) delete process.env.QWEN_BASE_URL;
    else process.env.QWEN_BASE_URL = oldBase;
  }
});

test("search excludes the current paper but retains multiple related titles", async (t) => {
  const { research } = await import("../src/main/research");
  const saved = { ...process.env };
  Object.assign(process.env, { QWEN_BASE_URL: "https://model.example", QWEN_API_KEY: "fixture" });
  const titles = ["HMC", "HorNet original", "HorNet extension", "Spatial interaction study", ...Array.from({ length: 6 }, (_, i) => `Related study ${i}`), "Verified DOI study"];
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    const host = new URL(String(url)).hostname;
    if (host === "model.example") {
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      const value = data.candidates
        ? { keep: data.candidates.map((c: any) => ({ index: c.index, score: 80, reason: "Related mechanism" })) }
        : { mode: "paper", intent: "Find HorNet", terms: ["HorNet"], queries: ["HorNet"] };
      if (data.candidates) { assert(data.candidates.every((c: any) => titles.slice(1).includes(c.title))); assert.deepEqual(data.candidates.map((c: any) => c.index), data.candidates.map((_: any, i: number) => i)); }
      return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
    }
    if (host === "api.openalex.org") return Response.json({ results: [] });
    if (String(url).includes("/works/10.1234")) return Response.json({ message: { type: "journal-article", title: [titles.at(-1)], DOI: "10.1234/study", URL: "https://doi.org/10.1234/study" } });
    return Response.json({ message: { items: titles.slice(0, -1).map((title, i) => ({ type: "journal-article", title: [title], URL: "https://example.com/" + i })) } });
  });
  try {
    const result = await research({ paperId: "root", page: 1, selectedText: "HorNet" },
      { title: "HMC", topic: "Detection", doi: "", pages: [], references: ['[1] “HorNet original”'] }, () => {},
      async () => ({ name: "aiq-research", endpoint: "fixture", revision: "fixture", startedAt: "fixture", report: "Related study https://doi.org/10.1234/study" }));
    assert.deepEqual(result.candidates.map((c) => c.title), titles.slice(1));
    assert.match(result.report, /共展示 10 篇/);
    assert.deepEqual(result.plan.queries.map((q) => q.kind), ["title", "keywords"]);
  } finally {
    for (const key of ["QWEN_BASE_URL", "QWEN_API_KEY"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});

test("deleting a search mark persists without removing linked papers or PDFs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-tree-marks-"));
  try {
    const storage = createStorage(directory);
    await storage.initialize();
    const flow = createWorkflow(storage, () => {});
    const bytes = new Uint8Array(Buffer.from("%PDF-1.4 fixture"));
    const root = await flow.importPaper({ fileName: "root.pdf", bytes });
    storage.get().tasks.push({ id: "mark", paperId: root.id, page: 1, selectedText: "HorNet", status: "choosing", query: "HorNet", candidates: [], rect: { x: 0.1, y: 0.2, w: 0.1, h: 0.1 } });
    await flow.chooseCandidate("mark", { title: "HorNet", authors: "", url: "https://example.com/paper" });
    const child = await flow.importPaper({ fileName: "child.pdf", bytes, taskId: "mark" });
    await storage.deleteMark("mark");
    const reopened = createStorage(directory);
    await reopened.initialize();
    assert.equal(reopened.get().tasks.length, 0);
    assert.equal(reopened.get().papers.length, 2);
    assert.equal(reopened.get().relations[0].targetId, child.id);
    assert.deepEqual(await reopened.readPdf(child.id), bytes);
  } finally { await rm(directory, { recursive: true }); }
});

test("image recognition sends cropped pixels to the vision model, without PDF text", async (t) => {
  const { jsonChat } = await import("../src/main/model");
  const saved = { ...process.env };
  Object.assign(process.env, { QWEN_BASE_URL: "https://model.example", QWEN_API_KEY: "fixture", QWEN_MODEL: "text-model", QWEN_VISION_MODEL: "vision-model" });
  const image = "data:image/png;base64,iVBORw0KGgo=";
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, "vision-model");
    assert.deepEqual(body.messages[1].content, [{ type: "text", text: "Read image" }, { type: "image_url", image_url: { url: image } }]);
    return Response.json({ choices: [{ message: { content: '{"text":"HorNet"}' } }] });
  });
  try { assert.equal((await jsonChat("Transcribe", "Read image", image)).text, "HorNet"); }
  finally {
    for (const key of ["QWEN_BASE_URL", "QWEN_API_KEY", "QWEN_MODEL", "QWEN_VISION_MODEL"])
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

test("OCR removes clipped edge bands but preserves complete interior lines", async () => {
  const { clippedRows } = await import("../src/shared/types");
  const width = 20, height = 34;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (start: number, end: number) => {
    for (let y = start; y < end; y++) pixels.fill(0, (y * width + 3) * 4, (y * width + 12) * 4);
    for (let y = start; y < end; y++) for (let x = 3; x < 12; x++) pixels[(y * width + x) * 4 + 3] = 255;
  };
  assert.deepEqual(clippedRows(pixels, width, height), []);
  ink(0, 2); ink(11, 25); ink(32, 34);
  assert.deepEqual(clippedRows(pixels, width, height), [[0, 2], [32, 2]]);
  pixels.fill(255); ink(0, height);
  assert.deepEqual(clippedRows(pixels, width, height), [[0, height]], "a fully clipped selection must not be guessed");
});

test("all results are ranked by score without filling or truncation; omitted scores fail explicitly", async (t) => {
  const { research } = await import("../src/main/research");
  const saved = { ...process.env };
  Object.assign(process.env, { QWEN_BASE_URL: "https://model.example", QWEN_API_KEY: "fixture" });
  let omit = false, searches = 0;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    const u = new URL(String(url));
    if (u.hostname === "model.example") {
      const data = JSON.parse(JSON.parse(init.body).messages[1].content);
      const value = data.candidates ? { keep: data.candidates.slice(0, omit ? 0 : undefined).map((c: any) => ({ index: c.index, score: c.title === "Original" ? 70 : c.title === "Unrelated" ? 5 : 95, reason: "Fixture evidence" })) }
        : { mode: "paper", intent: "Find method", terms: ["Method"], queries: ["Method"] };
      return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
    }
    searches++;
    if (u.hostname === "api.openalex.org") throw new Error("Index unavailable");
    assert(!/improvements|comparison/.test(u.searchParams.get("query.bibliographic") || ""));
    return Response.json({ message: { items: ["Original", "Improvement", "Application", "Unrelated"].map((title) => ({ type: "journal-article", title: [title], URL: `https://example.com/${title}` })) } });
  });
  const run = () => research({ paperId: "root", page: 1, selectedText: "Method" }, { title: "Root", topic: "", doi: "", pages: [], references: [] }, () => {}, async () => { throw new Error("AI-Q unavailable"); });
  try {
    const result = await run();
    assert.deepEqual(result.candidates.map((c) => c.title), ["Improvement", "Application", "Original", "Unrelated"]);
    assert.equal(searches, 2, "result counts do not trigger additional searches");
    assert.match(result.report, /共展示 4 篇/);
    assert.match(result.report, /失败/);
    omit = true;
    await assert.rejects(run(), /未完整评估/);
  } finally {
    for (const key of ["QWEN_BASE_URL", "QWEN_API_KEY"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
