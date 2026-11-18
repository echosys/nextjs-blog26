import { NotebookPen, Newspaper, type LucideIcon } from 'lucide-react';

export const HUB_NAME = 'App Hub';

export type AppNavLink = {
    label: string;
    href: string;
    /** Path prefix that marks the tab active; defaults to href. */
    matchPrefix?: string;
};

export type AppDefinition = {
    id: string;
    name: string;
    description: string;
    /** Landing URL opened from the navigator. */
    href: string;
    /** Every route of the app lives under this prefix. */
    basePath: string;
    icon: LucideIcon;
    /** Top-bar tabs this app contributes. */
    nav: AppNavLink[];
};

// To add an app: create src/app/<basePath>/ and register it here.
export const APPS: AppDefinition[] = [
    {
        id: 'blog',
        name: 'Blog',
        description: 'Dual-backend blog manager backed by MongoDB and Postgres.',
        href: '/blog/mongo',
        basePath: '/blog',
        icon: Newspaper,
        nav: [
            { label: 'Mongo Blog', href: '/blog/mongo' },
            { label: 'Postgres Blog', href: '/blog/pg' },
        ],
    },
    {
        id: 'tracker',
        name: 'Tracker',
        description: 'Daily journal with progress categories, to-dos, and a heatmap of your streaks.',
        href: '/tracker',
        basePath: '/tracker',
        icon: NotebookPen,
        nav: [{ label: 'Tracker', href: '/tracker' }],
    },
];
