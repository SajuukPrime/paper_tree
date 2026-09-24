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
const source = await filesIn("src");
const all = [
  ...source,
  ...(await filesIn("scripts")),
  ...(await filesIn("tests")),
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
console.log(`Runtime: ${source.length}/14 files, ${sourceLines}/1200 lines`);
console.log(`All authored code/config/tests: ${all.length}/22 files, ${totalLines}/1800 lines`);
assert(source.length <= 14 && sourceLines <= 1200, "运行源码超过预算，请删减功能或重复代码。");
assert(all.length <= 22 && totalLines <= 1800, "自有代码总量超过预算。");
