module.exports = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleString(),
    NEXT_PUBLIC_GIT_COMMIT: gitCommit(),
  },
  pageExtensions: ["tsx", "ts"],
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/blog", destination: "/blog/mongo", permanent: false },
      // Pre-hub URLs; keep old bookmarks working.
      { source: "/mongo/:path*", destination: "/blog/mongo/:path*", permanent: false },
      { source: "/pg/:path*", destination: "/blog/pg/:path*", permanent: false },
    ];
  },
};

function gitCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return require("child_process").execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "local";
  }
}
