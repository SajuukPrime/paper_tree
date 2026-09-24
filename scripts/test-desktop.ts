import { DatabaseSync } from "node:sqlite";
import { _electron as electron } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import type { Workspace } from "../src/shared/types";

function fixturePdf() {
  const text =
    "BT /F1 17 Tf 60 740 Td (Paper Tree prototype fixture) Tj 0 -35 Td /F1 11 Tf (Contrastive learning compares similar and dissimilar examples.) Tj 0 -20 Td (This fixture has no experimental results.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

const directory = await mkdtemp(join(tmpdir(), "paper-tree-links-"));
const pdf = fixturePdf();
const pdfPath = join(directory, "root.pdf");
await writeFile(pdfPath, pdf);
let authenticatedDownloads = 0;
let indexed = 0;
// Controlled publisher fixture: a real cookie-gated browser download, not a mocked import.
const server = createServer((request, response) => {
  const url = new URL(request.url!, "http://localhost");
  if (url.pathname === "/chat/completions") {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: ["Paper Tree prototype fixture", "Child paper", "Grandchild paper"][indexed++],
                topic: "对比学习",
              }),
            },
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname === "/login") {
    response.writeHead(302, {
      "Set-Cookie": "paper-access=yes; Path=/; Max-Age=3600",
      Location: url.searchParams.get("next")!,
    });
    response.end();
    return;
  }
  const authenticated = request.headers.cookie?.includes("paper-access=yes");
  if (url.pathname.startsWith("/pdf/")) {
    if (!authenticated) {
      response.writeHead(403);
      response.end("Login required");
      return;
    }
    authenticatedDownloads++;
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="related.pdf"',
    });
    response.end(pdf);
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  const name = url.pathname.split("/").at(-1);
  response.end(
    authenticated
      ? `<h1>Publisher fixture: ${name}</h1><a href="/pdf/${name}" target="_blank">Download PDF</a>`
      : `<h1>Publisher fixture</h1><a href="/login?next=${url.pathname}">Sign in</a>`,
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const launch = () =>
  electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: { ...process.env, PAPER_TREE_DATA_DIR: directory, QWEN_BASE_URL: origin, QWEN_API_KEY: "local-test-only" },
  });
let app = await launch();
try {
  let page = await app.firstWindow();
  const errors: string[] = [];
  const captureErrors = () => page.on("pageerror", (error) => errors.push(error.message));
  captureErrors();
  await page.getByTestId("pdf-input").setInputFiles(pdfPath);
  await page.locator(".textLayer span").filter({ hasText: "Contrastive learning" }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "问这篇论文" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "可选原文" }).count(), 0);
  await page.getByText("对比学习 · 0 条参考文献").waitFor();
  await page.bringToFront();
  assert.equal(await page.getByRole("button", {name: "下一页", exact: true}).count(), 0);
  await page.locator('.page[data-page-number="2"]').scrollIntoViewIfNeeded();
  await page.getByText("连续阅读 · 第 2 / 2 页").waitFor();
  const line = page.locator('.page[data-page-number="2"] .textLayer span').filter({ hasText: "Contrastive learning" });
  await line.scrollIntoViewIfNeeded();
  const bounds = (await line.boundingBox())!;
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.locator(".associate-bar").filter({ hasText: "Contrastive" }).waitFor();
  assert.equal(await page.locator("textarea").count(), 0);
  assert.equal(await page.getByRole("button", { name: "关联选中内容" }).isEnabled(), true);
  await page.getByText("对比学习 · 0 条参考文献").waitFor();
  await page.screenshot({ path: join(directory, "pdf-selection.png") });
  await app.close();

  // Seed only search results. Download, cookie handling and relation creation stay real.
  const database = () => new DatabaseSync(join(directory, "workspace.sqlite"));
  const readState = (): Workspace => {
    const db = database();
    const state = JSON.parse(db.prepare("SELECT json FROM state WHERE id=1").get()!.json as string);
    db.close();
    return state;
  };
  const seed = async (parentId: string, name: string, direct: boolean) => {
    const data: Workspace = readState();
    data.tasks.push({
      id: name,
      paperId: parentId,
      page: 2,
      selectedText: "Contrastive learning",
      question: `What motivates ${name}?`,
      status: "choosing",
      query: "fixture result",
      candidates: [
        {
          title: name,
          authors: "Test fixture",
          source: "Local publisher test",
          url: `${origin}/paper/${name}`,
          access: direct ? "open" : "subscription",
          pdfUrl: direct ? `${origin}/pdf/${name}` : undefined,
        },
      ],
    });
    const db = database();
    db.prepare("UPDATE state SET json=? WHERE id=1").run(JSON.stringify(data));
    db.close();
  };
  let data: Workspace = readState();
  const rootId = data.papers[0].id;
  await seed(rootId, "Child paper", false);
  app = await launch();
  page = await app.firstWindow();
  captureErrors();
  const readerWidth = await page.locator(".reader").evaluate(el => el.clientWidth);
  await page.getByRole("button", {name: "关联结果"}).click();
  assert.equal(await page.locator(".reader").evaluate(el => el.clientWidth), readerWidth);
  await page.locator(".pdf-scroll").click({position: {x: 20, y: 20}});
  assert.equal(await page.locator(".research-panel").count(), 0);
  await page.getByRole("button", {name: "关联结果"}).click();
  await page.screenshot({path: join(directory, "bubble.png")});
  const browserPromise = app.waitForEvent("window");
  await page.getByRole("button", { name: "打开页面，下载并关联" }).click();
  const browser = await browserPromise;
  await browser.getByRole("link", { name: "Sign in" }).click();
  assert.equal(await browser.evaluate(() => typeof window.paperTree), "undefined");
  await browser.getByRole("link", { name: "Download PDF" }).click();
  await page.getByRole("heading", { name: "Child paper", exact: true, level: 1 }).waitFor();
  await page.locator(".textLayer span").first().waitFor();
  assert.equal(authenticatedDownloads, 1);
  data = readState();
  assert.equal(data.relations[0].sourceId, rootId);
  assert.equal(data.relations[0].question, "What motivates Child paper?");
  assert.equal(data.tasks[0].status, "completed");
  await page.screenshot({ path: join(directory, "linked.png") });
  const childId = data.papers[1].id;
  await app.close();

  await seed(childId, "Grandchild paper", true);
  app = await launch();
  page = await app.firstWindow();
  captureErrors();
  await page.getByRole("button", { name: "Child paper", exact: true }).click();
  await page.getByRole("button", {name: "关联结果"}).click();
  await page.getByRole("button", { name: "获取 PDF 并关联" }).click();
  await page.getByRole("heading", { name: "Grandchild paper", exact: true, level: 1 }).waitFor();
  await page.locator(".textLayer span").first().waitFor();
  assert.equal(authenticatedDownloads, 2);
  data = readState();
  assert.equal(data.relations[1].sourceId, childId);
  assert.equal(data.papers.length, 3);
  await page.screenshot({ path: join(directory, "tree.png") });
  await page.getByRole("button", { name: "回到源论文" }).click();
  await page.getByRole("heading", { name: "Child paper", exact: true, level: 1 }).waitFor();
  await page.getByText("连续阅读 · 第 2 / 2 页").waitFor();
  assert.deepEqual(errors, []);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.locator(".tree-node").nth(2).waitFor();
  await page.getByRole("button", {name: "收起 Paper Tree prototype fixture", exact: true}).click();
  assert.equal(await page.locator(".tree-node").count(), 1);
  await page.getByRole("button", {name: "展开 Paper Tree prototype fixture", exact: true}).click();
  assert.equal(await page.locator(".tree-node").count(), 3);
  console.log(
    "PASS: continuous PDF scrolling + selection; non-resizing closable bubble; login download + recursive tree; return to source page; restart.",
  );
  console.log("Screenshots:", directory);
} finally {
  await app.close();
  server.close();
}
