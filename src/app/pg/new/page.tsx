"use client";

import Link from "next/link";
import { ArrowLeft, Save, Upload, Tags, X, CheckCircle2, ImageIcon } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import runtimeConfig from "../../../../config/config.json";

const CHUNK_SIZE = 1024 * 1024 * 2;
const MAX_IMAGE_MB: number = (runtimeConfig as any).inlineImageMaxSizeMB ?? 3;

type AttachmentItem = {
    id: string;
    name: string;
    size: number;
    type: "inline" | "file";
    status: "processing" | "ready" | "queued";
    dataUrl?: string;
    file?: File;
};

async function compressImage(blob: Blob, maxMB: number): Promise<{ dataUrl: string; bytes: number }> {
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
            let quality = 0.85;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            let dataUrl = canvas.toDataURL("image/jpeg", quality);
            let approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            while (approxBytes > maxBytes && quality > 0.3) {
                quality = Math.round((quality - 0.1) * 10) / 10;
                dataUrl = canvas.toDataURL("image/jpeg", quality);
                approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            }
            while (approxBytes > maxBytes && (w > 400 || h > 400)) {
                w = Math.round(w * 0.8);
                h = Math.round(h * 0.8);
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                dataUrl = canvas.toDataURL("image/jpeg", quality);
                approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
            }
            resolve({ dataUrl, bytes: approxBytes });
        };
        img.onerror = reject;
        img.src = url;
    });
}

function fmtSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return bytes > 0 ? `${bytes} B` : "";
}

export default function PgNewPost() {
    const [content, setContent] = useState("");
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const removeAttachment = useCallback((id: string, type: "inline" | "file") => {
        if (type === "inline") {
            const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(`!\\[${escaped}\\]\\([^)]*\\)`, "g");
            setContent(c => c.replace(pattern, ""));
        }
        if (type === "file" && fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        setAttachments(prev => prev.filter(a => a.id !== id));
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAttachments(prev => [
            ...prev.filter(a => a.type !== "file"),
            { id: `file-${Date.now()}`, name: file.name, size: file.size, type: "file", status: "queued", file },
        ]);
    };

    const handleContentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const imageItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
        if (!imageItem) return;
        e.preventDefault();
        const blob = imageItem.getAsFile();
        if (!blob) return;

        const pastedId = `pasted-${Date.now()}`;
        const inlineCount = attachments.filter(a => a.type === "inline").length + 1;
        const displayName = `pasted-image-${inlineCount}.jpg`;
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const placeholderRef = `![${pastedId}](...)`;
        setContent(c => c.slice(0, start) + placeholderRef + c.slice(textarea.selectionEnd));
        setAttachments(prev => [...prev, { id: pastedId, name: displayName, size: 0, type: "inline", status: "processing" }]);

        try {
            const { dataUrl, bytes } = await compressImage(blob, MAX_IMAGE_MB);
            const finalRef = `![${pastedId}](${dataUrl})`;
            setContent(c => c.replace(placeholderRef, finalRef));
            setAttachments(prev => prev.map(a => a.id === pastedId
                ? { ...a, name: displayName, size: bytes, status: "ready", dataUrl }
                : a
            ));
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + finalRef.length;
                textarea.focus();
            }, 0);
        } catch {
            setContent(c => c.replace(placeholderRef, ""));
            setAttachments(prev => prev.filter(a => a.id !== pastedId));
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;

        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadStatus("Preparing...");

        const title = formData.get("title") as string;
        const tagsInput = formData.get("tags") as string;
        const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
        const fileAtt = attachments.find(a => a.type === "file");
        const file = fileAtt?.file ?? null;

        try {
            if (file && file.size > 0) {
                setTotalMB(Number((file.size / (1024 * 1024)).toFixed(1)));
                setUploadStatus(`Preparing ${file.name}...`);
                const initRes = await fetch("/api/pg_blogs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, content, tags, attachment_name: file.name }),
                });
                const { id: postId } = await initRes.json();

                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                for (let i = 0; i < totalChunks; i++) {
                    const chunkStart = i * CHUNK_SIZE;
                    const chunk = file.slice(chunkStart, Math.min(chunkStart + CHUNK_SIZE, file.size));
                    setUploadStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`);

                    const base64: string = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(chunk);
                    });

                    await fetch(`/api/pg_blogs/chunks?id=${postId}&index=${i}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: base64 }),
                    });

                    setUploadedMB(Number(((i + 1) * CHUNK_SIZE / (1024 * 1024)).toFixed(1)));
                    setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                }
            } else {
                setUploadStatus("Creating post...");
                await fetch("/api/pg_blogs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, content, tags, attachment_name: null }),
                });
                setUploadProgress(100);
            }

            setUploadStatus("Done!");
            router.push("/pg?success=true");
        } catch (error) {
            console.error(error);
            setUploadStatus("Upload failed. Please try again.");
            setIsSubmitting(false);
        }
    };

    const fileAtt = attachments.find(a => a.type === "file");

    return (
        <div className="max-w-6xl mx-auto">
            {isSubmitting && (
                <>
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[49]" />
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl space-y-4 ring-1 ring-white/10 animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-200 flex items-center gap-3">
                                    {uploadProgress === 100
                                        ? <CheckCircle2 size={20} className="text-teal-400" />
                                        : <div className="w-4 h-4 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />}
                                    <span className="font-medium">{uploadStatus}</span>
                                </span>
                                <span className="text-teal-400 font-bold tabular-nums">
                                    {totalMB > 0 ? `${uploadedMB}MB / ${totalMB}MB (${uploadProgress}%)` : `${uploadProgress}%`}
                                </span>
                            </div>
                            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                                <div
                                    className="bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(20,184,166,0.3)]"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="mb-3">
                <Link href="/pg" className="text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <ArrowLeft size={18} /> Back to Blog
                </Link>
            </div>

            <h2 className="text-3xl font-bold mb-4">Create New Post</h2>

            <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                {/* ── Left sidebar ── */}
                <aside className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-6 lg:sticky lg:top-6 lg:self-start">
                    <div className="space-y-2">
                        <label htmlFor="title" className="text-sm font-medium text-slate-400">Title</label>
                        <input
                            id="title" name="title" type="text" required disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="Enter post title..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="tags" className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Tags size={14} /> Tags (comma separated)
                        </label>
                        <input
                            id="tags" name="tags" type="text" disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="e.g. tech, news, vercel"
                        />
                    </div>

                    {/* ── Attachments list ── */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-400">Attachments</label>

                        {attachments.length > 0 && (
                            <div className="space-y-1">
                                {attachments.map(att => (
                                    <div key={att.id}
                                        className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                                        {att.type === "inline" && att.dataUrl ? (
                                            <img src={att.dataUrl} alt="" className="w-7 h-7 object-cover rounded shrink-0" />
                                        ) : att.type === "inline" ? (
                                            <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                                <ImageIcon size={13} className="text-slate-600" />
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                                <Upload size={13} className="text-slate-500" />
                                            </div>
                                        )}
                                        <span className="text-slate-300 text-xs truncate flex-1 min-w-0">{att.name}</span>
                                        <span className="text-slate-600 text-xs tabular-nums shrink-0">{fmtSize(att.size)}</span>
                                        {att.status === "processing" && (
                                            <div className="w-3 h-3 border border-teal-500/30 border-t-teal-500 rounded-full animate-spin shrink-0" />
                                        )}
                                        {att.status === "ready" && att.type === "inline" && (
                                            <span className="text-teal-500 text-[10px] shrink-0">inline ✓</span>
                                        )}
                                        {att.status === "queued" && (
                                            <span className="text-slate-600 text-[10px] shrink-0">on submit</span>
                                        )}
                                        <button type="button"
                                            disabled={isSubmitting || att.status === "processing"}
                                            onClick={() => removeAttachment(att.id, att.type)}
                                            className="text-slate-600 hover:text-rose-400 transition-colors shrink-0 disabled:opacity-30">
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add file button — one manual file at a time */}
                        {!fileAtt && (
                            <div
                                className={`group flex items-center gap-2 border border-dashed border-slate-800 rounded-lg px-3 py-2.5 transition-all hover:border-slate-600 ${isSubmitting ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                                onClick={() => fileInputRef.current?.click()}>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} disabled={isSubmitting} className="hidden" />
                                <Upload size={14} className="text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                                <span className="text-slate-500 group-hover:text-slate-400 text-sm transition-colors">Add file attachment</span>
                            </div>
                        )}

                        <p className="text-[11px] text-slate-600 leading-relaxed">
                            Paste images directly into content to embed inline · ZIP, PDF, images up to 200 MB
                        </p>
                    </div>

                    <button type="submit" disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20">
                        {isSubmitting ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                        {isSubmitting ? "Publishing..." : "Publish Post"}
                    </button>
                </aside>

                {/* ── Right: content area ── */}
                <section className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col min-h-[70vh]">
                    <label htmlFor="content" className="text-sm font-medium text-slate-400 mb-3">
                        Content
                        <span className="ml-2 text-[11px] text-slate-600 font-normal">— paste an image here to embed it inline</span>
                    </label>
                    <textarea
                        id="content" name="content" required disabled={isSubmitting}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        onPaste={handleContentPaste}
                        className="w-full flex-1 min-h-[480px] lg:min-h-[72vh] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 resize-y disabled:opacity-50 font-mono text-sm leading-6"
                        placeholder="Write your blog content here..."
                    />
                </section>
            </form>
        </div>
    );
}
