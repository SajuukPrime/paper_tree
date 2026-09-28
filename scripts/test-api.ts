import { config } from "dotenv";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stopSkills } from "../src/main/skills";
import { indexPdf } from "../src/main/model";
import { research, referenceFor } from "../src/main/research";
config({ quiet: true });
const index = process.argv[2]
  ? await indexPdf(new Uint8Array(await readFile(process.argv[2])))
  : {
      title: "YOLO-HMC: An Improved Method for PCB Surface Defect Detection",
      topic: "PCB视觉缺陷检测",
      doi: "10.1109/TIM.2024.3351241",
      pages: ["HorNet improves the backbone."],
      references: [
        "[31] Y. Rao et al., “HorNet: Efficient high-order spatial interactions with recursive gated convolutions,” 2022, arXiv:2207.14284.",
      ],
    };
const input = { paperId: "test", page: 1, selectedText: "HorNet" };
assert(referenceFor(input, index)?.includes("2207.14284"));
const result = await research(input, index, console.log).finally(stopSkills);
assert(result.skill);
assert.equal(result.skill.name, "aiq-research");
assert.match(result.skill.report, /https?:\/\//, "AI-Q report must retain source URLs");
assert(result.candidates.some((c) => c.url.includes("2207.14284")));
assert(result.candidates.every((c) => c.title !== index.title && c.reason));
console.log({
  skill: { name: result.skill.name, endpoint: result.skill.endpoint, revision: result.skill.revision },
  candidates: result.candidates.map((c) => ({ title: c.title, access: c.access, reason: c.reason })),
});
console.log("PASS: NVIDIA aiq-research + reference-first HorNet lookup + model relevance screening.");
