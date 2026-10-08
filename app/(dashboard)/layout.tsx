// app/(dashboard)/layout.tsx
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { DashboardLayoutClient } from "./dashboard-layout-client";

const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  return (
    <DashboardLayoutClient initialSidebarOpen={sidebarOpen}>
      {children}
    </DashboardLayoutClient>
  );
}
