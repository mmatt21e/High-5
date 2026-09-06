"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppearanceProvider } from "@/components/AppearanceProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppearanceProvider>{children}</AppearanceProvider>
    </SessionProvider>
  );
}
