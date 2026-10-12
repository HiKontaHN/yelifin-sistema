// app/(dashboard)/layout.tsx
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SWRProvider } from "@/components/providers/swr-provider";
import { DashboardLayoutClient } from "./dashboard-layout-client";

const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  return (
    <SWRProvider>
      <DashboardLayoutClient initialSidebarOpen={sidebarOpen}>
        {children}
      </DashboardLayoutClient>
    </SWRProvider>
  );
}
