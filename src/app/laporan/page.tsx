"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  BarChart4, 
  TrendingUp, 
  Wallet, 
  FileText, 
  ShoppingBag, 
  Activity, 
  ArrowRightLeft, 
  ClipboardList, 
  CheckCircle2,
  Layers,
  AlertTriangle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import LabaRugiPage from "@/app/laporan/laba-rugi/page";
import LaporanHppPage from "@/app/laporan/hpp/page";
import LabaRugiBersihPage from "@/app/laporan/laba-rugi-bersih/page";
import LaporanOperasionalPage from "@/app/operasional/laporan-operasional/page";
import LaporanBelanjaBahanBakuPage from "@/app/operasional/laporan-belanja-bahan-baku/page";
import LaporanPemakaianBahanBakuPage from "@/app/operasional/laporan-pemakaian-bahan-baku/page";
import LaporanPemindahanBarangPage from "@/app/operasional/laporan-pemindahan-barang/page";
import LaporanStockOpnamePage from "@/app/laporan/stock-opname/page";
import LaporanClosingTokoPage from "@/app/laporan/closing-toko/page";
import LaporanStockLossPage from "@/app/laporan/stock-loss/page";

function ReportHubContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const tabParam = searchParams.get("tab") || "keuangan";
  const [activeTab, setActiveTab] = useState(tabParam);

  useEffect(() => {
    queueMicrotask(() => {
      if (tabParam) {
        setActiveTab(tabParam);
      }
    });
  }, [tabParam]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    router.replace(`/laporan?tab=${val}`, { scroll: false });
  };

  const reportTabs = [
    { id: "keuangan", name: "1. Laporan Keuangan", icon: BarChart4 },
    { id: "hpp", name: "2. Laporan HPP", icon: TrendingUp },
    { id: "laba-rugi-bersih", name: "3. Laporan Laba Rugi", icon: Wallet },
    { id: "operasional", name: "4. Laporan Operasional", icon: FileText },
    { id: "belanja", name: "5. Belanja Bahan Baku", icon: ShoppingBag },
    { id: "pemakaian", name: "6. Pemakaian Bahan Baku", icon: Activity },
    { id: "pemindahan", name: "7. Pemindahan Barang", icon: ArrowRightLeft },
    { id: "stock-opname", name: "8. Stock Opnam", icon: ClipboardList },
    { id: "closing-toko", name: "9. Closing Toko", icon: CheckCircle2 },
    { id: "stock-loss", name: "10. Stock Loss Harian", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
            <Layers className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Pusat Laporan Terpadu</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-2">
            Laporan
          </h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Rekapitulasi Keuangan, HPP, Operasional & Stock Opname • Zona Waktu
          </p>
        </div>
      </div>

      {/* Tabs Navigation (Multi-row grid for PC & Mobile - No scrolling needed) */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-6">
        <TabsList className="bg-white p-2 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 h-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 w-full">
          {reportTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="w-full justify-start sm:justify-center rounded-xl font-black uppercase text-[9px] sm:text-[10px] tracking-wider px-3 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white transition-all duration-300 gap-2 whitespace-nowrap shadow-none"
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tab.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Contents */}
        <div className="bg-white/50 rounded-3xl p-1 sm:p-2 border border-slate-100/50 shadow-sm">
          <TabsContent value="keuangan" className="m-0">
            <LabaRugiPage />
          </TabsContent>

          <TabsContent value="hpp" className="m-0">
            <LaporanHppPage />
          </TabsContent>

          <TabsContent value="laba-rugi-bersih" className="m-0">
            <LabaRugiBersihPage />
          </TabsContent>

          <TabsContent value="operasional" className="m-0">
            <LaporanOperasionalPage />
          </TabsContent>

          <TabsContent value="belanja" className="m-0">
            <LaporanBelanjaBahanBakuPage />
          </TabsContent>

          <TabsContent value="pemakaian" className="m-0">
            <LaporanPemakaianBahanBakuPage />
          </TabsContent>

          <TabsContent value="pemindahan" className="m-0">
            <LaporanPemindahanBarangPage />
          </TabsContent>

          <TabsContent value="stock-opname" className="m-0">
            <LaporanStockOpnamePage />
          </TabsContent>

          <TabsContent value="closing-toko" className="m-0">
            <LaporanClosingTokoPage />
          </TabsContent>

          <TabsContent value="stock-loss" className="m-0">
            <LaporanStockLossPage />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function UnifiedLaporanPage() {
  return (
    <Suspense fallback={
      <div className="py-20 text-center font-black uppercase text-xs tracking-widest text-slate-400">
        Memuat Pusat Laporan...
      </div>
    }>
      <ReportHubContent />
    </Suspense>
  );
}
