import Link from "next/link";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { headers } from "next/headers";
import MongoPostList, { type MongoListItem } from "./MongoPostList";
import { type SortFieldParam, type SortOrderParam } from "../../../components/SortControl";
import { getMongoTags, listMongoBlogs, type BlogSortField, type BlogSortOrder } from "../../../lib/storage";

export const dynamic = 'force-dynamic';

function parseSort(sort?: string): { field: SortFieldParam; order: SortOrderParam } {
    const [rawField, rawOrder] = (sort || "created_desc").split("_");
    return {
        field: rawField === "updated" ? "updated" : "created",
        order: rawOrder === "asc" ? "asc" : "desc",
    };
}

function toExcerpt(html: string): string {
    // Drop tags (including inline base64 <img>) server-side so the client never receives full post bodies.
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function getBlogs(tag: string | undefined, host: string | null | undefined, sortField: BlogSortField, sortOrder: BlogSortOrder) {
    try {
        const [{ blogs }, allTags] = await Promise.all([
            listMongoBlogs({ page: 1, limit: 50, tag, host, sortField, sortOrder }),
            getMongoTags(host),
        ]);
        const items: MongoListItem[] = blogs.map((blog: any) => ({
            id: String(blog._id),
            title: blog.title,
            excerpt: toExcerpt(blog.content || ''),
            tags: blog.tags || [],
            createdAt: new Date(blog.createdAt).toISOString(),
            updatedAt: blog.updatedAt ? new Date(blog.updatedAt).toISOString() : undefined,
            attachmentName: blog.attachmentName || undefined,
            attachmentSize: blog.attachmentLength ? Math.round(blog.attachmentLength * 0.75) : undefined,
        }));
        return { blogs: items, allTags, error: null };
    } catch (err: any) {
        console.error('[mongo/page] listMongoBlogs failed:', err?.message);
        return { blogs: [], allTags: [], error: err?.message ?? 'Database error' };
    }
}

export default async function MongoBlogPage({
    searchParams,
}: {
    searchParams: Promise<{ tag?: string; success?: string; sort?: string; previewId?: string }>;
}) {
    const { tag, success, sort, previewId } = await searchParams;
    const selectedTag = tag || 'all';
    const { field: sortFieldParam, order: sortOrderParam } = parseSort(sort);
    const sortField: BlogSortField = sortFieldParam === 'updated' ? 'updatedAt' : 'createdAt';
    const sortOrder: BlogSortOrder = sortOrderParam;
    const headerStore = await headers();
    const { blogs, allTags, error } = await getBlogs(selectedTag, headerStore.get('host'), sortField, sortOrder);


    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span className="text-sm">Database error — {error}. <a href="/blog/mongo" className="underline hover:text-rose-300">Retry</a></span>
                </div>
            )}
            {success === 'true' && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post saved successfully!</span>
                    </div>
                    <Link href="/blog/mongo" className="text-slate-500 hover:text-slate-300"><X size={18} /></Link>
                </div>
            )}

            <MongoPostList
                blogs={blogs}
                previewId={previewId}
                allTags={allTags}
                selectedTag={selectedTag}
                sortFieldParam={sortFieldParam}
                sortOrderParam={sortOrderParam}
            />
        </div>
    );
}

