"use client";

import Link from "next/link";
import { ArrowLeft, Save, Upload, Tags, X, CheckCircle2 } from "lucide-react";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks

export default function PgNewPost() {
    const [fileName, setFileName] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setFileName(file ? file.name : null);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;

        const formData = new FormData(e.currentTarget);
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadStatus("Preparing...");

        const title = formData.get("title") as string;
        const content = formData.get("content") as string;
        const tagsInput = formData.get("tags") as string;
        const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
        const file = formData.get("attachment") as File | null;

        try {
            if (file && file.size > 0) {
                setTotalMB(Number((file.size / (1024 * 1024)).toFixed(1)));
                // First create the post metadata
                setUploadStatus(`Preparing ${file.name}...`);
                const initRes = await fetch('/api/pg_blogs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content, tags, attachment_name: file.name }),
                });
                const { id: postId } = await initRes.json();

                // Then upload attachment chunks via separate endpoint
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
                    setUploadStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`);

                    const base64: string = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(chunk);
                    });

                    await fetch(`/api/pg_blogs/chunks?id=${postId}&index=${i}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: base64 }),
                    });

                    setUploadedMB(Number(((i + 1) * CHUNK_SIZE / (1024 * 1024)).toFixed(1)));
                    setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                }
            } else {
                setUploadStatus("Creating post...");
                await fetch('/api/pg_blogs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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

    return (
        <div className="max-w-2xl mx-auto">
            {isSubmitting && (
                <>
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[49]" />
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl space-y-4 ring-1 ring-white/10 animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-200 flex items-center gap-3">
                                    {uploadProgress === 100 ? (
                                        <CheckCircle2 size={20} className="text-teal-400" />
                                    ) : (
                                        <div className="w-4 h-4 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
                                    )}
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

            <form onSubmit={handleSubmit} className="space-y-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
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

                <div className="space-y-2">
                    <label htmlFor="content" className="text-sm font-medium text-slate-400">Content</label>
                    <textarea
                        id="content" name="content" required disabled={isSubmitting} rows={8}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 resize-none disabled:opacity-50"
                        placeholder="Write your blog content here..."
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Attachment (Max 200MB)</label>
                    <div
                        className={`relative group ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    >
                        <input id="attachment" name="attachment" type="file" ref={fileInputRef}
                            onChange={handleFileChange} disabled={isSubmitting} className="hidden" />
                        <div className="w-full bg-slate-950 border border-slate-800 border-dashed rounded-xl px-4 py-6 flex flex-col items-center gap-3 transition-all group-hover:border-slate-600">
                            {fileName ? (
                                <>
                                    <div className="bg-teal-500/10 p-3 rounded-full">
                                        <Upload className="text-teal-400" size={32} />
                                    </div>
                                    <p className="text-teal-400 text-sm font-medium">{fileName}</p>
                                    {!isSubmitting && (
                                        <button type="button" onClick={e => { e.stopPropagation(); setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                                            className="text-slate-500 hover:text-rose-400 text-xs flex items-center gap-1 mx-auto">
                                            <X size={12} /> Remove file
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Upload className="text-slate-600 group-hover:text-teal-400 transition-colors" size={32} />
                                    <div className="text-center">
                                        <p className="text-slate-400 text-sm font-medium">Click to select attachment</p>
                                        <p className="text-slate-600 text-xs mt-1">ZIP, PDF, images up to 200MB</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <button type="submit" disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20">
                    {isSubmitting ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                    {isSubmitting ? "Publishing..." : "Publish Post"}
                </button>
            </form>
        </div>
    );
}

