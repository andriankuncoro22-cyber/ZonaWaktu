'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, Loader2 } from "lucide-react";
import { EmployeeSidebar } from "@/components/layout/employee-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const role = localStorage.getItem("user_role");
        const currentBranch = localStorage.getItem("current_branch") || "gdm";
        
        // Allow access if employee or admin/owner
        if (role === "employee" || role === "admin" || role === "owner") {
          setAuthorized(true);
        } else {
          setAuthorized(false);
          if (currentBranch === "kedungreja") {
            router.replace("/zona_kedungreja/employee-login");
          } else if (currentBranch === "tehwarga") {
            router.replace("/teh_warga_gdm/employee-login");
          } else {
            router.replace("/employee-login");
          }
        }
      } catch {
        setAuthorized(false);
        router.replace("/employee-login");
      }
    });
  }, [router]);

  if (authorized === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f4f5fa] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Memeriksa Hak Akses...</p>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f5fa]">
      <aside className="hidden lg:flex w-72 flex-col overflow-hidden rounded-none bg-white shadow-2xl shadow-slate-200/50 lg:rounded-[2.5rem] z-30 shrink-0">
        <EmployeeSidebar />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden relative">
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Zona Waktu</p>
            <p className="text-sm font-black uppercase italic text-slate-900">Employee Panel</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="h-10 w-10 rounded-2xl bg-slate-50 text-slate-700 shadow-sm"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        <div className={cn(
          "fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-all duration-300 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )} onClick={() => setMobileOpen(false)} />

        <div className={cn(
          "fixed left-0 top-0 z-50 h-full w-72 max-w-[85vw] transform border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <EmployeeSidebar />
        </div>

        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 lg:px-8 lg:py-6 custom-scrollbar">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
