import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader({
  paperId,
  page,
  onPage,
  onSelection,
}: {
  paperId: string;
  page: number;
  onPage: (page: number) => void;
  onSelection: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const callbacks = useRef({ onPage, onSelection, page });
  callbacks.current = { onPage, onSelection, page };
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState("page-width");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof getDocument> | undefined;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const instance = new PDFViewer({ container: host.current!, eventBus, linkService });
    viewer.current = instance;
    linkService.setViewer(instance);
    eventBus.on("pagesinit", () => {
      instance.currentScaleValue = "page-width";
      instance.currentPageNumber = Math.min(callbacks.current.page, instance.pagesCount);
    });
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => callbacks.current.onPage(pageNumber));
    const resize = new ResizeObserver(() => {
      if (instance.pagesCount) instance.currentScaleValue = instance.currentScaleValue;
    });
    resize.observe(host.current!);
    setError("");
    setPages(0);
    setZoom("page-width");
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
      resize.disconnect();
      instance.setDocument(null!);
      viewer.current = null;
      void loading?.destroy();
    };
  }, [paperId]);
  useEffect(() => {
    if (viewer.current?.pagesCount && viewer.current.currentPageNumber !== page)
      viewer.current.currentPageNumber = page;
  }, [page]);
  return (
    <section className="reader">
      <div className="reader-tools">
        <span>
          连续阅读 · 第 {page} / {pages || "…"} 页
        </span>
        <select
          aria-label="缩放"
          value={zoom}
          onChange={(e) => {
            setZoom(e.target.value);
            if (viewer.current) viewer.current.currentScaleValue = e.target.value;
          }}
        >
          <option value="page-width">适合宽度</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="pdf-stage">
        <div
          className="pdf-scroll"
          ref={host}
          onMouseUp={() => {
            const selection = window.getSelection();
            const source = selection?.anchorNode?.parentElement?.closest(".page");
            if (source) callbacks.current.onPage(Number(source.getAttribute("data-page-number")));
            callbacks.current.onSelection(selection?.toString().trim() || "");
          }}
        >
          <div className="pdfViewer" />
        </div>
      </div>
    </section>
  );
}
