import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorker } from "@/components/ServiceWorker";

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
    <html lang="en">
      <body>
        {/* Apply the saved deck-colour choice before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=localStorage.getItem('fiveo-deck')||'four';document.documentElement.setAttribute('data-deck',d);}catch(e){}",
          }}
        />
        <Providers>
          <ServiceWorker />
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
