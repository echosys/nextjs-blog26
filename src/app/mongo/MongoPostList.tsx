'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Edit2, Download, Paperclip, Calendar, PenLine, Tag, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import MongoDeleteButton from './MongoDeleteButton';
import PostPreview from "../../components/PostPreview";
import SortControl, { type SortFieldParam, type SortOrderParam } from "../../components/SortControl";
import MongoEditForm, { type EditFormHandle } from "../../components/MongoEditForm";
import { setEditNavIds } from "../../lib/editNav";

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateDataUrlBytes(dataUrl: string): number {
    const commaIdx = dataUrl.indexOf(',');
    return Math.round((dataUrl.length - commaIdx - 1) * 0.75);
}

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface MongoPostListProps {
  blogs: any[];
  previewId?: string;
  allTags: string[];
  selectedTag: string;
  sortFieldParam: SortFieldParam;
  sortOrderParam: SortOrderParam;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function MongoPostList({ blogs, previewId, allTags, selectedTag, sortFieldParam, sortOrderParam }: MongoPostListProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const tagsCollapsedBeforeQuickEdit = useRef(false);
  const formRef = useRef<EditFormHandle>(null);
  const router = useRouter();

  const posts = blogs.map(blog => ({
    id: String(blog._id),
    title: blog.title,
    content: blog.content,
    tags: blog.tags,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
    attachment: blog.attachment,
    attachmentName: blog.attachmentName,
    attachmentSize: blog.attachment ? estimateDataUrlBytes(blog.attachment) : undefined,
  }));

  // Record the current list order so the standalone edit page can offer Prev/Next.
  useEffect(() => {
    setEditNavIds('mongo', posts.map(p => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogs]);

  // If we just arrived back from editing a post, reopen its preview instead of dropping
  // the user back at the top of the list.
  useEffect(() => {
    if (!previewId) return;
    const idx = posts.findIndex(post => post.id === previewId);
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

  const quickEditIndex = quickEditId ? posts.findIndex(p => p.id === quickEditId) : -1;
  const quickPrevId = quickEditIndex > 0 ? posts[quickEditIndex - 1].id : null;
  const quickNextId = quickEditIndex !== -1 && quickEditIndex < posts.length - 1 ? posts[quickEditIndex + 1].id : null;

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
        )}
      </aside>

      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-2xl font-semibold">
            {selectedTag === 'all' ? 'Latest Posts' : `Posts tagged #${selectedTag}`}
          </h2>
          <div className="flex items-center gap-3">
            <SortControl currentField={sortFieldParam} currentOrder={sortOrderParam} />
            <Link href="/mongo/new" className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20">
              <Plus size={18} /> New Post
            </Link>
          </div>
        </div>

        {quickEditId ? (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
            <div className="space-y-2 lg:sticky lg:top-6 lg:max-h-[75vh] lg:overflow-y-auto pr-1">
              {posts.map(p => (
                <button key={p.id} type="button" onClick={() => handleRowSwitch(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${p.id === quickEditId ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'}`}>
                  <p className="text-sm font-medium truncate">{p.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(p.createdAt)}</p>
                </button>
              ))}
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
              <MongoEditForm
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
            {blogs.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                No posts found.
              </div>
            ) : blogs.map((blog: any, index: number) => (
              <article
                key={String(blog._id)}
                className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl hover:border-slate-700 transition-all group cursor-pointer"
                onClick={() => setPreviewIndex(index)}
              >
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h3 className="text-lg font-bold text-white group-hover:text-teal-400 transition-colors leading-snug">
                    {blog.title}
                  </h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => openQuickEdit(String(blog._id))} title="Quick edit"
                      className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all">
                      <Edit2 size={16} />
                    </button>
                    <MongoDeleteButton id={String(blog._id)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={12} /> {formatDate(blog.createdAt)}
                  </span>
                  {blog.updatedAt && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <PenLine size={12} /> Edited {formatDate(blog.updatedAt)}
                    </span>
                  )}
                  {blog.tags?.map((t: string) => (
                    <span key={t} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-0.5 rounded">#{t}</span>
                  ))}
                </div>
                <p className="text-slate-400 line-clamp-2 leading-relaxed break-all text-sm">{stripHtml(blog.content)}</p>
                {blog.attachment && (
                  <div className="flex justify-end items-center text-sm mt-3 pt-3 border-t border-slate-800/50" onClick={e => e.stopPropagation()}>
                    <a href={blog.attachment} download={blog.attachmentName || 'attachment'}
                      className="flex items-center gap-2 text-teal-400 bg-teal-400/10 px-3 py-1.5 rounded-full hover:bg-teal-400/20 transition-all font-medium min-w-0 max-w-[220px]">
                      {blog.attachmentName ? <Download size={14} className="shrink-0" /> : <Paperclip size={14} className="shrink-0" />}
                      <span className="truncate text-xs">{blog.attachmentName || 'Download attachment'}</span>
                      <span className="text-slate-500 shrink-0 text-xs">{formatBytes(estimateDataUrlBytes(blog.attachment))}</span>
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
            editPathPrefix="/mongo/edit"
          />
        )}
      </div>
    </div>
  );
}
