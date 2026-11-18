import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { APPS } from "../lib/apps";

export default function NavigatorPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-white">Apps</h1>
                <p className="text-slate-400 text-sm mt-1">Each app has its own URL, so you can open several in separate tabs.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {APPS.map((app) => {
                    const Icon = app.icon;
                    return (
                        <Link key={app.id} href={app.href}
                            className="group bg-slate-900/50 border border-slate-800 hover:border-teal-500/40 rounded-2xl p-5 transition-all flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400"><Icon size={22} /></span>
                                <ArrowRight size={18} className="text-slate-600 group-hover:text-teal-400 transition-colors" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white group-hover:text-teal-300 transition-colors">{app.name}</h2>
                                <p className="text-sm text-slate-400 mt-1">{app.description}</p>
                            </div>
                            <span className="text-xs font-mono text-slate-600">{app.basePath}</span>
                        </Link>
                    );
                })}

                <Link href="/settings"
                    className="group bg-slate-900/30 border border-dashed border-slate-800 hover:border-slate-600 rounded-2xl p-5 transition-all flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="p-2.5 rounded-xl bg-slate-800 text-slate-300"><Settings size={22} /></span>
                        <ArrowRight size={18} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Settings</h2>
                        <p className="text-sm text-slate-400 mt-1">Database keep-alive, environment variables, and schemas.</p>
                    </div>
                    <span className="text-xs font-mono text-slate-600">/settings</span>
                </Link>
            </div>
        </div>
    );
}
