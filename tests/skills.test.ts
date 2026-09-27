import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { researchSkill } from "../src/main/skills";

test("official Skill helper checks health, preserves citations, polls jobs and surfaces failures", async () => {
  const calls: string[] = [];
  let mode = "direct";
  const id = "12345678-1234-4234-8234-123456789abc";
  const report = "HorNet [source](https://arxiv.org/abs/2207.14284)";
  const server = createServer((req, res) => {
    calls.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") return res.end('{"status":"ok"}');
    if (req.url === "/chat") {
      assert.equal(req.headers["x-aiq-mode"], "headless");
      if (mode === "error") {
        res.writeHead(503);
        return res.end('{"error":"fixture failure"}');
      }
      return res.end(
        JSON.stringify(mode === "async" ? { job_id: id } : { choices: [{ message: { content: report } }] }),
      );
    }
    res.end(JSON.stringify(req.url?.endsWith("/report") ? { has_report: true, report } : { status: "success" }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const saved = process.env.AIQ_SERVER_URL;
  process.env.AIQ_SERVER_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await researchSkill("synthetic public fixture", () => {});
    assert.equal(result.report, report);
    assert.match(result.revision, /^[a-f0-9]{40}$/);
    assert(calls.indexOf("/health") < calls.indexOf("/chat"));
    mode = "async";
    assert.equal((await researchSkill("fixture", () => {})).jobId, id);
    assert(calls.includes(`/v1/jobs/async/job/${id}/report`));
    mode = "error";
    await assert.rejects(
      researchSkill("fixture", () => {}),
      /503/,
    );
  } finally {
    if (saved === undefined) delete process.env.AIQ_SERVER_URL;
    else process.env.AIQ_SERVER_URL = saved;
    await new Promise<void>((done) => server.close(() => done()));
  }
});
