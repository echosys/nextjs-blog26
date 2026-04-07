import type { Metadata } from "next";
import "./globals.css";
import LogoutButton from "./components/LogoutButton";
import ActiveNavLink from "./components/ActiveNavLink";
import { cookies, headers } from "next/headers";
import { getRuntimeStorageConfig } from "../lib/runtimeConfig";


export const metadata: Metadata = {
    title: "Blog Manager",
    description: "Dual-backend blog powered by Next.js, MongoDB & Postgres",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const runtime = getRuntimeStorageConfig(headerStore.get("host"));
    const isLoggedIn = cookieStore.has("auth");

    function parseHostFromUrl(url?: string): string {
        if (!url) {
            return "not configured";
        }

        try {
            return new URL(url).host;
        } catch {
            return "configured";
        }
    }

    const mongoFooter = runtime.mongoBlogMode === "json"
        ? { title: "Mongo Blog", value: "JSON", detail: runtime.json.mongoBlogFile }
        : { title: "Mongo Blog", value: "MongoDB", detail: parseHostFromUrl(process.env.MONGODB_URI) };

    const pgFooter = runtime.postgresBlogMode === "json"
        ? { title: "PG Blog", value: "JSON", detail: runtime.json.postgresBlogFile }
        : { title: "PG Blog", value: "Postgres", detail: parseHostFromUrl(process.env.POSTGRES_URL) };

    return (
        <html lang="en">
            <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased">
                <div className="max-w-6xl mx-auto w-full px-6 py-6 flex-1">
                    <header className="mb-6 border-b border-slate-800 pb-4 flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                                Blog Manager
                            </h1>
                            <p className="text-slate-400 mt-2">MongoDB &amp; Postgres Content Hub</p>
                        </div>
                        {isLoggedIn && (
                            <div className="flex items-center gap-4 flex-wrap">
                                <nav className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                                    <ActiveNavLink href="/mongo">Mongo Blog</ActiveNavLink>
                                    <ActiveNavLink href="/pg">Postgres Blog</ActiveNavLink>
                                </nav>
                                <LogoutButton />
                            </div>
                        )}
                    </header>
                    <main>{children}</main>
                </div>
                <footer className="mt-20 py-8 border-t border-slate-800 text-xs text-slate-500 flex flex-col gap-6 items-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                            <span className="text-slate-400 font-medium">{mongoFooter.title}:</span>
                            <span className="font-mono text-slate-500">{mongoFooter.value}</span>
                            <span className="font-mono text-slate-600 hidden sm:inline">{mongoFooter.detail}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            <span className="text-slate-400 font-medium">{pgFooter.title}:</span>
                            <span className="font-mono text-slate-500">{pgFooter.value}</span>
                            <span className="font-mono text-slate-600 hidden sm:inline">{pgFooter.detail}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-6 opacity-60">
                        <p>Build: <span className="font-mono text-slate-400">{process.env.NEXT_PUBLIC_BUILD_TIME || 'dev'}</span></p>
                        <p>Commit: <span className="font-mono text-slate-400">{process.env.NEXT_PUBLIC_GIT_COMMIT || 'local'}</span></p>
                    </div>
                </footer>

            </body>
        </html>
    );
}


