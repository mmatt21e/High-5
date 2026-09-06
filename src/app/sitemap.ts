import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://edgegames.win/" },
    { url: "https://edgegames.win/how-to-play" },
  ];
}
