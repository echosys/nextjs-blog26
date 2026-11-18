import type { Metadata } from "next";
import ActiveNavLink from "../components/ActiveNavLink";

export const metadata: Metadata = { title: { default: "Tracker", template: "%s · Tracker" } };

export default function TrackerLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">Tracker</h1>
                <nav className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                    <ActiveNavLink href="/tracker" exact size="sm">Journal</ActiveNavLink>
                    <ActiveNavLink href="/tracker/todos" size="sm">To-dos</ActiveNavLink>
                    <ActiveNavLink href="/tracker/analytics" size="sm">Analytics</ActiveNavLink>
                </nav>
            </div>
            {children}
        </div>
    );
}
