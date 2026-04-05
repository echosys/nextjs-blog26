'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Edit2, Download, Paperclip, Calendar, Tag } from 'lucide-react';
import Link from 'next/link';

interface Post {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string | Date;
  attachment?: string;
  attachmentName?: string;
}

interface PostPreviewProps {
  posts: Post[];
  initialIndex: number;
  onClose: () => void;
  editPathPrefix: string;
}

export default function PostPreview({ posts, initialIndex, onClose, editPathPrefix }: PostPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  const post = posts[currentIndex];

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : posts.length - 1));
  }, [posts.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < posts.length - 1 ? prev + 1 : 0));
  }, [posts.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose, handlePrevious, handleNext]);

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-4xl max-h-full flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <span className="text-xs font-mono text-slate-500">
              {currentIndex + 1} / {posts.length}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Link 
              href={`${editPathPrefix}/${post.id}`}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg shadow-teal-500/20"
            >
              <Edit2 size={16} />
              Edit Post
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-white tracking-tight leading-tight">
                {post.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-teal-400" />
                  {new Date(post.createdAt).toLocaleDateString(undefined, { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-teal-400" />
                    <div className="flex gap-2">
                      {post.tags.map(t => (
                        <span key={t} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 text-base leading-relaxed whitespace-pre-wrap">
                {post.content}
              </p>
            </div>

            {post.attachment && (
              <div className="pt-5 border-t border-slate-800">
                <a 
                  href={post.attachment} 
                  download={post.attachmentName || 'attachment'}
                  className="inline-flex items-center gap-3 text-teal-400 bg-teal-400/5 border border-teal-400/10 px-6 py-3 rounded-2xl hover:bg-teal-400/10 transition-all font-medium"
                >
                  {post.attachmentName ? <Download size={18} /> : <Paperclip size={18} />}
                  <span>{post.attachmentName || 'Download attachment'}</span>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Overlays */}
        <button 
          onClick={handlePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-800 backdrop-blur-md rounded-2xl transition-all opacity-0 md:group-hover:opacity-100 group-hover:opacity-100 border border-slate-800"
          title="Previous (Left Arrow)"
        >
          <ChevronLeft size={24} />
        </button>
        <button 
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-800 backdrop-blur-md rounded-2xl transition-all opacity-0 md:group-hover:opacity-100 group-hover:opacity-100 border border-slate-800"
          title="Next (Right Arrow)"
        >
          <ChevronRight size={24} />
        </button>

        {/* Footer Navigation (Mobile) */}
        <div className="md:hidden flex items-center justify-between p-6 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <button 
            onClick={handlePrevious}
            className="flex items-center gap-2 text-slate-400 font-medium"
          >
            <ChevronLeft size={20} />
            Prev
          </button>
          <button 
            onClick={handleNext}
            className="flex items-center gap-2 text-slate-400 font-medium"
          >
            Next
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
