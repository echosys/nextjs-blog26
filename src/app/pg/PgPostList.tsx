'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit2, Download } from 'lucide-react';
import PgDeleteButton from './PgDeleteButton';
import PostPreview from "../../components/PostPreview";

interface PgPostListProps {
  posts: any[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function PgPostList({ posts: rawPosts }: PgPostListProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const posts = rawPosts.map(post => ({
    id: post.id,
    title: post.title,
    content: post.content,
    tags: post.tags,
    createdAt: post.created_at,
    attachment: post.attachment_name ? `/api/pg_blogs/download/${post.id}` : undefined,
    attachmentName: post.attachment_name,
  }));

  return (
    <>
      <div className="grid gap-6">
        {rawPosts.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
            No posts found for this filter.
          </div>
        ) : rawPosts.map((post: any, index: number) => (
          <article 
            key={post.id} 
            className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-slate-700 transition-all group cursor-pointer"
            onClick={() => setPreviewIndex(index)}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-teal-400 transition-colors">
                  {post.title}
                </h3>

                <div className="flex flex-wrap gap-2">
                  {post.tags?.map((t: string) => (
                    <span key={t} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                <Link
                  href={`/pg/edit/${post.id}`}
                  className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </Link>
                <PgDeleteButton id={post.id} />
              </div>
            </div>

            <p className="text-slate-400 line-clamp-3 mb-6 leading-relaxed break-all">
              {stripHtml(post.content)}
            </p>

            <div className="flex justify-between items-center text-sm pt-4 border-t border-slate-800/50">
              <span className="text-slate-500 font-medium">
                {new Date(post.created_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
              {post.attachment_name && (
                <div onClick={e => e.stopPropagation()}>
                  <a
                    href={`/api/pg_blogs/download/${post.id}`}
                    download={post.attachment_name}
                    className="flex items-center gap-2 text-teal-400 bg-teal-400/10 px-3 py-1.5 rounded-full hover:bg-teal-400/20 transition-all font-medium"
                  >
                    <Download size={14} />
                    <span className="truncate max-w-[140px]">{post.attachment_name}</span>
                  </a>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {previewIndex !== null && (
        <PostPreview 
          posts={posts} 
          initialIndex={previewIndex} 
          onClose={() => setPreviewIndex(null)}
          editPathPrefix="/pg/edit"
        />
      )}
    </>
  );
}
