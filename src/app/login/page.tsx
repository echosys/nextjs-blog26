import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { HUB_NAME } from "../../lib/apps";
import { safeNextPath } from "../../lib/nextPath";

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    const nextPath = safeNextPath(next);

    return (
        <div className="max-w-md mx-auto mt-24">
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent mb-2">
                        {HUB_NAME}
                    </h1>
                    <p className="text-slate-400">
                        {nextPath ? <>Sign in to continue to <span className="font-mono text-slate-300">{nextPath.split('?')[0]}</span></> : "Sign in to open your apps"}
                    </p>
                </div>
                <LoginForm next={nextPath} />
            </div>
        </div>
    );
}
