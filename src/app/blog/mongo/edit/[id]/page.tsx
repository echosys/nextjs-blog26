"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import MongoEditForm, { type EditFormHandle } from "../../../../../components/MongoEditForm";
import { getAdjacentIds } from "../../../../../lib/editNav";

export default function MongoEditPost() {
    const params = useParams();
    const router = useRouter();
    const id = (params?.id as string) ?? "";
    const [nav, setNav] = useState<{ prevId: string | null; nextId: string | null }>({ prevId: null, nextId: null });
    const formRef = useRef<EditFormHandle>(null);

    useEffect(() => {
        setNav(getAdjacentIds("mongo", id));
    }, [id]);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-3">
                <Link href="/blog/mongo" className="text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <ArrowLeft size={18} /> Back to Blog
                </Link>
            </div>
            <MongoEditForm
                ref={formRef}
                key={id}
                id={id}
                variant="page"
                prevId={nav.prevId}
                nextId={nav.nextId}
                onNavigate={(targetId) => router.push(`/blog/mongo/edit/${targetId}`)}
            />
        </div>
    );
}

