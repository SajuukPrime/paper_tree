import { tr, type SelectionRect } from "../../shared/types";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
GlobalWorkerOptions.workerSrc = workerUrl;
const positions = new Map<string, { page: number; ratio: number }>();
function pageRect(sheet: HTMLElement) {
  const r = sheet.getBoundingClientRect();
  return new DOMRect(r.x + sheet.clientLeft, r.y + sheet.clientTop, sheet.clientWidth, sheet.clientHeight);
}
export default function PdfReader({
  paperId,
  marks,
  jump,
  onMark,
  page,
  onPage,
  onAssociate,
  busy,
}: {
  paperId: string;
  marks: { id: string; page: number; selectedText: string; status: string; rect?: SelectionRect }[];
  jump: { page: number; text: string; token: number; rect?: SelectionRect };
  onMark: (id: string) => void;
  page: number;
  onPage: (page: number) => void;
  onAssociate: (text: string, page: number, rect: SelectionRect) => void;
  busy: boolean;
}) {
  const [boxing, setBoxing] = useState(false);
  const [box, setBox] = useState<(SelectionRect & { sheet: HTMLElement; text: string }) | null>(null);
  const drag = useRef<{ sheet: HTMLElement; x: number; y: number } | null>(null);
  const clearBox = () => {
    drag.current = null;
    setBox(null);
  };
  const point = (e: React.PointerEvent, sheet: HTMLElement) => {
    const r = pageRect(sheet);
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  function finishBox(e: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const end = point(e, start.sheet),
      r = pageRect(start.sheet);
    const x = Math.min(start.x, end.x),
      y = Math.min(start.y, end.y),
      w = Math.abs(end.x - start.x),
      h = Math.abs(end.y - start.y);
    drag.current = null;
    if (w * r.width < 5 || h * r.height < 5) {
      clearBox();
      return;
    }
    // Snap intersected words to their full spelling, preserving academic names.
    const text = [...start.sheet.querySelectorAll(".textLayer span")]
      .flatMap((span) => {
        const node = span.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) return [];
        return [...node.textContent!.matchAll(/\S+/g)].flatMap((word) => {
          const range = new Range();
          range.setStart(node, word.index!);
          range.setEnd(node, word.index! + word[0].length);
          const c = range.getBoundingClientRect(),
            cy = (c.top + c.bottom) / 2;
          return c.right > r.left + x * r.width &&
            c.left < r.left + (x + w) * r.width &&
            cy >= r.top + y * r.height &&
            cy <= r.top + (y + h) * r.height
            ? [word[0]]
            : [];
        });
      })
      .join(" ");
    setBox({ sheet: start.sheet, x, y, w, h, text });
    onPage(Number(start.sheet.dataset.pageNumber));
  }
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const annotations = useRef(marks),
    pending = useRef(jump);
  annotations.current = marks;
  const markClick = useRef(onMark);
  markClick.current = onMark;
  const paint = () => {
    host.current?.querySelectorAll<HTMLElement>(".page").forEach((sheet) => {
      sheet.querySelectorAll(".paper-mark").forEach((element) => element.remove());
      annotations.current.forEach((mark, i) => {
        if (!mark.rect || mark.page !== Number(sheet.dataset.pageNumber)) return;
        const { x, y, w, h } = mark.rect;
        const frame = document.createElement("div"),
          badge = document.createElement("button");
        frame.className = "pdf-selection-box paper-mark";
        frame.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
        badge.textContent = `${i + 1} · ${mark.status === "completed" ? tr("已关联", "Linked") : mark.status === "failed" ? tr("重试检索", "Retry search") : tr("已检索", "Searched")}`;
        badge.title = mark.selectedText;
        badge.onpointerdown = (e) => e.stopPropagation();
        badge.onclick = () => markClick.current(mark.id);
        frame.append(badge);
        sheet.append(frame);
        if (
          pending.current.page === mark.page &&
          (pending.current.rect
            ? pending.current.rect.x === x && pending.current.rect.y === y
            : pending.current.text === mark.selectedText)
        ) {
          host.current!.scrollTop +=
            frame.getBoundingClientRect().top - host.current!.getBoundingClientRect().top - 100;
          pending.current = { page: 0, text: "", token: 0 };
        }
      });
    });
  };
  const [pages, setPages] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof getDocument> | undefined;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const instance = new PDFViewer({ container: host.current!, eventBus, linkService });
    viewer.current = instance;
    linkService.setViewer(instance);
    let ready = false;
    const saved = positions.get(paperId);
    eventBus.on("pagesinit", () => {
      instance.currentScaleValue = "page-width";
      const target = Math.min(jump.page || saved?.page || 1, instance.pagesCount);
      instance.scrollPageIntoView({ pageNumber: target });
      if (!jump.page && saved) {
        const sheet = instance.getPageView(target - 1).div;
        host.current!.scrollTop = sheet.offsetTop + saved.ratio * sheet.clientHeight;
      }
      ready = true;
      onPage(target);
    });
    eventBus.on("textlayerrendered", paint);
    eventBus.on("pagerendered", paint);
    eventBus.on("scalechanging", clearBox);
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      if (ready) onPage(pageNumber);
    });
    eventBus.on("updateviewarea", () => {
      if (!ready) return;
      const sheets = [...host.current!.querySelectorAll<HTMLElement>(".page")];
      const sheet = sheets.filter((p) => p.offsetTop <= host.current!.scrollTop + 5).at(-1) || sheets[0];
      if (sheet)
        positions.set(paperId, {
          page: Number(sheet.dataset.pageNumber),
          ratio: (host.current!.scrollTop - sheet.offsetTop) / sheet.clientHeight,
        });
    });
    const resize = new ResizeObserver(() => {
      if (instance.pagesCount) instance.currentScaleValue = instance.currentScaleValue;
    });
    resize.observe(host.current!);
    setError("");
    setPages(0);
    void (async () => {
      const data = await window.paperTree.readPdf(paperId);
      if (cancelled) return;
      loading = getDocument({ data });
      const pdf = await loading.promise;
      if (cancelled) return;
      setPages(pdf.numPages);
      linkService.setDocument(pdf);
      instance.setDocument(pdf);
    })().catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
      ready = false;
      resize.disconnect();
      instance.setDocument(null!);
      viewer.current = null;
      void loading?.destroy();
    };
  }, [paperId]);
  useEffect(() => {
    pending.current = jump;
    if (jump.page && viewer.current?.pagesCount) viewer.current.scrollPageIntoView({ pageNumber: jump.page });
    paint();
  }, [jump]);
  useEffect(paint, [marks, document.documentElement.lang]);
  return (
    <section
      className="reader"
      onKeyDown={(e) => {
        if (e.key === "Escape") clearBox();
      }}
    >
      {marks.length > 0 && (
        <select
          className="search-bookmarks"
          aria-label={tr("已检索的位置", "Search bookmarks")}
          value=""
          onChange={(e) => onMark(e.target.value)}
        >
          <option value="">◉ {tr("探索记录", "Search history")} {marks.length} · {tr("定位原文 / 重开结果", "Jump to source / results")}</option>
          {marks.map((m) => (
            <option key={m.id} value={m.id}>
              p.{m.page} · {m.selectedText} ·{" "}
              {m.status === "completed" ? tr("已关联", "Linked") : m.status === "failed" ? tr("检索失败", "Search failed") : tr("已检索", "Searched")}
            </option>
          ))}
        </select>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="pdf-stage">
        <div
          className={`pdf-scroll ${boxing ? "box-mode" : ""}`}
          tabIndex={0}
          onPointerDown={(e) => {
            if (!boxing || e.button !== 0) return;
            const sheet = (e.target as HTMLElement).closest<HTMLElement>(".page");
            if (!sheet) return;
            e.preventDefault();
            window.getSelection()?.removeAllRanges();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e, sheet);
            drag.current = { sheet, ...p };
            setBox({ sheet, ...p, w: 0, h: 0, text: "" });
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start) return;
            const p = point(e, start.sheet);
            setBox({
              sheet: start.sheet,
              x: Math.min(start.x, p.x),
              y: Math.min(start.y, p.y),
              w: Math.abs(p.x - start.x),
              h: Math.abs(p.y - start.y),
              text: "",
            });
          }}
          onPointerUp={finishBox}
          onPointerCancel={clearBox}
          ref={host}
        >
          <div className="pdfViewer" />
        </div>
        <div className="reader-tools" role="toolbar" aria-label={tr("阅读工具栏", "Reading toolbar")}>
          {[false, true].map((search) => (
            <button
              key={String(search)}
              className="mode-tool"
              aria-label={search ? tr("框选检索", "Area search") : tr("阅读浏览", "Read")}
              title={search ? tr("框选检索：拖出矩形选区", "Area search: drag a rectangle") : tr("阅读浏览：滚动查看论文", "Read: scroll through the paper")}
              aria-pressed={boxing === search}
              onClick={() => {
                setBoxing(search);
                clearBox();
              }}
            >
              <svg viewBox="0 0 28 28" aria-hidden="true">
                <path
                  d={
                    search
                      ? "M4 3V20L8 15H12Z M24 17a5 5 0 1 1-10 0a5 5 0 1 1 10 0 M22.5 20.5l4 4"
                      : "M7 3 7 23 12 17 17 24 20 22 15 15 23 15Z"
                  }
                />
              </svg>
            </button>
          ))}
          <span>
            {tr("第", "Page")} {page} / {pages || "…"} {tr("页", "")}
          </span>
          <select
            aria-label={tr("缩放", "Zoom")}
            defaultValue="page-width"
            onChange={(e) => {
              if (viewer.current) viewer.current.currentScaleValue = e.target.value;
            }}
          >
            <option value="page-width">{tr("适合宽度", "Fit width")}</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
          </select>
        </div>
      </div>
      {box &&
        createPortal(
          <div
            className="pdf-selection-box"
            aria-label={tr("框选区域", "Selected area")}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            {!drag.current && (
              <div className="box-actions" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  disabled={!box.text || busy}
                  title={box.text || tr("此区域没有可读取文字；扫描图片 OCR 尚未接入", "No readable text in this area; OCR is not available yet")}
                  onClick={() => {
                    const { x, y, w, h } = box;
                    onAssociate(box.text, Number(box.sheet.dataset.pageNumber), { x, y, w, h });
                    clearBox();
                  }}
                >
                  {busy ? tr("检索中…", "Searching…") : box.text ? tr("关联框内内容 ↗", "Find related papers ↗") : tr("未读取到文字", "No text found")}
                </button>
                <button aria-label={tr("清除选框", "Clear selection")} onClick={clearBox}>
                  ×
                </button>
              </div>
            )}
          </div>,
          box.sheet,
        )}
    </section>
  );
}
