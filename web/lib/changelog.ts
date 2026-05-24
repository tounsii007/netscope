/**
 * In-tree release-notes feed for the /changelog page. Each entry is
 * append-only and version-tagged so the diff between releases is
 * always reviewable in git.
 *
 * Why not parse git tags or a CHANGELOG.md file:
 *   • Builds are server-rendered; reading the filesystem at build
 *     time works but adds bundling friction (extra Markdown parser,
 *     loader config).
 *   • This array lives in TypeScript so it's type-checked AND fully
 *     i18nable by reference if we ever want to translate entries —
 *     the `tag` keys would just point at i18n message paths.
 *
 * Newest entries go on top; the rendering code does NOT sort.
 */

export type ChangelogTag = "feat" | "fix" | "polish" | "security";

export interface ChangelogItem {
  tag: ChangelogTag;
  /** Short title shown bold in the row. */
  title: string;
  /** Optional one-line body shown below the title. */
  body?: string;
}

export interface ChangelogRelease {
  /** Display date — ISO 8601 yyyy-mm-dd. Sorted is the caller's job. */
  date: string;
  /** Optional release label (e.g. "v2.4"). Stays null until a real tag exists. */
  version?: string;
  items: ChangelogItem[];
}

/**
 * Append-only. Pad with leading-zero months and days so `date` sorts
 * lexicographically. Newest first.
 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    date: "2026-05-24",
    items: [
      { tag: "feat", title: "Live input validation chips",
        body: "Every tool input shows a ✓ green / ⓘ red status as you type." },
      { tag: "feat", title: "Shareable ?target= deep-links + Share button",
        body: "Five tools now sync the URL with the current input so links can be pasted into tickets." },
      { tag: "feat", title: "Recent-targets dropdown",
        body: "localStorage-backed last-5 lookups per tool with one-click recall." },
      { tag: "feat", title: "Copy result button on every panel",
        body: "Click Copy → paste a pretty-JSON snapshot of the result anywhere." },
      { tag: "feat", title: "Toast / snackbar feedback system",
        body: "Non-blocking success/error notifications for copy + share + form actions." },
      { tag: "feat", title: "Cmd+K command palette + ? keyboard help",
        body: "Keyboard-driven quick switcher across all 25 tools, plus a cheat-sheet modal." },
      { tag: "feat", title: "Skeleton placeholders during loading",
        body: "Result panels reserve their shape while the lookup runs — no more layout pop." },
      { tag: "polish", title: "Dashboard timeout + retry button",
        body: "5 s deadline on /me with a visible Retry instead of an infinite spinner." },
    ],
  },
  {
    date: "2026-05-20",
    items: [
      { tag: "feat", title: "Modern landing page (mesh hero + categorised grid)",
        body: "Full visual redesign in 6 iterations: hero, navigation, tool shell, footer, tool pages, micro-interactions." },
      { tag: "feat", title: "Floating widgets",
        body: "Top scroll-progress hairline + bottom-right back-to-top button." },
      { tag: "security", title: "CSP unsafe-eval relaxed in dev only",
        body: "Production keeps the strict policy; dev allows React Refresh to run." },
      { tag: "fix", title: "ICU <domain> placeholder collision",
        body: "Replaced literal <domain> with ‹domain› across 11 locales — the ICU parser no longer mistakes it for an unclosed rich-text tag." },
      { tag: "fix", title: "/icon.png 500 on every page",
        body: "Removed app/icon.png to break the favicon-route conflict with the static asset." },
    ],
  },
  {
    date: "2026-05-17",
    items: [
      { tag: "feat", title: "Backend stable error-code envelope",
        body: "Every error response now includes { error, code, message, path, requestId, timestamp }." },
      { tag: "security", title: "SafeHttpClient blocks scheme downgrades + non-http redirects",
        body: "https → http downgrades are rejected; file://, gopher://, jar: redirects throw TARGET_BLOCKED." },
      { tag: "security", title: "BoundedDns record-count cap",
        body: "Lookups are capped at 200 records to prevent malicious resolvers from blowing up serialization." },
      { tag: "security", title: "HttpUrlNormaliser rejects non-http schemes",
        body: "No more https://ftp://example.com gibberish — unsupported schemes throw 400." },
      { tag: "polish", title: "ClientIpResolver normalises IPv4-mapped IPv6",
        body: "::ffff:1.2.3.4 collapses to 1.2.3.4 so log greps line up across dual-stack hosts." },
    ],
  },
];
