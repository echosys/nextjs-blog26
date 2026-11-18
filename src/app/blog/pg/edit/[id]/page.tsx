"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import PgEditForm, { type EditFormHandle } from "../../../../../components/PgEditForm";
import { getAdjacentIds } from "../../../../../lib/editNav";

export default function PgEditPost() {
    const params = useParams();
    const router = useRouter();
    const id = (params?.id as string) ?? "";
    const [nav, setNav] = useState<{ prevId: string | null; nextId: string | null }>({ prevId: null, nextId: null });
    const formRef = useRef<EditFormHandle>(null);

    useEffect(() => {
        setNav(getAdjacentIds("pg", id));
    }, [id]);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-3">
                <Link href="/blog/pg" className="text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <ArrowLeft size={18} /> Back to Blog
                </Link>
            </div>
            <PgEditForm
                ref={formRef}
                key={id}
                id={id}
                variant="page"
                prevId={nav.prevId}
                nextId={nav.nextId}
                onNavigate={(targetId) => router.push(`/blog/pg/edit/${targetId}`)}
            />
        </div>
    );
}

