import { headers } from "next/headers";
import JournalView from "./JournalView";
import { StorageError } from "./client";
import { listCategories, listEntries, listTodos } from "../../lib/tracker/storage";

export const dynamic = "force-dynamic";

export default async function TrackerJournalPage() {
    const host = (await headers()).get("host");
    try {
        const [categories, entries, todos] = await Promise.all([listCategories(host), listEntries(host), listTodos(host)]);
        return <JournalView categories={categories} entries={entries} todos={todos.filter((todo) => todo.doneDate)} />;
    } catch (error: any) {
        return <StorageError message={error?.message ?? "unknown error"} />;
    }
}
