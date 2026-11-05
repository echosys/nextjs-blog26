import Link from "next/link";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { headers } from "next/headers";
import MongoPostList from "./MongoPostList";
import { type SortFieldParam, type SortOrderParam } from "../../components/SortControl";
import { getMongoTags, listMongoBlogs, type BlogSortField, type BlogSortOrder } from "../../lib/storage";

export const dynamic = 'force-dynamic';

function parseSort(sort?: string): { field: SortFieldParam; order: SortOrderParam } {
    const [rawField, rawOrder] = (sort || "created_desc").split("_");
    return {
        field: rawField === "updated" ? "updated" : "created",
        order: rawOrder === "asc" ? "asc" : "desc",
    };
}

async function getBlogs(tag: string | undefined, host: string | null | undefined, sortField: BlogSortField, sortOrder: BlogSortOrder) {
    try {
        const [{ blogs }, allTags] = await Promise.all([
            listMongoBlogs({ page: 1, limit: 50, tag, host, sortField, sortOrder }),
            getMongoTags(host),
        ]);
        return { blogs: JSON.parse(JSON.stringify(blogs)), allTags, error: null };
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
                    <span className="text-sm">Database error — {error}. <a href="/mongo" className="underline hover:text-rose-300">Retry</a></span>
                </div>
            )}
            {success === 'true' && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post saved successfully!</span>
                    </div>
                    <Link href="/mongo" className="text-slate-500 hover:text-slate-300"><X size={18} /></Link>
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

