"use client";
import Link from "next/link";
import {
    Save, Upload, Tags, X, CheckCircle2, Image as ImageIcon, Download,
    ChevronLeft, ChevronRight, Maximize2,
} from "lucide-react";
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import ContentEditor, { type ContentEditorRef, type InlineImageItem } from "./ContentEditor";
import DiscardChangesDialog from "./DiscardChangesDialog";
import { extractInlineImages, dataUrlToBase64, buildAttachmentMetadata, parseAttachmentMetadata, formatBytes, type InlineImageMeta, type FileAttachmentMeta } from "../lib/inlineImages";
import { loadInlineImagesForEdit } from "../lib/useInlineImages";

const CHUNK_SIZE = 1024 * 1024 * 2;
// Inline image chunks always start at this offset to avoid conflicting with file chunks (0..N-1)
const INLINE_BASE = 1000;

type PgPost = {
    id: number;
    title: string;
    content: string;
    tags?: string[];
    attachment_name?: string | null;
};

export type EditFormHandle = {
    /** Attempt to navigate to another post (or close, when targetId is null). Runs the same
     *  dirty-check/discard-confirm gate as the in-form Prev/Next buttons. */
    requestNavigate: (targetId: string | null) => void;
};

type PendingAction = { type: "navigate"; targetId: string } | { type: "close" };

interface PgEditFormProps {
    id: string;
    variant: "page" | "panel";
    prevId?: string | null;
    nextId?: string | null;
    onNavigate: (targetId: string) => void;
    /** panel variant only: exit quick edit back to the full list */
    onClose?: () => void;
    /** panel variant only: called after a successful save (page variant redirects instead) */
    onSaved?: (id: string) => void;
}

const PgEditForm = forwardRef<EditFormHandle, PgEditFormProps>(function PgEditForm(
    { id: idStr, variant, prevId, nextId, onNavigate, onClose, onSaved },
    ref
) {
    const id = Number(idStr || "0");
    const [post, setPost] = useState<PgPost | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileObj, setFileObj] = useState<File | null>(null);
    const [inlineImages, setInlineImages] = useState<InlineImageItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const [contentError, setContentError] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<ContentEditorRef>(null);

    const markDirty = () => setIsDirty(true);
    const handleRemoveInline = (imgId: string) => { editorRef.current?.removeInlineImage(imgId); markDirty(); };

    useEffect(() => {
        async function load() {
            if (!Number.isFinite(id) || id <= 0) { setIsLoading(false); return; }
            setIsLoading(true);
            try {
                const res = await fetch(`/api/pg_blogs?id=${id}`);
                if (!res.ok) { setPost(null); return; }
                let data: PgPost = await res.json();
                if (data) {
                    const metadata = parseAttachmentMetadata(data.attachment_name ?? null);
                    const contentWithImages = await loadInlineImagesForEdit(id, data.content, metadata.inline_images ?? []);
                    data = { ...data, content: contentWithImages };

                    setPost(data);
                    setFileName(metadata.file?.name ?? null);
                    setFileObj(null);
                    setIsDirty(false);
                    setSubmitError(null);
                    setContentError(false);
                }
            } catch (err) {
                console.error("Failed to load post", err);
                setPost(null);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setFileName(file?.name ?? null);
        setFileObj(file);
        markDirty();
    };

    const attemptNavigate = (targetId: string | null | undefined) => {
        if (!targetId) return;
        if (isDirty) { setPendingAction({ type: "navigate", targetId }); return; }
        onNavigate(targetId);
    };

    const attemptClose = () => {
        if (isDirty) { setPendingAction({ type: "close" }); return; }
        onClose?.();
    };

    useImperativeHandle(ref, () => ({
        requestNavigate: (targetId: string | null) => {
            if (targetId === null) attemptClose();
            else attemptNavigate(targetId);
        },
    }));

    const resolvePendingAction = () => {
        const action = pendingAction;
        setPendingAction(null);
        if (!action) return;
        if (action.type === "navigate") onNavigate(action.targetId);
        else onClose?.();
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;
        const rawContent = editorRef.current?.getHTML() ?? "";
        if (editorRef.current?.isEmpty()) { setContentError(true); return; }
        setContentError(false);
        setSubmitError(null);
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadStatus("Updating post...");
        const formData = new FormData(e.currentTarget);
        const title = (formData.get("title") as string) ?? "";
        const tagsInput = (formData.get("tags") as string) ?? "";
        const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
        const hasNewFile = Boolean(fileObj && fileObj.size > 0);
        const existingMeta = parseAttachmentMetadata(post?.attachment_name ?? null);
        const hadFile = Boolean(existingMeta.file?.name);
        const isRemovingFile = hadFile && !fileName;

        try {
            const { cleanContent, images: extractedImages } = extractInlineImages(rawContent);

            let inlineImageMeta: InlineImageMeta[];
            let fileMeta: FileAttachmentMeta | null;
            let fileChunkCount: number;

            if (hasNewFile && fileObj) {
                fileChunkCount = Math.ceil(fileObj.size / CHUNK_SIZE);
                fileMeta = { name: fileObj.name, chunks: Array.from({ length: fileChunkCount }, (_, i) => i), size: fileObj.size };
            } else if (isRemovingFile) {
                fileChunkCount = 0;
                fileMeta = null;
            } else {
                fileChunkCount = 0;
                fileMeta = existingMeta.file ?? null;
            }

            inlineImageMeta = extractedImages.map((img, i) => ({
                id: img.id,
                name: img.name,
                chunks: [INLINE_BASE + i],
            }));

            const newAttachmentName = buildAttachmentMetadata(fileMeta, inlineImageMeta);

            const updateRes = await fetch("/api/pg_blogs", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id, title, content: cleanContent, tags,
                    attachment_name: newAttachmentName,
                    clear_attachment: isRemovingFile,
                }),
            });
            if (!updateRes.ok) {
                const err = await updateRes.json().catch(() => ({}));
                throw new Error((err as any)?.error ?? `Server error ${updateRes.status}`);
            }

            for (let i = 0; i < extractedImages.length; i++) {
                const img = extractedImages[i];
                const chunkIdx = inlineImageMeta[i].chunks[0];
                setUploadStatus(`Uploading inline image ${i + 1} of ${extractedImages.length}...`);
                const base64 = dataUrlToBase64(img.dataUrl);
                const imgRes = await fetch(`/api/pg_blogs/inline-images?id=${id}&chunkIndex=${chunkIdx}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: base64 }),
                });
                if (!imgRes.ok) {
                    const err = await imgRes.json().catch(() => ({}));
                    throw new Error(`Inline image ${i + 1} upload failed: ${(err as any)?.error ?? imgRes.status}`);
                }
                setUploadProgress(Math.round(((i + 1) / (extractedImages.length + fileChunkCount)) * 100));
            }

            if (hasNewFile && fileObj && fileChunkCount > 0) {
                setTotalMB(Number((fileObj.size / (1024 * 1024)).toFixed(1)));
                for (let i = 0; i < fileChunkCount; i++) {
                    const start = i * CHUNK_SIZE;
                    const chunk = fileObj.slice(start, Math.min(start + CHUNK_SIZE, fileObj.size));
                    setUploadStatus(`Uploading file chunk ${i + 1} of ${fileChunkCount}...`);
                    const base64: string = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(chunk);
                    });
                    const chunkRes = await fetch(`/api/pg_blogs/chunks?id=${id}&index=${i}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: base64 }),
                    });
                    if (!chunkRes.ok) throw new Error(`File chunk ${i + 1} upload failed`);
                    setUploadedMB(Number((Math.min((i + 1) * CHUNK_SIZE, fileObj.size) / (1024 * 1024)).toFixed(1)));
                    const baseProgress = Math.round((extractedImages.length / (extractedImages.length + fileChunkCount)) * 100);
                    setUploadProgress(baseProgress + Math.round(((i + 1) / fileChunkCount) * (100 - baseProgress)));
                }
            }

            setUploadProgress(100);
            setUploadStatus("Done!");
            setIsDirty(false);
            if (variant === "panel") {
                setIsSubmitting(false);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 2000);
                onSaved?.(idStr);
            } else {
                window.location.href = `/pg?success=true&previewId=${id}`;
            }
        } catch (err: any) {
            setSubmitError(err.message ?? "Update failed. Please try again.");
            setIsSubmitting(false);
        }
    };

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-8 h-8 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
        </div>
    );
    if (!post) return (
        <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-4">Post not found</h2>
            <Link href="/pg" className="text-teal-400 hover:underline">Back to Blog</Link>
        </div>
    );

    const uploadPct = totalMB > 0 ? `${uploadedMB}MB / ${totalMB}MB (${uploadProgress}%)` : `${uploadProgress}%`;
    const existingFileMeta = parseAttachmentMetadata(post.attachment_name ?? null).file;
    const attachmentSizeLabel = fileObj
        ? formatBytes(fileObj.size)
        : existingFileMeta?.size != null ? formatBytes(existingFileMeta.size) : null;
    const isPanel = variant === "panel";
    const formId = `pg-edit-form-${idStr}`;

    return (
        <div className={isPanel ? "" : "max-w-6xl mx-auto"}>
            {isSubmitting && (<>
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[49]" />
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl space-y-4 ring-1 ring-white/10 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-200 flex items-center gap-3">
                                {uploadProgress === 100 ? <CheckCircle2 size={20} className="text-teal-400" /> : <div className="w-4 h-4 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />}
                                <span className="font-medium">{uploadStatus}</span>
                            </span>
                            <span className="text-teal-400 font-bold tabular-nums">{uploadPct}</span>
                        </div>
                        <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                            <div className="bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(20,184,166,0.3)]" style={{ width: `${uploadProgress}%` }} />
                        </div>
                    </div>
                </div>
            </>)}
            <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className={isPanel ? "text-xl font-bold" : "text-3xl font-bold"}>
                    {isPanel ? "Quick Edit" : "Edit Post"}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                    {savedFlash && (
                        <span className="flex items-center gap-1.5 text-xs text-teal-400 mr-1">
                            <CheckCircle2 size={14} /> Saved
                        </span>
                    )}
                    {isPanel && (
                        <button type="submit" form={formId} disabled={isSubmitting}
                            className="flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-teal-500/20 mr-1">
                            {isSubmitting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                            {isSubmitting ? "Saving..." : "Save"}
                        </button>
                    )}
                    {(prevId !== undefined || nextId !== undefined) && (
                        <>
                            <button type="button" disabled={!prevId} onClick={() => attemptNavigate(prevId)}
                                title="Previous post"
                                className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none">
                                <ChevronLeft size={18} />
                            </button>
                            <button type="button" disabled={!nextId} onClick={() => attemptNavigate(nextId)}
                                title="Next post"
                                className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none">
                                <ChevronRight size={18} />
                            </button>
                        </>
                    )}
                    {isPanel && (
                        <>
                            <Link href={`/pg/edit/${idStr}`} title="Open full editor"
                                className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all">
                                <Maximize2 size={16} />
                            </Link>
                            <button type="button" onClick={attemptClose} title="Close quick edit"
                                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all">
                                <X size={18} />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <form id={formId} onSubmit={handleSubmit} className={isPanel ? "flex flex-col gap-4" : "grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]"}>
                {isPanel ? (
                    <>
                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
                                <div className="space-y-1.5">
                                    <label htmlFor={`pg-title-${idStr}`} className="text-xs font-medium text-slate-400">Title</label>
                                    <input id={`pg-title-${idStr}`} name="title" type="text" required disabled={isSubmitting}
                                        onChange={markDirty}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50 text-sm"
                                        placeholder="Enter post title..." defaultValue={post.title} />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor={`pg-tags-${idStr}`} className="text-xs font-medium text-slate-400 flex items-center gap-1.5"><Tags size={12} /> Tags</label>
                                    <input id={`pg-tags-${idStr}`} name="tags" type="text" disabled={isSubmitting}
                                        onChange={markDirty}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50 text-sm"
                                        defaultValue={post.tags?.join(", ")} placeholder="tech, news, vercel" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Attachment</label>
                                    {fileName ? (
                                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                                            <Upload size={12} className="text-teal-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-slate-300 truncate">{fileName}</p>
                                            </div>
                                            {!fileObj && (
                                                <a href={`/api/pg_blogs/download/${idStr}`} download={fileName}
                                                    className="text-slate-600 hover:text-teal-400 transition-colors shrink-0"><Download size={12} /></a>
                                            )}
                                            <button type="button" disabled={isSubmitting} onClick={() => { setFileName(null); setFileObj(null); if (fileInputRef.current) fileInputRef.current.value = ""; markDirty(); }} className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"><X size={12} /></button>
                                        </div>
                                    ) : (
                                        <div className={`group flex items-center gap-2 border border-dashed border-slate-800 rounded-lg px-2.5 py-2 transition-all hover:border-slate-600 ${isSubmitting ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                                            onClick={() => fileInputRef.current?.click()}>
                                            <Upload size={13} className="text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                                            <span className="text-slate-500 group-hover:text-slate-400 text-xs transition-colors truncate">Click to attach</span>
                                        </div>
                                    )}
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} disabled={isSubmitting} className="hidden" />
                                </div>
                            </div>
                            {inlineImages.length > 0 && (
                                <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1"><ImageIcon size={11} /> Inline Images</p>
                                    <div className="flex flex-wrap gap-2">
                                        {inlineImages.map(img => (
                                            <div key={img.id} className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                                                <img src={img.dataUrl} alt="" className="w-6 h-6 object-cover rounded shrink-0" />
                                                <span className="text-xs text-slate-300 truncate max-w-[100px]">{img.fileName}</span>
                                                <a href={img.dataUrl} download={img.fileName}
                                                    className="text-slate-600 hover:text-teal-400 transition-colors shrink-0"><Download size={12} /></a>
                                                <button type="button" onClick={() => handleRemoveInline(img.id)}
                                                    className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"><X size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {submitError && (
                                <div className="text-sm text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-xl px-3 py-2">
                                    {submitError}
                                </div>
                            )}
                        </div>
                        <section className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex flex-col flex-1 min-h-[55vh]">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-slate-400">Content <span className="ml-1 text-[11px] text-slate-600 font-normal">— paste an image to embed it inline</span></label>
                                {contentError && <span className="text-xs text-rose-400">Content is required</span>}
                            </div>
                            <ContentEditor ref={editorRef} disabled={isSubmitting} hasError={contentError} initialContent={post.content}
                                onInlineImagesChange={setInlineImages} onChange={markDirty} />
                        </section>
                    </>
                ) : (
                    <>
                        <aside className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-6 lg:sticky lg:top-6 lg:self-start">
                            <div className="space-y-2">
                                <label htmlFor={`pg-title-${idStr}`} className="text-sm font-medium text-slate-400">Title</label>
                                <input id={`pg-title-${idStr}`} name="title" type="text" required disabled={isSubmitting}
                                    onChange={markDirty}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                                    placeholder="Enter post title..." defaultValue={post.title} />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor={`pg-tags-${idStr}`} className="text-sm font-medium text-slate-400 flex items-center gap-2"><Tags size={14} /> Tags (comma separated)</label>
                                <input id={`pg-tags-${idStr}`} name="tags" type="text" disabled={isSubmitting}
                                    onChange={markDirty}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                                    defaultValue={post.tags?.join(", ")} placeholder="e.g. tech, news, vercel" />
                            </div>
                            {inlineImages.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1"><ImageIcon size={11} /> Inline Images</p>
                                    <div className="space-y-1">
                                        {inlineImages.map(img => (
                                            <div key={img.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5">
                                                <img src={img.dataUrl} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-slate-300 truncate">{img.fileName}</p>
                                                    <p className="text-[10px] text-slate-600">{img.sizeKB} KB</p>
                                                </div>
                                                <a href={img.dataUrl} download={img.fileName}
                                                    className="text-slate-600 hover:text-teal-400 transition-colors shrink-0"><Download size={13} /></a>
                                                <button type="button" onClick={() => handleRemoveInline(img.id)}
                                                    className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"><X size={13} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Attachment (Max 200 MB)</label>
                                {fileName ? (
                                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                                        <Upload size={13} className="text-teal-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-300 truncate">{fileName}</p>
                                            {attachmentSizeLabel && <p className="text-[10px] text-slate-600">{attachmentSizeLabel}</p>}
                                        </div>
                                        {!fileObj && (
                                            <a href={`/api/pg_blogs/download/${idStr}`} download={fileName}
                                                className="text-slate-600 hover:text-teal-400 transition-colors shrink-0"><Download size={13} /></a>
                                        )}
                                        <button type="button" disabled={isSubmitting} onClick={() => { setFileName(null); setFileObj(null); if (fileInputRef.current) fileInputRef.current.value = ""; markDirty(); }} className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"><X size={13} /></button>
                                    </div>
                                ) : (
                                    <div className={`group flex items-center gap-2 border border-dashed border-slate-800 rounded-lg px-3 py-2.5 transition-all hover:border-slate-600 ${isSubmitting ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                                        onClick={() => fileInputRef.current?.click()}>
                                        <Upload size={14} className="text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                                        <span className="text-slate-500 group-hover:text-slate-400 text-sm transition-colors">Click to select new attachment</span>
                                    </div>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} disabled={isSubmitting} className="hidden" />
                                <p className="text-[11px] text-slate-600">Leaves existing if not changed · large files upload in chunks</p>
                            </div>
                            <button type="submit" disabled={isSubmitting}
                                className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20">
                                {isSubmitting ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                                {isSubmitting ? "Saving..." : "Save Changes"}
                            </button>
                            {submitError && (
                                <div className="text-sm text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-xl px-4 py-3">
                                    {submitError}
                                </div>
                            )}
                        </aside>
                        <section className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col min-h-[70vh]">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-medium text-slate-400">Content <span className="ml-1 text-[11px] text-slate-600 font-normal">— paste an image to embed it inline</span></label>
                                {contentError && <span className="text-xs text-rose-400">Content is required</span>}
                            </div>
                            <ContentEditor ref={editorRef} disabled={isSubmitting} hasError={contentError} initialContent={post.content}
                                onInlineImagesChange={setInlineImages} onChange={markDirty} />
                        </section>
                    </>
                )}
            </form>
            <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
                {savedFlash && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-teal-300 bg-slate-900/95 border border-teal-500/30 backdrop-blur px-3 py-2 rounded-full shadow-lg">
                        <CheckCircle2 size={14} /> Saved
                    </span>
                )}
                <button type="submit" form={formId} disabled={isSubmitting} title="Save changes"
                    className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-full shadow-2xl shadow-teal-500/30 transition-all">
                    {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                    <span className="hidden sm:inline">{isSubmitting ? "Saving..." : "Save"}</span>
                </button>
            </div>
            <DiscardChangesDialog
                open={pendingAction !== null}
                onCancel={() => setPendingAction(null)}
                onConfirm={resolvePendingAction}
            />
        </div>
    );
});

export default PgEditForm;
