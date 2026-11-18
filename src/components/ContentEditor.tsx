"use client";
/**
 * ContentEditor — contenteditable WYSIWYG editor with:
 *   - Pasted images re-encoded to ~inlineImageTargetKB (longest side ≤ inlineImageMaxDimensionPx)
 *   - Images inserted as resizable thumbnails (max inlineThumbnailMaxPx on longest side)
 *   - Resize by dragging right/bottom edge (capped at inlineThumbnailMaxResizePx)
 *   - getInlineImages() returns { id, dataUrl, fileName, sizeKB }[] for sidebar attachment list
 *   - removeInlineImage(id) removes image from DOM and fires onInlineImagesChange
 */
import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import DOMPurify from "dompurify";
import runtimeConfig from "../../config/config.json";

const TARGET_BYTES: number = (runtimeConfig.inlineImageTargetKB ?? 250) * 1024;
const MAX_DIM: number = runtimeConfig.inlineImageMaxDimensionPx ?? 1920;
const THUMB_PX: number = (runtimeConfig as any).inlineThumbnailMaxPx ?? 100;
const THUMB_MAX_PX: number = (runtimeConfig as any).inlineThumbnailMaxResizePx ?? 400;

export type InlineImageItem = {
  id: string;
  dataUrl: string;
  fileName: string;
  sizeKB: number;
};

export type ContentEditorRef = {
  getHTML: () => string;
  isEmpty: () => boolean;
  getInlineImages: () => InlineImageItem[];
  removeInlineImage: (id: string) => void;
};

type ContentEditorProps = {
  initialContent?: string;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  onInlineImagesChange?: (images: InlineImageItem[]) => void;
  /** Fired on any user edit (typing, paste, inline image removal) — useful for dirty-state tracking. */
  onChange?: () => void;
};

async function compressImageToDataUrl(blob: Blob, maxBytes: number, maxDim: number): Promise<{ dataUrl: string; sizeKB: number; reencoded: boolean }> {
  // Already small: keep the original bytes (and format, e.g. PNG transparency).
  if (blob.size <= maxBytes) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, sizeKB: Math.round(blob.size / 1024), reencoded: false });
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        canvas.width = w; canvas.height = h;
        // JPEG has no alpha; without a fill, transparent areas turn black.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      };
      draw();

      function estimateBytes(du: string) {
        return Math.round((du.length - du.indexOf(",") - 1) * 0.75);
      }

      // Binary search over quality: find highest quality that fits under maxBytes
      let lo = 0.4, hi = 0.9;
      let dataUrl = canvas.toDataURL("image/jpeg", lo);
      let bytes = estimateBytes(dataUrl);
      for (let iter = 0; iter < 7 && bytes <= maxBytes; iter++) {
        const mid = Math.round(((lo + hi) / 2) * 100) / 100;
        const trial = canvas.toDataURL("image/jpeg", mid);
        const trialBytes = estimateBytes(trial);
        if (trialBytes <= maxBytes) { lo = mid; dataUrl = trial; bytes = trialBytes; }
        else { hi = mid; }
      }

      // Still too big at the lowest quality: shrink dimensions until it fits.
      while (bytes > maxBytes && Math.max(w, h) > 320) {
        w = Math.round(w * 0.85); h = Math.round(h * 0.85);
        draw();
        dataUrl = canvas.toDataURL("image/jpeg", lo);
        bytes = estimateBytes(dataUrl);
      }

      resolve({ dataUrl, sizeKB: Math.round(bytes / 1024), reencoded: true });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unsupported image")); };
    img.src = url;
  });
}

function makeImgElement(dataUrl: string, id: string, thumbPx: number): HTMLImageElement {
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "inline image";
  img.dataset.inlineId = id;
  // Display as thumbnail; user can drag to resize up to THUMB_MAX_PX
  img.style.cssText =
    `width:${thumbPx}px;height:auto;max-width:${THUMB_MAX_PX}px;` +
    `border-radius:4px;display:inline-block;vertical-align:middle;` +
    `margin:2px 4px;cursor:default;resize:both;overflow:hidden;` +
    `box-shadow:0 0 0 1px #334155;`;
  return img;
}

const ContentEditor = forwardRef<ContentEditorRef, ContentEditorProps>(
  (
    {
      initialContent = "",
      disabled = false,
      placeholder = "Write your blog content here...",
      hasError = false,
      onInlineImagesChange,
      onChange,
    },
    ref
  ) => {
    const divRef = useRef<HTMLDivElement>(null);
    const hydrated = useRef(false);
    const [showPlaceholder, setShowPlaceholder] = useState(!initialContent);
    const [isPasting, setIsPasting] = useState(false);

    // Keep latest callback in a ref so the MutationObserver never captures a stale closure
    const onInlineImagesChangeRef = useRef(onInlineImagesChange);
    useEffect(() => { onInlineImagesChangeRef.current = onInlineImagesChange; });

    // Collect inline images from current DOM
    const collectInlineImages = useCallback((): InlineImageItem[] => {
      if (!divRef.current) return [];
      return Array.from(divRef.current.querySelectorAll<HTMLImageElement>("img[data-inline-id]")).map(img => ({
        id: img.dataset.inlineId!,
        dataUrl: img.src,
        fileName: img.dataset.fileName ?? `image-${img.dataset.inlineId}.jpg`,
        sizeKB: Number(img.dataset.sizeKb ?? 0),
      }));
    }, []);

    useImperativeHandle(ref, () => ({
      getHTML: () => divRef.current?.innerHTML ?? "",
      isEmpty: () => {
        const div = divRef.current;
        if (!div) return true;
        if (div.innerText?.trim()) return false;
        if (div.querySelector("img[data-inline-id]")) return false;
        return true;
      },
      getInlineImages: collectInlineImages,
      removeInlineImage: (id: string) => {
        const img = divRef.current?.querySelector(`img[data-inline-id="${id}"]`);
        if (img) {
          img.remove();
          onInlineImagesChange?.(collectInlineImages());
          onChange?.();
        }
      },
    }));

    // Sync sidebar when images are removed (or any DOM change in the editor)
    useEffect(() => {
      const div = divRef.current;
      if (!div) return;
      const observer = new MutationObserver(() => {
        const imgs = Array.from(div.querySelectorAll<HTMLImageElement>("img[data-inline-id]"));
        const images: InlineImageItem[] = imgs.map(img => ({
          id: img.dataset.inlineId!,
          dataUrl: img.src,
          fileName: img.dataset.fileName ?? `image-${img.dataset.inlineId}.jpg`,
          sizeKB: Number(img.dataset.sizeKb ?? 0),
        }));
        onInlineImagesChangeRef.current?.(images);
        setShowPlaceholder(!div.innerText?.trim() && images.length === 0);
      });
      observer.observe(div, { childList: true, subtree: true });
      return () => observer.disconnect();
    }, []); // empty — div is stable after mount, callback accessed via ref

    useEffect(() => {
      if (divRef.current && initialContent && !hydrated.current) {
        divRef.current.innerHTML = DOMPurify.sanitize(initialContent);
        setShowPlaceholder(false);
        hydrated.current = true;
        // Notify parent of any inline images already in initial content
        onInlineImagesChange?.(collectInlineImages());
      }
    }, [initialContent, collectInlineImages, onInlineImagesChange]);

    const updatePlaceholder = () => {
      const div = divRef.current;
      const hasText = Boolean(div?.innerText?.trim());
      const hasImage = Boolean(div?.querySelector("img[data-inline-id]"));
      setShowPlaceholder(!hasText && !hasImage);
      onChange?.();
    };

    const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find(it => it.type.startsWith("image/"));

      if (!imageItem) {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        updatePlaceholder();
        return;
      }

      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;

      // Insert pending indicator
      const pending = document.createElement("span");
      pending.style.cssText =
        "display:inline-block;background:#0f172a;border:1px dashed #334155;" +
        "border-radius:4px;padding:2px 8px;font-size:11px;color:#64748b;";
      pending.textContent = "⏳ compressing…";
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(pending);
        range.setStartAfter(pending);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      setIsPasting(true);
      try {
        const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        // Preserve original filename if the clipboard item has one (works for copied files, not screenshots)
        const originalName = (blob as File).name && !(blob as File).name.startsWith("image.") ? (blob as File).name : null;
        const { dataUrl, sizeKB, reencoded } = await compressImageToDataUrl(blob, TARGET_BYTES, MAX_DIM);
        const img = makeImgElement(dataUrl, id, THUMB_PX);
        const extension = reencoded ? "jpg" : (blob.type.split("/")[1] || "png");
        img.dataset.fileName = originalName ?? `pasted-${id}.${extension}`;
        img.dataset.sizeKb = String(sizeKB);
        pending.replaceWith(img);
        const s = window.getSelection();
        if (s) {
          const r = document.createRange();
          r.setStartAfter(img);
          r.collapse(true);
          s.removeAllRanges();
          s.addRange(r);
        }
        onInlineImagesChange?.(collectInlineImages());
        onChange?.();
      } catch {
        pending.remove();
      } finally {
        setIsPasting(false);
        setShowPlaceholder(false);
      }
    };

    const borderClass = hasError
      ? "ring-2 ring-rose-500 border-rose-800"
      : "border-slate-800 focus:ring-2 focus:ring-teal-500";

    return (
      <div className="relative flex-1 flex flex-col min-h-[480px] lg:min-h-[72vh]">
        {showPlaceholder && (
          <span className="absolute top-3 left-4 text-sm text-slate-700 pointer-events-none select-none z-10">
            {placeholder}
          </span>
        )}
        {isPasting && (
          <span className="absolute top-2 right-3 text-[10px] text-slate-500 pointer-events-none z-10 animate-pulse">
            compressing…
          </span>
        )}
        <div
          ref={divRef}
          contentEditable={disabled ? "false" : "true"}
          suppressContentEditableWarning
          onInput={updatePlaceholder}
          onFocus={() => setShowPlaceholder(false)}
          onBlur={updatePlaceholder}
          onPaste={handlePaste}
          className={`flex-1 min-h-[480px] lg:min-h-[72vh] w-full bg-slate-950 border rounded-xl px-4 py-3 outline-none transition-all text-slate-100 text-sm leading-6 overflow-x-hidden break-all ${borderClass} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
      </div>
    );
  }
);

ContentEditor.displayName = "ContentEditor";
export default ContentEditor;
