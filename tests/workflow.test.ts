import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    assert.deepEqual(await reopened.readPdf(child.id), input.bytes);
    await assert.rejects(flow.importPaper({ ...input, taskId: "task" }), /等待 PDF/);
    // The same question can lead to another sibling without searching again.
    await flow.chooseCandidate("task", { title: "Sibling", authors: "Example", url: "https://example.com/second" });
    const sibling = await flow.importPaper({ ...input, fileName: "sibling.pdf", taskId: "task" });
    assert.equal(storage.get().relations[1].sourceId, root.id);
    assert.equal(storage.get().relations[1].targetId, sibling.id);
    assert.equal(storage.get().relations[1].question, "How does it work?");
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
});
