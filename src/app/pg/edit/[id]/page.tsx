"use client";

import Link from "next/link";
import { ArrowLeft, Save, Upload, Tags, X, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

const CHUNK_SIZE = 1024 * 1024 * 2;

type PgPost = {
    id: number;
    title: string;
    content: string;
    tags?: string[];
    attachment_name?: string | null;
};

export default function PgEditPost() {
    const [post, setPost] = useState<PgPost | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const params = useParams();
    const id = Number((params?.id as string) ?? '0');

    useEffect(() => {
        async function load() {
            if (!Number.isFinite(id) || id <= 0) {
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/pg_blogs?id=${id}`);
                if (!res.ok) {
                    setPost(null);
                    return;
                }

                const data: PgPost = await res.json();
                if (data) {
                    setPost(data);
                    setFileName(data.attachment_name || null);
                }
            } catch (error) {
                console.error("Failed to load post", error);
                setPost(null);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [id]);

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
        setUploadStatus("Updating post...");

        const title = formData.get("title") as string;
        const content = formData.get("content") as string;
        const tagsInput = formData.get("tags") as string;
        const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(Boolean) : [];
        const file = formData.get("attachment") as File | null;

        const hasNewFile = file && file.size > 0;
        const isRemovingFile = !fileName && post?.attachment_name;

        try {
            // Update metadata
            const updateRes = await fetch('/api/pg_blogs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    title,
                    content,
                    tags,
                    attachment_name: hasNewFile ? file.name : (isRemovingFile ? null : fileName),
                    clear_attachment: !!isRemovingFile,
                }),
            });
            if (!updateRes.ok) {
                throw new Error("Failed to update post metadata");
            }

            if (hasNewFile) {
                setTotalMB(Number((file.size / (1024 * 1024)).toFixed(1)));
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

                    const chunkRes = await fetch(`/api/pg_blogs/chunks?id=${id}&index=${i}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: base64 }),
                    });
                    if (!chunkRes.ok) {
                        throw new Error(`Failed to upload chunk ${i + 1}`);
                    }

                    setUploadedMB(Number((Math.min((i + 1) * CHUNK_SIZE, file.size) / (1024 * 1024)).toFixed(1)));
                    setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
                }
            } else {
                setUploadProgress(100);
            }

            setUploadStatus("Done!");
            router.push("/pg?success=true");
        } catch (error) {
            console.error(error);
            setUploadStatus("Update failed. Please try again.");
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

    return (
        <div className="max-w-6xl mx-auto">
            {isSubmitting && (
                <>
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[49]" />
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl space-y-4 ring-1 ring-white/10">
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

            <h2 className="text-3xl font-bold mb-4">Edit Post</h2>

            <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-6 lg:sticky lg:top-6 lg:self-start">
                    <div className="space-y-2">
                        <label htmlFor="title" className="text-sm font-medium text-slate-400">Title</label>
                        <input
                            id="title" name="title" type="text" defaultValue={post.title} required disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="Enter post title..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="tags" className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Tags size={14} /> Tags (comma separated)
                        </label>
                        <input
                            id="tags" name="tags" type="text" defaultValue={post.tags?.join(", ")} disabled={isSubmitting}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                            placeholder="e.g. tech, news, vercel"
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
                                        <p className="text-teal-400 text-sm font-medium break-all text-center">{fileName}</p>
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
                                            <p className="text-slate-400 text-sm font-medium">Click to select new attachment</p>
                                            <p className="text-slate-600 text-xs mt-1">Leaves existing if not changed</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <button type="submit" disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20">
                        {isSubmitting ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                        {isSubmitting ? "Saving..." : "Save Changes"}
                    </button>
                </aside>

                <section className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex flex-col min-h-[70vh]">
                    <label htmlFor="content" className="text-sm font-medium text-slate-400 mb-3">Content</label>
                    <textarea
                        id="content" name="content" defaultValue={post.content} required disabled={isSubmitting}
                        className="w-full flex-1 min-h-[480px] lg:min-h-[72vh] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 resize-y disabled:opacity-50 font-mono text-sm leading-6"
                        placeholder="Write your blog content here..."
                    />
                </section>
            </form>
        </div>
    );
}


