'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Edit2, Download, Calendar, PenLine, Tag, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import PgDeleteButton from './PgDeleteButton';
import PostPreview from "../../../components/PostPreview";
import { parseAttachmentMetadata, formatBytes } from "../../../lib/inlineImages";
import SortControl, { type SortFieldParam, type SortOrderParam } from "../../../components/SortControl";
import PgEditForm, { type EditFormHandle } from "../../../components/PgEditForm";
import { setEditNavIds } from "../../../lib/editNav";

interface PgPostListProps {
  posts: any[];
  previewId?: string;
  tags: string[];
  selectedTag: string;
  sortFieldParam: SortFieldParam;
  sortOrderParam: SortOrderParam;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PgPostList({ posts: rawPosts, previewId, tags, selectedTag, sortFieldParam, sortOrderParam }: PgPostListProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const tagsCollapsedBeforeQuickEdit = useRef(false);
  const formRef = useRef<EditFormHandle>(null);
  const router = useRouter();

  const posts = rawPosts.map(post => {
    const meta = parseAttachmentMetadata(post.attachment_name);
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      tags: post.tags,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      attachment: meta.file?.name ? `/api/pg_blogs/download/${post.id}` : undefined,
      attachmentName: meta.file?.name ?? undefined,
      attachmentSize: meta.file?.size ?? undefined,
      inlineImagesMeta: meta.inline_images ?? [],
    };
  });

  // Record the current list order so the standalone edit page can offer Prev/Next.
  useEffect(() => {
    setEditNavIds('pg', posts.map(p => String(p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPosts]);

  // If we just arrived back from editing a post, reopen its preview instead of dropping
  // the user back at the top of the list.
  useEffect(() => {
    if (!previewId) return;
    const idx = posts.findIndex(post => String(post.id) === previewId);
    if (idx !== -1) setPreviewIndex(idx);
    const url = new URL(window.location.href);
    url.searchParams.delete('previewId');
    router.replace(url.pathname + url.search, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId]);

  const openQuickEdit = (id: string) => {
    tagsCollapsedBeforeQuickEdit.current = tagsCollapsed;
    setTagsCollapsed(true);
    setQuickEditId(id);
  };

  const closeQuickEdit = () => {
    setQuickEditId(null);
    setTagsCollapsed(tagsCollapsedBeforeQuickEdit.current);
  };

  const handleRowSwitch = (id: string) => {
    if (id === quickEditId) return;
    formRef.current?.requestNavigate(id);
  };

  const quickEditIndex = quickEditId ? posts.findIndex(p => String(p.id) === quickEditId) : -1;
  const quickPrevId = quickEditIndex > 0 ? String(posts[quickEditIndex - 1].id) : null;
  const quickNextId = quickEditIndex !== -1 && quickEditIndex < posts.length - 1 ? String(posts[quickEditIndex + 1].id) : null;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <aside className={`shrink-0 ${tagsCollapsed ? 'w-full md:w-12' : 'w-full md:w-64'}`}>
        <div className="flex items-center justify-between mb-2 gap-2">
          {!tagsCollapsed && (
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Tag size={14} /> Filter by Tags
            </h3>
          )}
          <button type="button" onClick={() => setTagsCollapsed(v => !v)}
            title={tagsCollapsed ? "Show tag filters" : "Collapse tag filters"}
            className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 rounded-lg transition-all shrink-0">
            {tagsCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        {!tagsCollapsed && (
          <div className="flex flex-wrap md:flex-col gap-2">
            <Link href="/blog/pg" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === 'all' ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
              All Posts
            </Link>
            {tags.map((t: string) => (
              <Link key={t} href={`/blog/pg?tag=${t}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === t ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}>
                #{t}
              </Link>
            ))}
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-2xl font-semibold capitalize">
            {selectedTag === 'all' ? 'Latest Posts' : `Posts tagged #${selectedTag}`}
          </h2>
          <div className="flex items-center gap-3">
            <SortControl currentField={sortFieldParam} currentOrder={sortOrderParam} />
            <Link href="/blog/pg/new" className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20">
              <Plus size={18} /> New Post
            </Link>
          </div>
        </div>

        {quickEditId ? (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
            <div className="space-y-2 lg:sticky lg:top-6 lg:max-h-[75vh] lg:overflow-y-auto pr-1">
              {posts.map(p => (
                <button key={p.id} type="button" onClick={() => handleRowSwitch(String(p.id))}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${String(p.id) === quickEditId ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'}`}>
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(p.createdAt)}</p>
                </button>
              ))}
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
              <PgEditForm
                ref={formRef}
                key={quickEditId}
                id={quickEditId}
                variant="panel"
                prevId={quickPrevId}
                nextId={quickNextId}
                onNavigate={(targetId) => setQuickEditId(targetId)}
                onClose={closeQuickEdit}
                onSaved={() => router.refresh()}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {rawPosts.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                No posts found for this filter.
              </div>
            ) : rawPosts.map((post: any, index: number) => (
              <article
                key={post.id}
                className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 transition-all group cursor-pointer"
                onClick={() => setPreviewIndex(index)}
              >
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h3 className="text-lg font-bold text-white group-hover:text-teal-400 transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => openQuickEdit(String(post.id))} title="Quick edit"
                      className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all">
                      <Edit2 size={16} />
                    </button>
                    <PgDeleteButton id={post.id} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={12} /> {formatDate(post.created_at)}
                  </span>
                  {post.updated_at && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <PenLine size={12} /> Edited {formatDate(post.updated_at)}
                    </span>
                  )}
                  {post.tags?.map((t: string) => (
                    <span key={t} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>

                <p className="text-slate-400 line-clamp-2 leading-relaxed break-all text-sm">
                  {stripHtml(post.content)}
                </p>

                {posts[index].attachmentName && (
                  <div className="flex justify-end items-center text-sm mt-3 pt-3 border-t border-slate-800/50" onClick={e => e.stopPropagation()}>
                    <a
                      href={`/api/pg_blogs/download/${post.id}`}
                      download={posts[index].attachmentName}
                      className="flex items-center gap-2 text-teal-400 bg-teal-400/10 px-3 py-1.5 rounded-full hover:bg-teal-400/20 transition-all font-medium"
                    >
                      <Download size={14} />
                      <span className="truncate max-w-[110px]">{posts[index].attachmentName}</span>
                      {posts[index].attachmentSize != null && <span className="text-slate-500 shrink-0">{formatBytes(posts[index].attachmentSize!)}</span>}
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {previewIndex !== null && (
          <PostPreview
            posts={posts}
            initialIndex={previewIndex}
            onClose={() => setPreviewIndex(null)}
            editPathPrefix="/blog/pg/edit"
          />
        )}
      </div>
    </div>
  );
}
