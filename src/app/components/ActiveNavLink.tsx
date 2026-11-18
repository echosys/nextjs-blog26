"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ActiveNavLink({ href, children, exact = false, matchPrefix, size = "md" }: {
    href: string;
    children: React.ReactNode;
    exact?: boolean;
    /** Path prefix that marks the link active; defaults to href. */
    matchPrefix?: string;
    size?: "sm" | "md";
}) {
    const pathname = usePathname() ?? "";
    const prefix = matchPrefix ?? href;
    const isActive = exact ? pathname === href : pathname === prefix || pathname.startsWith(`${prefix}/`);

    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`${size === "sm" ? "px-3 py-1.5" : "px-4 py-2"} rounded-lg text-sm font-medium transition-all ${
                isActive
                    ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
        >
            {children}
        </Link>
    );
}
