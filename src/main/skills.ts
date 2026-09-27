import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { tr, type SkillRun } from "../shared/types";
const execute = promisify(execFile);
let owned: ChildProcess | undefined;
let starting: Promise<void> | undefined;
const root = () => resolve(process.cwd());
const repository = () => resolve(process.env.AIQ_REPO || join(root(), ".prototype-data/aiq"));
const python = () => process.env.AIQ_PYTHON || join(repository(), ".venv/bin/python");
function endpoint() {
  const url = new URL(process.env.AIQ_SERVER_URL || "http://127.0.0.1:18181");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw new Error(tr("当前原型的 AI-Q 仅支持本机地址。", "AI-Q currently supports local server addresses only."));
  return url.origin;
}
async function helper(command: string, ...args: string[]) {
  const { stdout } = await execute(
    python(),
    [join(root(), "vendor/nvidia-skills/aiq-research/scripts/aiq.py"), command, ...args],
    {
      env: { ...process.env, AIQ_SERVER_URL: endpoint() },
      timeout: command === "chat" ? 600_000 : 120_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout);
}
async function reachable() {
  return fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(1000) })
    .then((r) => r.ok)
    .catch(() => false);
}
// Only a process started by this app is stopped when the window closes.
export async function stopSkills() {
  const child = owned;
  owned = undefined;
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5000)]);
  }
}
export function startSkills(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    if (await reachable()) return;
    if (process.env.AIQ_SERVER_URL) throw new Error(tr("配置的本机 AI-Q 服务不可达。", "The configured local AI-Q server is unreachable."));
    const executable = join(repository(), ".venv/bin/nat");
    await access(executable).catch(() => {
      throw new Error(tr("AI-Q 尚未安装，请先运行 npm run setup:aiq（需要 Python 3.11+ 和 uv）。", "AI-Q is not installed. Run npm run setup:aiq (requires Python 3.11+ and uv)."));
    });
    const noProxy = [process.env.NO_PROXY || process.env.no_proxy, "127.0.0.1", "localhost", "::1"].filter(Boolean).join(",");
    owned = spawn(
      executable,
      ["serve", "--config_file", join(root(), "backend/aiq.yml"), "--host", "127.0.0.1", "--port", "18181"],
      {
        cwd: repository(),
        env: { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy, AIQ_DEV_ENV: "skill" },
        stdio: process.env.PAPER_TREE_DEBUG ? "inherit" : "ignore",
      },
    );
    let failed = false;
    owned.once("error", () => {
      failed = true;
    });
    owned.once("exit", () => {
      failed = true;
    });
    for (let i = 0; i < 90; i++) {
      if (failed) throw new Error(tr("AI-Q 启动失败，请按 docs/skills.md 前台启动查看原因。", "AI-Q failed to start. See docs/skills.md to run it in the foreground."));
      if (await reachable()) return;
      await delay(1000);
    }
    stopSkills();
    throw new Error(tr("AI-Q 启动超时。", "AI-Q startup timed out."));
  })().catch((error) => {
    starting = undefined;
    throw error;
  });
  return starting;
}
export async function researchSkill(query: string, progress: (message: string) => void): Promise<SkillRun> {
  const target = endpoint();
  progress(tr(`NVIDIA aiq-research → ${target}：准备研究…`, `NVIDIA aiq-research → ${target}: preparing research…`));
  await startSkills();
  await helper("health");
  const startedAt = new Date().toISOString();
  let response = await helper("chat", query);
  const jobId = response.job_id;
  if (jobId) {
    for (let i = 0; i < 60; i++) {
      const { job_status: status } = await helper("status", jobId);
      if (["success", "completed"].includes(status.status)) {
        response = await helper("report", jobId);
        break;
      }
      if (["failure", "failed", "interrupted", "cancelled", "not_found"].includes(status.status))
        throw new Error(tr(`AI-Q 研究失败：${status.status}`, `AI-Q research failed: ${status.status}`));
      if (i === 59) throw new Error(tr(`AI-Q 任务仍在运行：${jobId}，未生成候选。`, `AI-Q job ${jobId} is still running; no candidates yet.`));
      await delay(2000);
    }
  }
  const report = response.report || response.choices?.[0]?.message?.content;
  if (typeof report !== "string" || !/https?:\/\//.test(report))
    throw new Error(tr("AI-Q 未返回带来源的研究报告，检索已停止。", "AI-Q returned no report with sources. Search stopped."));
  return {
    name: "aiq-research",
    endpoint: target,
    startedAt,
    jobId,
    report,
    revision: (await readFile(join(root(), "vendor/nvidia-skills/UPSTREAM_COMMIT"), "utf8")).trim(),
  };
}
