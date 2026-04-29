"use client";
/**
 * ContentEditor — a contenteditable rich editor that supports:
 *   - Plain text typing (HTML from clipboard is stripped to plain text)
 *   - Inline image paste (compressed to inlineImageMaxSizeMB from config)
 *   - Visual inline display so images appear at cursor position
 *
 * Accessed via ref: editorRef.current.getHTML() / .isEmpty()
 */
import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import runtimeConfig from "../../config/config.json";

const MAX_IMAGE_MB: number = (runtimeConfig as any).inlineImageMaxSizeMB ?? 3;

async function compressImageToDataUrl(blob: Blob, maxMB: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const maxBytes = maxMB * 1024 * 1024;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const MAX_DIM = 2400;
            if (w > MAX_DIM || h > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            let quality = 0.85;
            let dataUrl = canvas.toDataURL("image/jpeg", quality);
            let bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            while (bytes > maxBytes && quality > 0.3) {
                quality = Math.round((quality - 0.1) * 10) / 10;
                dataUrl = canvas.toDataURL("image/jpeg", quality);
                bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            }
            while (bytes > maxBytes && (w > 400 || h > 400)) {
                w = Math.round(w * 0.8);
                h = Math.round(h * 0.8);
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                dataUrl = canvas.toDataURL("image/jpeg", quality);
                bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            }
            resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = url;
    });
}

export type ContentEditorRef = {
    getHTML: () => string;
    isEmpty: () => boolean;
};

type ContentEditorProps = {
    initialContent?: string;
    disabled?: boolean;
    placeholder?: string;
    hasError?: boolean;
};

const ContentEditor = forwardRef<ContentEditorRef, ContentEditorProps>(
    ({ initialContent = "", disabled = false, placeholder = "Write your blog content here...", hasError = false }, ref) => {
        const divRef = useRef<HTMLDivElement>(null);
        const hydrated = useRef(false);
        const [showPlaceholder, setShowPlaceholder] = useState(!initialContent);

        useImperativeHandle(ref, () => ({
            getHTML: () => divRef.current?.innerHTML ?? "",
            isEmpty: () => !divRef.current?.innerText?.trim(),
        }));

        useEffect(() => {
            if (divRef.current && initialContent && !hydrated.current) {
                divRef.current.innerHTML = initialContent;
                setShowPlaceholder(false);
                hydrated.current = true;
            }
        }, [initialContent]);

        const updatePlaceholder = () => {
            setShowPlaceholder(!divRef.current?.innerText?.trim());
        };

        const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
            const items = Array.from(e.clipboardData.items);
            const imageItem = items.find(it => it.type.startsWith("image/"));

            if (!imageItem) {
                // Non-image paste: strip HTML and insert plain text only
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
                updatePlaceholder();
                return;
            }

            e.preventDefault();
            const blob = imageItem.getAsFile();
            if (!blob) return;

            // Insert pending indicator at cursor
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

            try {
                const dataUrl = await compressImageToDataUrl(blob, MAX_IMAGE_MB);
                const img = document.createElement("img");
                img.src = dataUrl;
                img.alt = "inline image";
                img.style.cssText =
                    "max-width:100%;height:auto;border-radius:4px;" +
                    "display:inline-block;vertical-align:middle;margin:2px 0;";
                img.dataset.inline = "true";
                pending.replaceWith(img);
                // Move cursor after image
                const s = window.getSelection();
                if (s) {
                    const r = document.createRange();
                    r.setStartAfter(img);
                    r.collapse(true);
                    s.removeAllRanges();
                    s.addRange(r);
                }
            } catch {
                pending.remove();
            }
            setShowPlaceholder(false);
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
                <div
                    ref={divRef}
                    contentEditable={disabled ? "false" : "true"}
                    suppressContentEditableWarning
                    onInput={updatePlaceholder}
                    onFocus={() => setShowPlaceholder(false)}
                    onBlur={updatePlaceholder}
                    onPaste={handlePaste}
                    className={`flex-1 min-h-[480px] lg:min-h-[72vh] w-full bg-slate-950 border rounded-xl px-4 py-3 outline-none transition-all text-slate-100 text-sm leading-6 overflow-x-hidden break-words ${borderClass} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                />
            </div>
        );
    }
);

ContentEditor.displayName = "ContentEditor";
export default ContentEditor;
