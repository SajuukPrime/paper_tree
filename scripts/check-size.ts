import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? filesIn(`${directory}/${entry.name}`) : Promise.resolve([`${directory}/${entry.name}`]),
      ),
    )
  ).flat();
}
const backend = (await filesIn("backend")).filter((p) => /\.(py|toml|yml)$/.test(p));
const source = [...(await filesIn("src")), ...backend.filter((p) => p.endsWith(".py"))];
const all = [
  ...source,
  ...(await filesIn("scripts")),
  ...(await filesIn("tests")),
  ...backend.filter((p) => !p.endsWith(".py")),
  "package.json",
  "tsconfig.json",
  "electron.vite.config.ts",
  ".prettierrc.json",
];
const lines = async (files: string[]) =>
  (await Promise.all(files.map(async (file) => (await readFile(file, "utf8")).trimEnd().split("\n").length))).reduce(
    (a, b) => a + b,
    0,
  );
const sourceLines = await lines(source),
  totalLines = await lines(all);
console.log(`Runtime: ${source.length}/16 files, ${sourceLines}/2000 lines`);
console.log(`All authored code/config/tests: ${all.length}/28 files, ${totalLines}/2910 lines`);
assert(source.length <= 16 && sourceLines <= 2000, "运行源码超过预算，请删减功能或重复代码。");
assert(all.length <= 28 && totalLines <= 2910, "自有代码总量超过预算。");

const deployment = await filesIn("deploy");
const deploymentLines = await lines(deployment);
console.log(`Deployment: ${deployment.length}/3 files, ${deploymentLines}/180 lines (separate from app budget)`);
assert(deployment.length <= 3 && deploymentLines <= 180, "部署代码超过预算。");
