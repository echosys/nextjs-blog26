import Link from "next/link";
import { Plus, Tag, Edit2, Download, CheckCircle2, X, Paperclip } from "lucide-react";
import MongoPostList from "./MongoPostList";
import clientPromise from "../../lib/mongodb";

export const dynamic = 'force-dynamic';

async function getBlogs(tag?: string) {
    try {
        const client = await clientPromise;
        const db = client.db('blog_2026');
        const blogs = await db.collection('blog_entry')
            .find((tag && tag !== 'all') ? { tags: tag } : {})
            .sort({ createdAt: -1 }).limit(50).toArray();
        const tagsDoc = await db.collection('blog_login').findOne({}, { projection: { tags: 1 } });
        return { blogs: JSON.parse(JSON.stringify(blogs)), allTags: (tagsDoc?.tags || []) as string[] };
    } catch {
        return { blogs: [], allTags: [] };
    }
}

export default async function MongoBlogPage({
    searchParams,
}: {
    searchParams: Promise<{ tag?: string; success?: string }>;
}) {
    const { tag, success } = await searchParams;
    const selectedTag = tag || 'all';
    const { blogs, allTags } = await getBlogs(selectedTag);

    return (
        <div className="space-y-4">
            {success === 'true' && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post saved successfully!</span>
                    </div>
                    <Link href="/mongo" className="text-slate-500 hover:text-slate-300"><X size={18} /></Link>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-8">
                <aside className="w-full md:w-64 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Tag size={14} /> Filter by Tags
                    </h3>
                    <div className="flex flex-wrap md:flex-col gap-2">
                        <Link href="/mongo" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === 'all' ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
                            All Posts
                        </Link>
                        {allTags.map((t) => (
                            <Link key={t} href={`/mongo?tag=${t}`}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === t ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
                                #{t}
                            </Link>
                        ))}
                    </div>
                </aside>

                <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-semibold">
                            {selectedTag === 'all' ? 'Latest Posts' : `Posts tagged #${selectedTag}`}
                        </h2>
                        <Link href="/mongo/new" className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20">
                            <Plus size={18} /> New Post
                        </Link>
                    </div>

                    <MongoPostList blogs={blogs} />

                </div>
            </div>
        </div>
    );
}
