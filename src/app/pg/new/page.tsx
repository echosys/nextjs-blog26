"use client";
import Link from "next/link";
import { ArrowLeft, Save, Upload, Tags, X, CheckCircle2, Image as ImageIcon, Download } from "lucide-react";
import { useState, useRef } from "react";
import ContentEditor, { type ContentEditorRef, type InlineImageItem } from "../../../components/ContentEditor";

const CHUNK_SIZE = 1024 * 1024 * 2;

export default function PgNewPost() {
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileObj, setFileObj] = useState<File | null>(null);
    const [inlineImages, setInlineImages] = useState<InlineImageItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const [contentError, setContentError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<ContentEditorRef>(null);
    const handleRemoveInline = (id: string) => { editorRef.current?.removeInlineImage(id); };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setFileName(file?.name ?? null);
        setFileObj(file);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;
        const content = editorRef.current?.getHTML() ?? "";
        if (editorRef.current?.isEmpty()) { setContentError(true); return; }
        setContentError(false);
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadStatus("Preparing...");
        const formData = new FormData(e.currentTarget);
        const title = (formData.get("title") as string) ?? "";
        const tagsInput = (formData.get("tags") as string) ?? "";
        const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
        try {
            if (fileObj && fileObj.size > 0) {
                setTotalMB(Number((fileObj.size / (1024 * 1024)).toFixed(1)));
                setUploadStatus(`Preparing ${fileObj.name}...`);
                const initRes = await fetch("/api/pg_blogs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, content, tags, attachment_name: fileObj.name }),
                });
                if (!initRes.ok) {
                    const err = await initRes.json().catch(() => ({}));
                    throw new Error((err as any)?.error ?? `Server error ${initRes.status}`);
                }
                const { id: postId } = await initRes.json();
                const totalChunks = Math.ceil(fileObj.size / CHUNK_SIZE);
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const chunk = fileObj.slice(start, Math.min(start + CHUNK_SIZE, fileObj.size));
                    setUploadStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`);
                    const base64: string = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(chunk);
                    });
                    const chunkRes = await fetch(`/api/pg_blogs/chunks?id=${postId}&index=${i}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: base64 }),
                    });
                    if (!chunkRes.ok) throw new Error(`Chunk ${i + 1} upload failed`);
                    setUploadedMB(Number((Math.min((i + 1) * CHUNK_SIZE, fileObj.size) / (1024 * 1024)).toFixed(1)));
                    setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                }
            } else {
                setUploadStatus("Creating post...");
                const res = await fetch("/api/pg_blogs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, content, tags, attachment_name: null }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as any)?.error ?? `Server error ${res.status}`);
                }
                setUploadProgress(100);
            }
            setUploadStatus("Done!");
            window.location.href = "/pg?success=true";
        } catch (err: any) {
            setUploadStatus("Failed: " + (err.message ?? "Please try again."));
            setIsSubmitting(false);
        }
    };

    const uploadPct = totalMB > 0 ? `${uploadedMB}MB / ${totalMB}MB (${uploadProgress}%)` : `${uploadProgress}%`;

    return (
        <div className="max-w-6xl mx-auto">
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
            <div className="mb-3">
                <Link href="/pg" className="text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <ArrowLeft size={18} /> Back to Blog
                </Link>
            </div>
            <h2 className="text-3xl font-bold mb-4">Create New Post</h2>
            <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-6 lg:sticky lg:top-6 lg:self-start">
                    <div className="space-y-2">
                        <label htmlFor="title" className="text-sm font-medium text-slate-400">Title</label>
                        <input id="title" name="title" type="text" required disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="Enter post title..."  />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="tags" className="text-sm font-medium text-slate-400 flex items-center gap-2"><Tags size={14} /> Tags (comma separated)</label>
                        <input id="tags" name="tags" type="text" disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="e.g. tech, news, vercel" />
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
                        <label className="text-sm font-medium text-slate-400">Attachment (optional, up to 200 MB)</label>
                        {fileName ? (
                            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                                <Upload size={13} className="text-teal-400 shrink-0" />
                                <span className="text-slate-300 text-xs truncate flex-1 min-w-0">{fileName}</span>
                                <button type="button" disabled={isSubmitting} onClick={() => { setFileName(null); setFileObj(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"><X size={13} /></button>
                            </div>
                        ) : (
                            <div className={`group flex items-center gap-2 border border-dashed border-slate-800 rounded-lg px-3 py-2.5 transition-all hover:border-slate-600 ${isSubmitting ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                                onClick={() => fileInputRef.current?.click()}>
                                <Upload size={14} className="text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                                <span className="text-slate-500 group-hover:text-slate-400 text-sm transition-colors">Add file attachment</span>
                            </div>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} disabled={isSubmitting} className="hidden" />
                        <p className="text-[11px] text-slate-600">ZIP, PDF, images · large files upload in chunks</p>
                    </div>
                    <button type="submit" disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20">
                        {isSubmitting ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                        {isSubmitting ? "Publishing..." : "Publish Post"}
                    </button>
                </aside>
                <section className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col min-h-[70vh]">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-medium text-slate-400">Content <span className="ml-1 text-[11px] text-slate-600 font-normal">— paste an image to embed it inline</span></label>
                        {contentError && <span className="text-xs text-rose-400">Content is required</span>}
                    </div>
                    <ContentEditor ref={editorRef} disabled={isSubmitting} hasError={contentError}
                        onInlineImagesChange={setInlineImages} />
                </section>
            </form>
        </div>
    );
}
