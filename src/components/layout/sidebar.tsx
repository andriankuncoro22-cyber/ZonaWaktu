"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Soup,
  ClipboardCheck,
  PlusCircle,
  BarChart4,
  Settings,
  Boxes,
  Database,
  UserCheck,
  Truck,
  Home,
  ClipboardList,
  Package,
  Activity,
  ArrowRightLeft,
  Store,
  AlertOctagon
} from "lucide-react";
import { Button } from "@/components/ui/button";

const menuGroups = [
  {
    title: "General",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ]
  },
  {
    title: "Operasional",
    items: [
      { name: "Operasional Toko", icon: Store, href: "/operasional/operasional-toko" },
      { name: "Closing Toko", icon: PlusCircle, href: "/penjualan/kasir" },
      { name: "Rekapan Stock Kritis", icon: AlertOctagon, href: "/operasional/rekapan-stock-kritis" },
    ]
  },
  {
    title: "Laporan",
    items: [
      { name: "Laporan Keuangan", icon: BarChart4, href: "/laporan/laba-rugi" },
      { name: "Laporan HPP", icon: TrendingUp, href: "/laporan/hpp" },
      { name: "Laporan Laba Rugi", icon: TrendingUp, href: "/laporan/laba-rugi-bersih" },
      { name: "Laporan Operasional", icon: TrendingUp, href: "/operasional/laporan-operasional" },
      { name: "Laporan Belanja Bahan Baku", icon: Package, href: "/operasional/laporan-belanja-bahan-baku" },
      { name: "Laporan Pemakaian Bahan Baku", icon: Activity, href: "/operasional/laporan-pemakaian-bahan-baku" },
      { name: "Laporan Pemindahan Barang", icon: ArrowRightLeft, href: "/operasional/laporan-pemindahan-barang" },
      { name: "Laporan Stock Opnam", icon: ClipboardList, href: "/laporan/stock-opname" },
      { name: "Laporan Closing Toko", icon: ClipboardList, href: "/laporan/closing-toko" },
    ]
  },
  {
    title: "Inventori Gudang",
    items: [
      { name: "Input Bahan Baku", icon: Truck, href: "/inventori/input-bahan" },
      { name: "Harga Bahan Baku", icon: TrendingUp, href: "/inventori/harga-bahan-baku" },
      { name: "Stok Bahan Baku", icon: Boxes, href: "/stok/bahan-baku" },
      { name: "Stock Oknam", icon: ClipboardList, href: "/inventori/stock-opname" },
      { name: "Katalog Produk", icon: Soup, href: "/master/produk" },
      { name: "Resep Produk", icon: ClipboardCheck, href: "/master/resep" },
      { name: "Master Bahan Baku", icon: Database, href: "/master/bahan-baku" },
    ]
  },
  {
    title: "Setting",
    items: [
      { name: "Pengaturan Umum", icon: Settings, href: "/pengaturan" },
      { name: "Pengaturan Absensi", icon: UserCheck, href: "/pengaturan/absensi" },
    ]
  }
];

const adminMenuGroups = [
  {
    title: "Admin Menu",
    items: [
      { name: "Closing Toko", icon: PlusCircle, href: "/penjualan/kasir" },
      { name: "Stock Kritis", icon: AlertOctagon, href: "/operasional/rekapan-stock-kritis" },
      { name: "Stock Opname", icon: ClipboardList, href: "/admin/stock-opname" },
      { name: "Belanja Bahan Baku", icon: Truck, href: "/admin/belanja-bahan-baku" },
      { name: "Laporan Closing Toko", icon: ClipboardList, href: "/laporan/closing-toko" },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(localStorage.getItem("user_role"));
  }, []);

  const groups = role === "admin" ? adminMenuGroups : menuGroups;

  return (
    <div className="flex h-full flex-col py-8">
      <div className="flex-1 overflow-y-auto px-6 custom-scrollbar">
        <nav className="space-y-10 pb-12">
          {groups.map((group) => (
            <div key={group.title}>
              <h4 className="px-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mb-6">
                {group.title}
              </h4>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "group flex items-center justify-between rounded-2xl px-5 py-3.5 text-xs font-black transition-all duration-300 uppercase tracking-wider",
                        isActive 
                          ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <item.icon className={cn(
                          "h-5 w-5 transition-transform group-hover:scale-110",
                          isActive ? "text-white" : "text-slate-500 group-hover:text-primary"
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

      <div className="px-6 mt-auto">
        <Link href="/" onClick={() => localStorage.removeItem("user_role")}>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-4 rounded-2xl h-14 text-slate-400 hover:text-primary hover:bg-primary/5 font-black uppercase tracking-widest text-[9px] transition-all"
          >
            <Home className="h-5 w-5" />
            Landing Page
          </Button>
        </Link>
      </div>
    </div>
  );
}