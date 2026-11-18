import type { Metadata } from "next";
import { headers } from "next/headers";
import AnalyticsView from "../AnalyticsView";
import { StorageError } from "../client";
import { listCategories, listEntries, listTodos } from "../../../lib/tracker/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

export default async function TrackerAnalyticsPage() {
    const host = (await headers()).get("host");
    try {
        const [categories, entries, todos] = await Promise.all([listCategories(host), listEntries(host), listTodos(host)]);
        return <AnalyticsView categories={categories} entries={entries} todos={todos} />;
    } catch (error: any) {
        return <StorageError message={error?.message ?? "unknown error"} />;
    }
}
