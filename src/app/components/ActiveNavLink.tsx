"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ActiveNavLink({ href, children }: { href: string; children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isActive = pathname?.startsWith(href) ?? false;

    // Eagerly prefetch the other tab's route so switching feels instant
    useEffect(() => {
        if (!isActive) {
            router.prefetch(href);
        }
    }, [href, isActive, router]);

    return (
        <Link
            href={href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                    ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
        >
            {children}
        </Link>
    );
}
