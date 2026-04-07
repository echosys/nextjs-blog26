import Link from "next/link";
import { Plus, Tag, CheckCircle2, X } from "lucide-react";
import { headers } from "next/headers";
import PgPostList from "./PgPostList";
import { listPgBlogs } from "../../lib/storage";

export const dynamic = 'force-dynamic';

async function getPgPosts(tag?: string, host?: string | null) {
    try {
        return await listPgBlogs({ tag, host });
    } catch {
        return { posts: [], tags: [] };
    }
}

export default async function PgBlogPage({
    searchParams,
}: {
    searchParams: Promise<{ tag?: string; success?: string }>;
}) {
    const { tag, success } = await searchParams;
    const selectedTag = tag || 'all';
    const headerStore = await headers();
    const { posts, tags } = await getPgPosts(selectedTag, headerStore.get('host'));
    const showSuccess = success === 'true';

    return (
        <div className="space-y-4">
            {showSuccess && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post saved successfully!</span>
                    </div>
                    <Link href="/pg" className="text-slate-500 hover:text-slate-300">
                        <X size={18} />
                    </Link>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar */}
                <aside className="w-full md:w-64 space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Tag size={14} /> Filter by Tags
                        </h3>
                        <div className="flex flex-wrap md:flex-col gap-2">
                            <Link
                                href="/pg"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === 'all' ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
                            >
                                All Posts
                            </Link>
                            {tags.map((t: string) => (
                                <Link
                                    key={t}
                                    href={`/pg?tag=${t}`}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === t ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
                                >
                                    #{t}
                                </Link>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-semibold capitalize">
                            {selectedTag === 'all' ? 'Latest Posts' : `Posts tagged #${selectedTag}`}
                        </h2>
                        <Link
                            href="/pg/new"
                            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20"
                        >
                            <Plus size={18} /> New Post
                        </Link>
                    </div>

                    <PgPostList posts={posts} />
                </div>
            </div>
        </div>
    );
}
