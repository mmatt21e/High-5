import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorker } from "@/components/ServiceWorker";
import { DEFAULT_APPEARANCE, getAppearanceBootScript } from "@/lib/appearance";

export const metadata: Metadata = {
  title: "Five-O Poker",
  description: "Heads-up Five-O Poker, played across two devices.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Five-O" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a2a1a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-interface-style={DEFAULT_APPEARANCE.interfaceStyle}
      data-card-deck={DEFAULT_APPEARANCE.cardDeck}
      data-table-theme={DEFAULT_APPEARANCE.tableTheme}
      data-suit-palette={DEFAULT_APPEARANCE.suitPalette}
      data-deck={DEFAULT_APPEARANCE.suitPalette}
      suppressHydrationWarning
    >
      <body>
        {/* Validate and apply device-local appearance before the first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: getAppearanceBootScript(),
          }}
        />
        <Providers>
          <ServiceWorker />
          <div className="app-shell mx-auto flex min-h-screen w-full max-w-md flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
