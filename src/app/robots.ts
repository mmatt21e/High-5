import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/how-to-play"],
      disallow: ["/admin", "/api/", "/play/", "/profile", "/lobby", "/settings", "/login", "/register"],
    },
    sitemap: "https://edgegames.win/sitemap.xml",
    host: "https://edgegames.win",
  };
}
