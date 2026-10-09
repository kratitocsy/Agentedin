import type { MetadataRoute } from "next";

// Public pages only. Opt-in public profile links (Phase 5) get added here from the database.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentedin.in";
  return [{ url: base, changeFrequency: "weekly", priority: 1 }];
}
