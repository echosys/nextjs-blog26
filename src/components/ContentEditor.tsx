"use client";
/**
 * ContentEditor — contenteditable WYSIWYG editor with:
 *   - Inline image paste compressed to inlineImageMaxSizeMB
 *   - Images inserted as resizable thumbnails (max inlineThumbnailMaxPx on longest side)
 *   - Resize by dragging right/bottom edge (capped at inlineThumbnailMaxResizePx)
 *   - getInlineImages() returns { id, dataUrl, fileName, sizeKB }[] for sidebar attachment list
 *   - removeInlineImage(id) removes image from DOM and fires onInlineImagesChange
 */
import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import runtimeConfig from "../../config/config.json";

const MAX_IMAGE_MB: number = (runtimeConfig as any).inlineImageMaxSizeMB ?? 3;
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
};

async function compressImageToDataUrl(blob: Blob, maxMB: number): Promise<{ dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxBytes = maxMB * 1024 * 1024;
      // Keep reasonable max resolution (2400px) but do NOT scale to thumbnail — thumbnail is CSS only
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const MAX_DIM = 2400;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.85;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      let bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
      // Reduce quality to fit under maxMB
      while (bytes > maxBytes && quality > 0.3) {
        quality = Math.round((quality - 0.1) * 10) / 10;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
        bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
      }
      // If still too big, also reduce resolution
      while (bytes > maxBytes && (w > 400 || h > 400)) {
        w = Math.round(w * 0.8);
        h = Math.round(h * 0.8);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        dataUrl = canvas.toDataURL("image/jpeg", quality);
        bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
      }
      resolve({ dataUrl, sizeKB: Math.round(bytes / 1024) });
    };
    img.onerror = reject;
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
    },
    ref
  ) => {
    const divRef = useRef<HTMLDivElement>(null);
    const hydrated = useRef(false);
    const [showPlaceholder, setShowPlaceholder] = useState(!initialContent);
    const [isPasting, setIsPasting] = useState(false);

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
        }
      },
    }));

    useEffect(() => {
      if (divRef.current && initialContent && !hydrated.current) {
        divRef.current.innerHTML = initialContent;
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
        const { dataUrl, sizeKB } = await compressImageToDataUrl(blob, MAX_IMAGE_MB);
        const img = makeImgElement(dataUrl, id, THUMB_PX);
        img.dataset.fileName = originalName ?? `pasted-${id}.jpg`;
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
