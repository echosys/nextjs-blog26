import type { Metadata } from "next";
import { headers } from "next/headers";
import TodosView from "../TodosView";
import { StorageError } from "../client";
import { listTodos, trackerSettings } from "../../../lib/tracker/storage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "To-dos" };

export default async function TrackerTodosPage() {
    const host = (await headers()).get("host");
    try {
        return <TodosView todos={await listTodos(host)} settings={trackerSettings()} />;
    } catch (error: any) {
        return <StorageError message={error?.message ?? "unknown error"} />;
    }
}
