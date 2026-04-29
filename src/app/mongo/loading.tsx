export default function MongoLoading() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar skeleton */}
                <aside className="w-full md:w-64 space-y-3">
                    <div className="h-3 bg-slate-800 rounded w-28 mb-4" />
                    <div className="flex flex-wrap md:flex-col gap-2">
                        {[80, 64, 96, 72].map((w, i) => (
                            <div key={i} className="h-9 bg-slate-900 rounded-lg" style={{ width: `${w}px` }} />
                        ))}
                    </div>
                </aside>

                {/* Main content skeleton */}
                <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="h-8 bg-slate-800 rounded w-36" />
                        <div className="h-9 bg-slate-900 rounded-lg w-28" />
                    </div>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-2 flex-1 pr-4">
                                    <div className="h-5 bg-slate-800 rounded w-3/5" />
                                    <div className="flex gap-2">
                                        <div className="h-4 bg-slate-800/60 rounded w-12" />
                                        <div className="h-4 bg-slate-800/60 rounded w-16" />
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <div className="w-8 h-8 bg-slate-800 rounded-lg" />
                                    <div className="w-8 h-8 bg-slate-800 rounded-lg" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 bg-slate-800/50 rounded w-full" />
                                <div className="h-4 bg-slate-800/50 rounded w-4/5" />
                                <div className="h-4 bg-slate-800/50 rounded w-2/3" />
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                                <div className="h-3 bg-slate-800 rounded w-24" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
