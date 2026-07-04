"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { FirebaseClientProvider } from "@/firebase";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isStandalonePage =
    pathname === "/" ||
    pathname === "/absensi" ||
    pathname === "/owner-login" ||
    pathname.startsWith("/employee");

  return (
    <FirebaseClientProvider>
      {isStandalonePage ? (
        <main className="w-full min-h-screen">{children}</main>
      ) : (
        <div className="flex h-screen overflow-hidden p-0 md:p-4">
          <aside className="hidden lg:flex w-72 flex-col rounded-none lg:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 bg-white z-30 shrink-0">
            <Sidebar />
          </aside>

          <div className="flex flex-1 flex-col overflow-hidden relative ml-0 lg:ml-4">
            <Header />

            <main className="flex-1 overflow-y-auto px-4 md:px-8 py-4 custom-scrollbar">
              <div className="mx-auto max-w-7xl w-full">{children}</div>
            </main>
          </div>
        </div>
      )}
      <Toaster />
    </FirebaseClientProvider>
  );
}
