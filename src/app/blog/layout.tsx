import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Blog", template: "%s · Blog" } };

export default function BlogLayout({ children }: { children: React.ReactNode }) {
    return children;
}
