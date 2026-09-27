import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const repository = resolve(process.env.AIQ_REPO || ".prototype-data/aiq");
const revision = "bf4e67d1564ef8d2ec8f65b5f9001e512befc095";
function run(command: string, args: string[], cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) throw new Error(`${command} 执行失败，请检查上方输出。`);
}
if (!existsSync(repository)) {
  run("git", ["clone", "https://github.com/NVIDIA-AI-Blueprints/aiq.git", repository]);
  run("git", ["checkout", revision], repository);
}
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" });
if (head.stdout.trim() !== revision) throw new Error(`AI-Q 版本不符；预期 ${revision}。不自动覆盖已有仓库。`);
const uv = process.env.UV || "uv";
run(uv, ["sync", "--frozen", "--no-dev", "--package", "aiq-api"], repository);
run(uv, ["pip", "install", "--python", resolve(repository, ".venv/bin/python"), "--no-deps", "-e", resolve("backend")]);
console.log("AI-Q 安装完成；npm run dev 将启动仅监听 127.0.0.1:18181 的后台。");
