"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { InstallGameProvider } from "@/components/InstallGame";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppearanceProvider><InstallGameProvider>{children}</InstallGameProvider></AppearanceProvider>
    </SessionProvider>
  );
}
