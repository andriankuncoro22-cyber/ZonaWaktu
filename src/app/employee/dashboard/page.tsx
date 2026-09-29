"use client";

import React, { useMemo } from "react";
import { 
  TrendingUp,
  Package,
  ShoppingCart,
  AlertTriangle,
  Gift
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  Tooltip,
  Cell,
} from "recharts";
import { useFirestore, useCollection, useMemoFirebase, collection } from "@/firebase";
import { useActiveBranch, filterContainerMaterials, BRANCH_LIST, getBranchTheme } from "@/lib/branch-helper";
import { query, orderBy, limit, where } from "firebase/firestore";
import Link from "next/link";

export default function DashboardPage() {
  const mounted = true; // client component — always mounted
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;
  const theme = getBranchTheme(activeBranch);
  const isGembong = activeBranch === 'gembong';

  const penjualanQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), orderBy("tanggal", "desc"), limit(100)), 
    [db]
  );
  const { data: penjualanData } = useCollection(penjualanQuery);

  const bahanBakuQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("nama", "asc")), 
    [db]
  );
  const { data: rawBahanBakuData } = useCollection(bahanBakuQuery);
  const bahanBakuData = useMemo(() => {
    return filterContainerMaterials(rawBahanBakuData as any[], activeBranch);
  }, [rawBahanBakuData, activeBranch]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    const totalSalesMonth = penjualanData
      ?.filter(p => p.tanggal.startsWith(thisMonth))
      .reduce((sum, p) => sum + (p.total || 0), 0) || 0;

    const ordersToday = penjualanData
      ?.filter(p => p.tanggal === today)
      .length || 0;

    const lowStockItems = bahanBakuData
      ?.filter(b => (b.qtyBesar || 0) <= (Number(b.qtyMinGudang ?? b.qtyMin ?? 5))) || [];

    const getMinStockKontainer = (item: any) => Number(item.qtyMinKontainer ?? item.qtyMin ?? 5);
    const getKontainerTotal = (item: any) => {
      const qtyBulk = Number(item.qtyKontainerBesar || 0);
      const qtyAktif = Number(item.qtyKontainerKecil || 0);
      const konversi = Number(item.qtyKecil || 1);
      return qtyBulk + (qtyAktif / (konversi || 1));
    };

    const lowKontainerItems = bahanBakuData
      ?.filter(b => getKontainerTotal(b) <= getMinStockKontainer(b)) || [];

    return {
      totalSalesMonth,
      ordersToday,
      totalMaterials: bahanBakuData?.length || 0,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      lowKontainerCount: lowKontainerItems.length,
      lowKontainerItems
    };
  }, [penjualanData, bahanBakuData]);

  const chartData = useMemo(() => {
    const days = [];
    const date = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(date.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
      
      const dayTotal = penjualanData
        ?.filter(p => p.tanggal === dayStr)
        .reduce((sum, p) => sum + (p.total || 0), 0) || 0;

      days.push({ name: dayName, value: dayTotal / 1000 });
    }
    return days;
  }, [penjualanData]);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Branch Hero Welcome Card */}
      <Card className={cn(
        "rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl relative overflow-hidden border",
        isGembong 
          ? "bg-gradient-to-r from-[#070d19] via-[#0f172a] to-[#1e1b4b] border-indigo-500/40 shadow-indigo-950/30"
          : activeBranch === 'kedungreja'
          ? "bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 border-cyan-500/30 shadow-cyan-950/20"
          : activeBranch === 'tehwarga'
          ? "bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 border-amber-500/30 shadow-amber-950/20"
          : "bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border-emerald-500/30 shadow-emerald-950/20"
      )}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border",
                theme.badgeClass
              )}>
                <span className={cn("h-2 w-2 rounded-full animate-pulse", theme.dotColor)} />
                {branchInfo.code} &bull; {branchInfo.shortName}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/80 text-[8px] font-bold uppercase tracking-widest border border-white/10">
                Sistem Karyawan Aktif
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase italic tracking-tight text-white leading-tight">
              Dashboard Karyawan {branchInfo.shortName}
            </h1>
            <p className="text-xs md:text-sm text-slate-300 font-medium max-w-2xl leading-relaxed">
              Selamat bertugas di <strong className="text-white">{branchInfo.name}</strong>. Pantau pergerakan stok kontainer harian, catat operasional toko, dan kelola operasional dengan lancar.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Link href="/employee/operasional-kontainer">
              <Button className={cn("rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wider shadow-lg h-11 px-5", theme.buttonGradient)}>
                Operasional Kontainer
              </Button>
            </Link>
            <Link href="/employee/input-free">
              <Button variant="outline" className="rounded-xl md:rounded-2xl border-white/20 bg-white/10 hover:bg-white/20 text-white font-black text-[10px] md:text-xs uppercase tracking-wider h-11 px-4 gap-1.5">
                <Gift className="h-4 w-4" /> Free
              </Button>
            </Link>
          </div>
        </div>
        {/* Glow ambient background effect */}
        <div className={cn(
          "absolute -top-12 -right-12 h-64 w-64 rounded-full blur-3xl pointer-events-none opacity-30",
          isGembong ? "bg-indigo-500" : activeBranch === 'kedungreja' ? "bg-cyan-500" : activeBranch === 'tehwarga' ? "bg-amber-500" : "bg-emerald-500"
        )} />
      </Card>

      {/* Stats Bento Box */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {[
          { 
            label: "Penjualan Bulan Ini", 
            value: `Rp ${(stats.totalSalesMonth / 1000000).toFixed(1)}M`, 
            change: "Real-time", 
            icon: TrendingUp, 
            color: theme.accentBgClass
          },
          { 
            label: "Pesanan Hari Ini", 
            value: stats.ordersToday.toString(), 
            change: "Closing", 
            icon: ShoppingCart, 
            color: "bg-orange-50 text-orange-600" 
          },
          { 
            label: "Total Bahan Baku", 
            value: stats.totalMaterials.toString(), 
            change: "Master", 
            icon: Package, 
            color: "bg-slate-50 text-slate-700" 
          },
          { 
            label: "Restock Kontainer", 
            value: stats.lowKontainerCount.toString(), 
            change: "Warning", 
            icon: AlertTriangle, 
            color: stats.lowKontainerCount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600" 
          },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 bg-white overflow-hidden relative group hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
            <div>
              <div className={cn("h-10 w-10 md:h-14 md:w-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3", stat.color)}>
                <stat.icon className="h-5 w-5 md:h-7 md:w-7" />
              </div>
              <p className="text-[8px] md:text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
            </div>
            <div className="flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between mt-auto">
              <h3 className="text-sm sm:text-lg md:text-2xl font-black text-slate-900 tracking-tight truncate max-w-full">{stat.value}</h3>
              <span className={cn("text-[7px] md:text-[9px] font-black px-1.5 py-0.5 md:py-1 rounded-md shrink-0 w-fit", 
                i === 0 ? cn(theme.accentBgClass, "border", theme.accentBorderClass) :
                stat.color.includes("emerald") ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                {stat.change}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts and Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <Card className="lg:col-span-8 border-none shadow-sm rounded-3xl md:rounded-[3rem] bg-white p-6 md:p-10">
          <div className="flex items-center justify-between mb-8 md:mb-10">
            <div>
              <h3 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-3 uppercase italic">
                <TrendingUp className={cn("h-5 w-5 md:h-6 md:w-6", theme.accentTextClass)} />
                Tren Penjualan (Ribuan)
              </h3>
              <p className="text-[9px] md:text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-1">Performa 7 hari terakhir &bull; {branchInfo.shortName}</p>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black uppercase border", theme.badgeClass)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", theme.dotColor)} />
              {branchInfo.shortName}
            </span>
          </div>
          <div className="h-[250px] md:h-[350px] w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.chartBarColor} stopOpacity={1}/>
                      <stop offset="100%" stopColor={theme.chartBarColor} stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={30}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index === chartData.length - 1 ? 'url(#barGradient)' : isGembong ? '#e0e7ff' : '#f8fafc'} 
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ))}
                  </Bar>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#475569', fontSize: 10, fontWeight: 800 }} 
                    dy={10}
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                    formatter={(value) => [`Rp ${Number(value).toLocaleString('id-ID')}k`, 'Penjualan']}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse" />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-4 border-none shadow-sm rounded-3xl md:rounded-[3rem] bg-white p-6 md:p-10">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h3 className="text-lg md:text-xl font-black text-slate-900 uppercase italic">Restock Kontainer</h3>
            <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center cursor-pointer hover:bg-slate-100">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
          </div>
          <div className="space-y-4 md:space-y-6">
            {stats.lowKontainerItems.length > 0 ? stats.lowKontainerItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 md:gap-4 group cursor-pointer">
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100">
                  <Package className="h-5 w-5 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] md:text-sm font-black text-slate-900 truncate tracking-tight uppercase italic">{item.nama}</p>
                    <span className="text-[8px] md:text-[9px] text-rose-600 font-black ml-2 uppercase">Kritis</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
                      Sisa: {item.qtyKontainerBesar || 0} {item.satuanBesar} / {item.qtyKontainerKecil || 0} {item.satuanKecil}
                    </p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-16 md:py-20 text-center opacity-30 flex flex-col items-center gap-4">
                <Package className="h-10 w-10 md:h-12 md:w-12" />
                <p className={cn("text-[9px] md:text-[10px] font-black uppercase tracking-widest", theme.accentTextClass)}>
                  Stok Kontainer {branchInfo.shortName} Aman
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
