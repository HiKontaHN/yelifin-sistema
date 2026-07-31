// app/(dashboard)/layout.tsx
"use client";

import React from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useOnboardingGuard } from "@/hooks/use-onboarding-guard";
import { usePlanGuard } from "@/hooks/use-plan-guard";
import { LoadingScreen } from "@/hooks/ui/loading-screen";
import { HiKontaTitle } from "@/components/shared/hikonta-title";
import { SWRProvider } from "@/components/providers/swr-provider";
import { PrivacyModeProvider } from "@/context/privacy-mode-context";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavUserMenu } from "@/components/nav-user-menu";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useRequireAuth();
  const { checking }              = useOnboardingGuard();
  usePlanGuard();

  if (loading || checking) return <LoadingScreen />;
  if (!firebaseUser) return null;

  return (
    <SWRProvider>
      <PrivacyModeProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />

        <SidebarInset className="flex flex-col overflow-hidden">
          {/* Header */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 py-4 lg:px-6">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
            <Breadcrumb className="md:hidden">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    <HiKontaTitle className="h-4" />
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle isCollapsed />
              <NavUserMenu />
            </div>
          </header>

          <main className="flex-1 overflow-auto pb-0 p-4 lg:p-6 h-full">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      </PrivacyModeProvider>
    </SWRProvider>
  );
}