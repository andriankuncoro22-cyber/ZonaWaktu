"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Truck,
  ClipboardList,
  Layers,
  Wallet,
  Gift,
  AlertTriangle,
  Store,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutWithFirebaseAuth } from "@/lib/auth-service";
import { useActiveBranch, BRANCH_LIST, getBranchTheme } from "@/lib/branch-helper";

const menuGroups = [
  {
    title: "General",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/employee/dashboard" },
    ]
  },
  {
    title: "Operasional",
    items: [
      { name: "Operasional Kontainer", icon: ClipboardList, href: "/employee/operasional-kontainer" },
      { name: "Titip Jual (Konsinyasi)", icon: Store, href: "/employee/titip-jual" },
      { name: "Input Free", icon: Gift, href: "/employee/input-free" },
      { name: "Keuangan Kontainer", icon: Wallet, href: "/employee/keuangan-kontainer" },
    ]
  },
  {
    title: "Inventori",
    items: [
      { name: "Input Bahan Baku", icon: Truck, href: "/employee/input-bahan-baku" },
      { name: "Input Bahan Rusak", icon: AlertTriangle, href: "/employee/input-bahan-rusak" },
      { name: "Opnam Harian", icon: Layers, href: "/employee/opnam-harian" },
    ]
  }
];

export function EmployeeSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string>("");
  const activeBranch = useActiveBranch();
  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;
  const theme = getBranchTheme(activeBranch);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedUser = localStorage.getItem("karyawan_user") || localStorage.getItem("absensi_user");
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          setEmployeeName(parsed.nama || parsed.username || "");
        } else {
          const storedName = localStorage.getItem("employee_name");
          if (storedName) setEmployeeName(storedName);
        }
      } catch {}
    });
  }, []);

  const handleLogout = async () => {
    const branch = localStorage.getItem("current_branch");
    await logoutWithFirebaseAuth();
    if (branch === "gembong") {
      router.push("/zona_gembong/employee-login");
    } else if (branch === "kedungreja") {
      router.push("/zona_kedungreja/employee-login");
    } else if (branch === "tehwarga") {
      router.push("/teh_warga_gdm/employee-login");
    } else {
      router.push("/employee-login");
    }
  };

  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-100 shadow-sm py-5 sm:py-8">
      <div className="mb-6 px-5 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="block text-sm font-black uppercase italic leading-none tracking-[0.2em] text-slate-900">
            SISTEM
          </span>
          <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase border", theme.badgeClass)}>
            {branchInfo.shortName}
          </span>
        </div>
        <span className={cn("mt-1.5 block text-[9px] font-bold uppercase tracking-[0.1em]", theme.accentTextClass)}>
          Karyawan {branchInfo.name}
        </span>
        {employeeName && (
          <p className="mt-2 text-[10px] font-black uppercase text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 w-fit truncate max-w-full">
            👤 {employeeName}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 custom-scrollbar">
        <nav className="space-y-8 pb-10">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <h4 className="mb-3 px-3 text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">
                {group.title}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "group flex items-center justify-between rounded-2xl px-3.5 py-3 text-xs font-black transition-all duration-300 uppercase tracking-wider min-h-11",
                        isActive 
                          ? cn("text-white scale-[1.02]", theme.activeSidebarClass) 
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <item.icon className={cn(
                          "h-5 w-5 transition-transform group-hover:scale-110",
                          isActive ? "text-white" : cn("text-slate-500", theme.groupHoverTextClass)
                        )} />
                        {item.name}
                      </div>
                      {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-auto px-3 sm:px-6 pt-4 border-t border-slate-100">
        <Button 
          variant="ghost" 
          onClick={handleLogout}
          className="h-11 w-full justify-start gap-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50/50 hover:bg-rose-100 hover:text-rose-700 transition-all border border-rose-100/50"
        >
          <LogOut className="h-4 w-4" />
          Keluar (Logout)
        </Button>
      </div>
    </div>
  );
}
