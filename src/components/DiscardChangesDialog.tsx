'use client';

import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DiscardChangesDialog({ open, onCancel, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-amber-400">
          <AlertTriangle size={22} />
          <h3 className="text-lg font-bold text-white">Discard changes?</h3>
        </div>
        <p className="text-sm text-slate-400">You have unsaved changes. Leaving now will discard them.</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-all"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
