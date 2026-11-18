import Link from "next/link";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { headers } from "next/headers";
import PgPostList from "./PgPostList";
import { type SortFieldParam, type SortOrderParam } from "../../../components/SortControl";
import { listPgBlogs, type BlogSortField, type BlogSortOrder } from "../../../lib/storage";

export const dynamic = 'force-dynamic';

function parseSort(sort?: string): { field: SortFieldParam; order: SortOrderParam } {
    const [rawField, rawOrder] = (sort || "created_desc").split("_");
    return {
        field: rawField === "updated" ? "updated" : "created",
        order: rawOrder === "asc" ? "asc" : "desc",
    };
}

async function getPgPosts(tag: string | undefined, host: string | null | undefined, sortField: BlogSortField, sortOrder: BlogSortOrder) {
    try {
        return { ...(await listPgBlogs({ tag, host, sortField, sortOrder })), error: null };
    } catch (err: any) {
        console.error('[pg/page] listPgBlogs failed:', err?.message);
        return { posts: [], tags: [], error: err?.message ?? 'Database error' };
    }
}

export default async function PgBlogPage({
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
    const { posts, tags, error } = await getPgPosts(selectedTag, headerStore.get('host'), sortField, sortOrder);
    const showSuccess = success === 'true';


    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span className="text-sm">Database error — {error}. <a href="/blog/pg" className="underline hover:text-rose-300">Retry</a></span>
                </div>
            )}
            {showSuccess && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post saved successfully!</span>
                    </div>
                    <Link href="/blog/pg" className="text-slate-500 hover:text-slate-300">
                        <X size={18} />
                    </Link>
                </div>
            )}

            <PgPostList
                posts={posts}
                previewId={previewId}
                tags={tags}
                selectedTag={selectedTag}
                sortFieldParam={sortFieldParam}
                sortOrderParam={sortOrderParam}
            />
        </div>
    );
}

