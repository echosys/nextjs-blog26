"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";

export type SortFieldParam = "created" | "updated";
export type SortOrderParam = "asc" | "desc";

type Props = {
  currentField: SortFieldParam;
  currentOrder: SortOrderParam;
};

const FIELD_OPTIONS: { value: SortFieldParam; label: string }[] = [
  { value: "created", label: "Date Created" },
  { value: "updated", label: "Last Edited" },
];

export default function SortControl({ currentField, currentOrder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = (field: SortFieldParam, order: SortOrderParam) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("sort", `${field}_${order}`);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-field" className="sr-only">Sort by</label>
      <select
        id="sort-field"
        value={currentField}
        onChange={(e) => navigate(e.target.value as SortFieldParam, currentOrder)}
        className="bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-2 focus:ring-teal-500 outline-none transition-all hover:border-slate-700"
      >
        {FIELD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => navigate(currentField, currentOrder === "asc" ? "desc" : "asc")}
        className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 hover:border-teal-500/40 rounded-lg transition-all"
        title={currentOrder === "asc" ? "Ascending — click for newest first" : "Descending — click for oldest first"}
      >
        {currentOrder === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
      </button>
    </div>
  );
}
