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
    env: {
      ...process.env,
      PAPER_TREE_DATA_DIR: directory,
      AIQ_SERVER_URL: origin,
      QWEN_BASE_URL: origin,
      QWEN_API_KEY: "local-test-only",
    },
  });
let app = await launch();
try {
  let page = await app.firstWindow();
  const errors: string[] = [];
  const captureErrors = () =>
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log(error.message);
    });
  captureErrors();
  await page.getByTestId("pdf-input").setInputFiles(pdfPath);
  await page.locator(".textLayer span").filter({ hasText: "Contrastive learning" }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "问这篇论文" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "可选原文" }).count(), 0);
  await page.getByText("对比学习 · 0 条参考文献").waitFor();
  await page.bringToFront();
  assert.equal(await page.getByRole("button", { name: "下一页", exact: true }).count(), 0);
  await page.locator('.page[data-page-number="2"]').scrollIntoViewIfNeeded();
  await page.getByText("第 2 / 2 页").waitFor();
  assert.equal(await page.getByRole("button", { name: "阅读浏览", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "框选检索", exact: true }).click();
  const line = page.locator('.page[data-page-number="2"] .textLayer span').filter({ hasText: "Contrastive learning" });
  await line.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const bounds = (await line.boundingBox())!;
  await page.mouse.move(bounds.x + 1, bounds.y + 1);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height - 1, { steps: 12 });
  assert.equal(await page.getByLabel("框选区域", { exact: true }).count(), 1);
  await page.mouse.up();
  await page.getByRole("button", { name: "关联框内内容" }).waitFor();
  assert.equal(await page.locator("textarea").count(), 0);
  assert.equal(await page.getByRole("button", { name: "关联框内内容" }).isEnabled(), true);
  await page.getByText("对比学习 · 0 条参考文献").waitFor();
  await page.screenshot({ path: join(directory, "pdf-selection.png") });
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), "");
  const box = page.getByLabel("框选区域", { exact: true });
  const rectangle = (await box.boundingBox())!;
  assert(
    Math.abs(rectangle.x - bounds.x - 1) < 2 && Math.abs(rectangle.y - bounds.y - 1) < 2,
    "box aligns with drag coordinates despite PDF page borders",
  );
  const top = rectangle.y;
  await page.locator(".pdf-scroll").evaluate((el) => el.scrollBy(0, -50));
  await page.waitForTimeout(150);
  assert(Math.abs((await box.boundingBox())!.y - top - 50) < 3, "box follows its PDF page while scrolling");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("paper:expand");
    ipcMain.handle("paper:expand", (_event, input) => {
      (globalThis as any).boxTestInput = input;
      return {};
    });
  });
  await page.getByRole("button", { name: "关联框内内容" }).click();
  await page.getByText("已筛选关联论文，请选择获取").waitFor();
  const captured = await app.evaluate(() => (globalThis as any).boxTestInput);
  assert.equal(captured.page, 2);
  assert(captured.selectedText.includes("Contrastive learning"));
  await page.screenshot({ path: join(directory, "rectangle-selection.png") });
  assert(captured.rect.w > 0 && captured.rect.h > 0);
  assert.equal(await box.count(), 0);
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
      rect: captured.rect,
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
  const readerWidth = await page.locator(".reader").evaluate((el) => el.clientWidth);
  await page.getByRole("button", { name: "关联结果" }).click();
  assert.equal(await page.locator(".reader").evaluate((el) => el.clientWidth), readerWidth);
  await page.locator(".pdf-scroll").click({ position: { x: 20, y: 20 } });
  assert.equal(await page.locator(".research-panel").count(), 0);
  await page.getByRole("button", { name: "关联结果" }).click();
  await page.screenshot({ path: join(directory, "bubble.png") });
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
  await page.getByLabel("切换论文").selectOption({ label: "Child paper" });
  await page.getByRole("button", { name: "关联结果" }).click();
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
  await page.getByText("第 2 / 2 页").waitFor();
  await page.locator(".paper-mark").waitFor();
  const sourceLine = page
    .locator('.page[data-page-number="2"] .textLayer span')
    .filter({ hasText: "Contrastive learning" });
  const scrollBox = (await page.locator(".pdf-scroll").boundingBox())!;
  const sourceBox = (await sourceLine.boundingBox())!;
  assert(sourceBox.y >= scrollBox.y && sourceBox.y < scrollBox.y + scrollBox.height);
  const before = await page.locator(".pdf-scroll").evaluate((el) => el.scrollTop);
  await page.getByLabel("切换论文").selectOption({ label: "Grandchild paper" });
  await page.getByRole("heading", { name: "Grandchild paper", exact: true, level: 1 }).waitFor();
  await page.getByLabel("切换论文").selectOption({ label: "Child paper" });
  await page.waitForFunction((top) => Math.abs(document.querySelector(".pdf-scroll")!.scrollTop - top) < 5, before);
  await page.getByLabel("已检索的位置").selectOption("Grandchild paper");
  await page.getByLabel("关联论文气泡").waitFor();
  await page.getByRole("button", { name: "收起关联论文" }).click();
  const separator = page.getByRole("separator"),
    dividerBounds = (await separator.boundingBox())!;
  const oldWidth = await page.locator(".library-rail").evaluate((el) => el.clientWidth);
  await page.mouse.move(dividerBounds.x + dividerBounds.width / 2, dividerBounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(dividerBounds.x - 100, dividerBounds.y + 100, { steps: 10 });
  await page.mouse.up();
  assert((await page.locator(".library-rail").evaluate((el) => el.clientWidth)) < oldWidth - 70);
  await page.getByLabel("缩放", { exact: true }).selectOption("1.25");
  await page.waitForTimeout(250);
  const restored = await page.locator(".paper-mark").evaluate((frame) => {
    const sheet = frame.parentElement!,
      a = frame.getBoundingClientRect(),
      b = sheet.getBoundingClientRect();
    return { x: (a.left - b.left - sheet.clientLeft) / sheet.clientWidth, w: a.width / sheet.clientWidth };
  });
  assert(Math.abs(restored.x - captured.rect.x) < 0.005 && Math.abs(restored.w - captured.rect.w) < 0.005);
  assert.deepEqual(errors, []);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByLabel("切换论文").locator("option").nth(2).waitFor({ state: "attached" });
  assert.equal(await page.getByRole("navigation", { name: "工作区列表" }).getByRole("button").count(), 1);
  await page.locator(".network-canvas canvas").waitFor();
  await page.getByRole("button", { name: "适合窗口" }).click();
  await app.close();
  data = readState();
  data.papers.push({ ...data.papers[0], id: "second-root", title: "Second workspace" });
  await writeFile(join(directory, "papers", "second-root.pdf"), pdf);
  const db = database();
  db.prepare("UPDATE state SET json=? WHERE id=1").run(JSON.stringify(data));
  db.prepare("INSERT INTO paper_index(id,json) SELECT ?,json FROM paper_index WHERE id=?").run("second-root", rootId);
  db.close();
  app = await launch();
  page = await app.firstWindow();
  const workspaces = page.getByRole("navigation", { name: "工作区列表" });
  await workspaces.getByRole("button", { name: "Second workspace" }).waitFor();
  assert.equal(await workspaces.getByRole("button").count(), 2);
  await workspaces.getByRole("button", { name: "Second workspace" }).click();
  assert.equal(await page.getByLabel("切换论文").locator("option").count(), 1);
  await page.getByLabel("搜索根论文").fill("Child");
  assert.equal(await workspaces.getByRole("button").count(), 0);
  await page.getByLabel("搜索根论文").fill("");
  await workspaces.getByRole("button", { name: "Paper Tree prototype fixture", exact: true }).click();
  assert.equal(await page.getByLabel("切换论文").locator("option").count(), 3);
  await page.getByLabel("切换论文").selectOption({ label: "Child paper" });
  assert.equal(
    await workspaces
      .getByRole("button", { name: "Paper Tree prototype fixture", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page.getByLabel("修改标题", { exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("Renamed child");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("heading", { name: "Renamed child", exact: true }).waitFor();
  assert.equal(readState().papers.find((p) => p.id === childId)?.renamed, true);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async (_window: any, options?: any) => {
    if (!options.message.includes("1 篇后续论文")) throw new Error("Missing cascade count");
    return { response: 0, checkboxChecked: false };
  }; });
  await page.getByLabel("删除节点").click();
  await page.waitForFunction(() => !(document.querySelector('[aria-label="删除节点"]') as HTMLButtonElement).disabled);
  assert.equal(readState().papers.length, 4);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
  await page.getByLabel("删除节点").click();
  await page.getByRole("heading", { name: "Paper Tree prototype fixture", exact: true }).waitFor();
  assert.equal(readState().papers.length, 2);
  assert.equal(readState().relations.length, 0);
  assert.equal(readState().tasks[0].status, "choosing");
  await page.getByLabel("设置", { exact: true }).click();
  await page.getByRole("dialog", { name: "模型设置" }).waitFor();
  assert.equal(await page.getByLabel("接口 URL").inputValue(), origin);
  assert.equal(await page.getByLabel("API Key").inputValue(), "");
  await page.getByLabel("模型名").fill("new-fixture-model");
  await page.getByLabel("API Key").fill("updated-test-only");
  // Suppress automatic relaunch only in this isolated fixture; launch explicitly below.
  await app.evaluate(({ app }) => {
    (globalThis as any).originalQuit = app.quit;
    app.relaunch = () => {};
    app.quit = () => {};
  });
  await page.getByRole("button", { name: "保存并重启" }).click();
  await page.waitForFunction(async () => (await window.paperTree.settings()).model === "new-fixture-model");
  await app.evaluate(({ app }) => { app.quit = (globalThis as any).originalQuit; });
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByLabel("设置", { exact: true }).click();
  await page.getByRole("dialog", { name: "模型设置" }).waitFor();
  assert.equal(await page.getByLabel("模型名").inputValue(), "new-fixture-model");
  assert.equal(await page.getByLabel("API Key").inputValue(), "");
  assert(await app.evaluate(() => process.env.QWEN_API_KEY === "updated-test-only"));
  const settingsDb = database();
  assert(!String(settingsDb.prepare("SELECT json FROM settings").get()!.json).includes('test-only'));
  settingsDb.close();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Settings", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page.getByRole("toolbar", { name: "Reading toolbar" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Paper Tree prototype fixture", exact: true }).count(), 1);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByLabel("Language", { exact: true }).selectOption("zh");
  await page.getByRole("button", { name: "设置", exact: true }).waitFor();
  assert(await app.evaluate(() => process.env.PAPER_TREE_LANGUAGE === "zh"));
  console.log("PASS: live language switching; persisted language; unchanged paper title.");
  console.log("PASS: rename; cascade cancel/confirm; encrypted settings migration/save/restart.");
  console.log(
    "PASS: continuous PDF scrolling + selection; non-resizing closable bubble; login download + recursive tree; source highlight + scroll restoration; search bookmarks; draggable divider; restart.",
  );
  console.log("Screenshots:", directory);
} catch (error) {
  const failedPage = await app.firstWindow();
  await failedPage.screenshot({ path: "/tmp/paper-tree-desktop-failure.png" });
  console.log(await failedPage.locator("body").innerText());
  throw error;
} finally {
  await app.close();
  server.close();
}
