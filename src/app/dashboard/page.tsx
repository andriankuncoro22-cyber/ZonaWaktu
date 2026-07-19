"use client";

import React, { useMemo, useState } from "react";
import { 
  TrendingUp,
  MoreHorizontal,
  ArrowUpRight,
  Clock,
  Package,
  ShoppingCart,
  AlertTriangle,
  ArrowRight,
  Calendar
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  ResponsiveContainer, 
  AreaChart,
  Area,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  CartesianGrid
} from "recharts";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit, where } from "firebase/firestore";
import Link from "next/link";
import { getTotalAvailableQty, getAverageCost, calculateRecipeIngredientCost } from "@/lib/hpp";

export default function DashboardPage() {
  const db = useFirestore();
  const mounted = true; // client component — always mounted

  const [finPeriod, setFinPeriod] = useState<"month" | "yesterday">("month");
  const [pemakaianPeriod, setPemakaianPeriod] = useState<"today" | "month">("today");

  // --- Local types for stats computation ---
  interface ProdukDoc { id: string; code?: string; [k: string]: unknown; }
  interface KomposisiItem { bahanBakuId?: string; [k: string]: unknown; }
  interface ResepDoc { produkId?: string; komposisi?: KomposisiItem[]; [k: string]: unknown; }
  interface BahanBakuDoc {
    id: string;
    nama?: string;
    qtyBesar?: number;
    satuanBesar?: string;
    qtyKontainerBesar?: unknown;
    qtyKontainerKecil?: unknown;
    qtyKecil?: unknown;
    qtyMinGudang?: number;
    qtyMin?: number;
    qtyMinKontainer?: number;
    [k: string]: unknown;
  }
  interface PenjualanItem { code?: string; total?: number; [k: string]: unknown; }
  interface PenjualanLog { tanggal: string; total?: number; items?: PenjualanItem[]; [k: string]: unknown; }

  const penjualanQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), orderBy("tanggal", "desc"), limit(100)), 
    [db]
  );
  const { data: penjualanData } = useCollection(penjualanQuery);

  const bahanBakuQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("nama", "asc")), 
    [db]
  );
  const { data: bahanBakuData } = useCollection(bahanBakuQuery);

  const resepQuery = useMemoFirebase(() => collection(db, "resep"), [db]);
  const { data: resepData } = useCollection(resepQuery);

  const produkQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const { data: produkData } = useCollection(produkQuery);

  const operasionalTokoQuery = useMemoFirebase(() => collection(db, "operasional-toko"), [db]);
  const { data: operasionalTokoData } = useCollection(operasionalTokoQuery);

  const operasionalKontainerQuery = useMemoFirebase(() => collection(db, "operasional-kontainer"), [db]);
  const { data: operasionalKontainerData } = useCollection(operasionalKontainerQuery);

  // Fetch recent log_produksi_pelengkap for filtering today vs monthly usage
  const pemakaianQuery = useMemoFirebase(() => 
    query(collection(db, "log_produksi_pelengkap"), orderBy("createdAt", "desc"), limit(300)), 
    [db]
  );
  const { data: pemakaianData } = useCollection(pemakaianQuery);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  const yesterdayInfo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().split('T')[0];
    const formatted = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return { iso, formatted };
  }, []);

  const stats = useMemo(() => {
    const today = todayStr;
    const yesterday = yesterdayInfo.iso;
    const thisMonth = new Date().toISOString().slice(0, 7);

    // 1. Penjualan (Bulan Ini & H-1)
    const totalSalesMonth = penjualanData
      ?.filter(p => p.tanggal?.startsWith(thisMonth))
      .reduce((sum, p) => sum + (p.total || 0), 0) || 0;

    const totalSalesYesterday = penjualanData
      ?.filter(p => p.tanggal === yesterday)
      .reduce((sum, p) => sum + (p.total || 0), 0) || 0;

    const ordersToday = penjualanData
      ?.filter(p => p.tanggal === today)
      .length || 0;

    // 2. Operasional (Bulan Ini & H-1)
    const totalOperasionalTokoMonth = operasionalTokoData
      ?.filter(op => op.tanggal?.startsWith(thisMonth))
      .reduce((sum, op) => sum + (Number(op.nominal) || Number(op.total) || 0), 0) || 0;

    const totalOperasionalKontainerMonth = operasionalKontainerData
      ?.filter(op => op.tanggal?.startsWith(thisMonth))
      .reduce((sum, op) => sum + (Number(op.nominal) || 0), 0) || 0;

    const totalOperasionalMonth = totalOperasionalTokoMonth + totalOperasionalKontainerMonth;

    const totalOperasionalTokoYesterday = operasionalTokoData
      ?.filter(op => op.tanggal === yesterday)
      .reduce((sum, op) => sum + (Number(op.nominal) || Number(op.total) || 0), 0) || 0;

    const totalOperasionalKontainerYesterday = operasionalKontainerData
      ?.filter(op => op.tanggal === yesterday)
      .reduce((sum, op) => sum + (Number(op.nominal) || 0), 0) || 0;

    const totalOperasionalYesterday = totalOperasionalTokoYesterday + totalOperasionalKontainerYesterday;

    // 3. Estimasi Pemakaian Bahan (HPP berdasarkan Resep vs Harga Bahan)
    const productCodeMap: Record<string, string> = {};
    (produkData as ProdukDoc[])?.forEach((product) => {
      if (product.code) productCodeMap[product.code] = product.id;
    });

    const recipeMap: Record<string, KomposisiItem[]> = {};
    (resepData as ResepDoc[])?.forEach((recipe) => {
      if (recipe.produkId) recipeMap[recipe.produkId] = recipe.komposisi || [];
    });

    const materialMap: Record<string, BahanBakuDoc> = {};
    (bahanBakuData as BahanBakuDoc[])?.forEach((material) => {
      materialMap[material.id] = material;
    });

    let totalHppMonth = 0;
    const thisMonthSales = (penjualanData as PenjualanLog[])?.filter(p => p.tanggal?.startsWith(thisMonth)) || [];
    thisMonthSales.forEach((closing) => {
      closing.items?.forEach((item) => {
        const qty = Number(item.total || 0);
        const productId = productCodeMap[item.code];
        const recipe = recipeMap[productId] || [];
        recipe.forEach((ingredient: KomposisiItem) => {
          const material = materialMap[ingredient?.bahanBakuId];
          totalHppMonth += calculateRecipeIngredientCost(ingredient, material, qty);
        });
      });
    });

    let totalHppYesterday = 0;
    const yesterdaySales = (penjualanData as PenjualanLog[])?.filter(p => p.tanggal === yesterday) || [];
    yesterdaySales.forEach((closing) => {
      closing.items?.forEach((item) => {
        const qty = Number(item.total || 0);
        const productId = productCodeMap[item.code];
        const recipe = recipeMap[productId] || [];
        recipe.forEach((ingredient: KomposisiItem) => {
          const material = materialMap[ingredient?.bahanBakuId];
          totalHppYesterday += calculateRecipeIngredientCost(ingredient, material, qty);
        });
      });
    });

    // 4. Margin Keuntungan (Laba Bersih)
    const profitMonth = Math.max(0, totalSalesMonth - totalOperasionalMonth - totalHppMonth);
    const profitMarginMonth = totalSalesMonth > 0 ? (profitMonth / totalSalesMonth) * 100 : 0;

    const profitYesterday = Math.max(0, totalSalesYesterday - totalOperasionalYesterday - totalHppYesterday);
    const profitMarginYesterday = totalSalesYesterday > 0 ? (profitYesterday / totalSalesYesterday) * 100 : 0;

    const lowStockItems = (bahanBakuData as BahanBakuDoc[])
      ?.filter(b => (Number(b.qtyBesar) || 0) <= (Number(b.qtyMinGudang ?? b.qtyMin ?? 5))) || [];

    const getMinStockKontainer = (item: BahanBakuDoc) => Number((item as Record<string, unknown>).qtyMinKontainer ?? (item as Record<string, unknown>).qtyMin ?? 5);
    const getKontainerTotal = (item: BahanBakuDoc) => {
      const qtyBulk = Number(item.qtyKontainerBesar || 0);
      const qtyAktif = Number(item.qtyKontainerKecil || 0);
      const konversi = Number(item.qtyKecil || 1);
      return qtyBulk + (qtyAktif / (konversi || 1));
    };

    const lowKontainerItems = (bahanBakuData as BahanBakuDoc[])
      ?.filter(b => getKontainerTotal(b) <= getMinStockKontainer(b)) || [];

    return {
      totalSalesMonth,
      totalSalesYesterday,
      ordersToday,
      totalMaterials: bahanBakuData?.length || 0,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      lowKontainerCount: lowKontainerItems.length,
      lowKontainerItems,
      hppMonth: totalHppMonth,
      hppYesterday: totalHppYesterday,
      operasionalMonth: totalOperasionalMonth,
      operasionalYesterday: totalOperasionalYesterday,
      salesMonth: totalSalesMonth,
      profitMonth,
      profitMarginMonth,
      profitYesterday,
      profitMarginYesterday
    };
  }, [penjualanData, bahanBakuData, produkData, resepData, operasionalTokoData, operasionalKontainerData, todayStr, yesterdayInfo]);

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

      days.push({ name: dayName, value: dayTotal });
    }
    return days;
  }, [penjualanData]);

  const dailyFinancialChartData = useMemo(() => {
    if (!penjualanData || !produkData || !resepData || !bahanBakuData) return [];

    const productCodeMap: Record<string, string> = {};
    (produkData as any[])?.forEach((product) => {
      if (product.code) productCodeMap[product.code] = product.id;
    });

    const recipeMap: Record<string, any[]> = {};
    (resepData as any[])?.forEach((recipe) => {
      if (recipe.produkId) recipeMap[recipe.produkId] = recipe.komposisi || [];
    });

    const materialMap: Record<string, any> = {};
    (bahanBakuData as any[])?.forEach((material) => {
      materialMap[material.id] = material;
    });

    const days = [];
    const date = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(date.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });

      // Daily Sales
      const sales = penjualanData
        ?.filter((p: any) => p.tanggal === dayStr)
        .reduce((sum: number, p: any) => sum + (p.total || 0), 0) || 0;

      // Daily Operasional
      const operasionalToko = operasionalTokoData
        ?.filter((op: any) => op.tanggal === dayStr)
        .reduce((sum: number, op: any) => sum + (Number(op.nominal) || Number(op.total) || 0), 0) || 0;

      const operasionalKontainer = operasionalKontainerData
        ?.filter((op: any) => op.tanggal === dayStr)
        .reduce((sum: number, op: any) => sum + (Number(op.nominal) || 0), 0) || 0;

      const operasional = operasionalToko + operasionalKontainer;

      // Daily HPP
      let hpp = 0;
      const daySales = (penjualanData as any[])?.filter((p) => p.tanggal === dayStr) || [];
      daySales.forEach((closing) => {
        closing.items?.forEach((item: any) => {
          const qty = Number(item.total || 0);
          const productId = productCodeMap[item.code];
          const recipe = recipeMap[productId] || [];
          recipe.forEach((ingredient) => {
            const material = materialMap[ingredient?.bahanBakuId];
            hpp += calculateRecipeIngredientCost(ingredient, material, qty);
          });
        });
      });

      // Daily Profit (Laba Bersih) = Sales - Operasional - HPP
      const profit = Math.max(0, sales - operasional - hpp);
      const beban = hpp + operasional;

      days.push({
        name: dayName,
        sales,
        hpp,
        operasional,
        profit,
        beban,
      });
    }
    return days;
  }, [penjualanData, produkData, resepData, bahanBakuData, operasionalTokoData, operasionalKontainerData]);

  // Pemakaian Bahan Baku (Dukungan Hari Ini & Per Bulan)
  const usageDataFiltered = useMemo(() => {
    const agg: { [id: string]: number } = {};
    if (!pemakaianData || !resepData) return [];
    const resepMap: any = {};
    resepData.forEach((r: any) => { resepMap[r.id] = r; });

    const thisMonth = new Date().toISOString().slice(0, 7);

    const logsToProcess = pemakaianData.filter((log: any) => {
      if (pemakaianPeriod === "today") {
        return log.tanggal === todayStr;
      } else {
        return log.tanggal?.startsWith(thisMonth);
      }
    });

    logsToProcess.forEach((log: any) => {
      const items = log.items || [];
      items.forEach((it: any) => {
        const resep = resepMap[it.resepId];
        if (!resep) return;
        (resep.komposisi || []).forEach((ing: any) => {
          agg[ing.bahanBakuId] = (agg[ing.bahanBakuId] || 0) + (ing.jumlah * (it.jumlah || 1));
        });
      });
    });

    const rows = Object.entries(agg).map(([id, qty]) => {
      const mat = bahanBakuData?.find(b => b.id === id);
      return { id, code: mat?.code || "-", nama: mat?.nama || "-", qty };
    }).sort((a: any, b: any) => b.qty - a.qty);

    return rows;
  }, [pemakaianData, resepData, bahanBakuData, pemakaianPeriod, todayStr]);

  const bestSellers = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0,7);
    const agg: { [code: string]: { name: string; qty: number } } = {};
    (penjualanData || []).filter((p: any) => p.tanggal?.startsWith(thisMonth)).forEach((p: any) => {
      (p.items || []).forEach((it: any) => {
        const code = it.code || it.kode || "-";
        if (!agg[code]) agg[code] = { name: it.name || it.nama || code, qty: 0 };
        agg[code].qty += Number(it.total || it.qty || 0);
      });
    });
    return Object.values(agg).sort((a:any,b:any)=>b.qty-a.qty).slice(0,5);
  }, [penjualanData]);

  const bestSellersChartData = useMemo(() => {
    const colors = ["#8b1a1a", "#4f46e5", "#f59e0b", "#10b981", "#ec4899"];
    return bestSellers.map((item, idx) => ({
      name: item.name,
      value: item.qty,
      color: colors[idx % colors.length]
    }));
  }, [bestSellers]);

  const bb043 = useMemo(() => (bahanBakuData || []).find(b => (b.code || '').toUpperCase() === 'BB043') || null, [bahanBakuData]);

  // Dynamic Financial Stats based on filter selection
  const currentSales = finPeriod === "month" ? stats.salesMonth : stats.totalSalesYesterday;
  const currentOperasional = finPeriod === "month" ? stats.operasionalMonth : stats.operasionalYesterday;
  const currentHpp = finPeriod === "month" ? stats.hppMonth : stats.hppYesterday;
  const currentProfit = finPeriod === "month" ? stats.profitMonth : stats.profitYesterday;
  const currentProfitMargin = finPeriod === "month" ? stats.profitMarginMonth : stats.profitMarginYesterday;

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-10">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Dashboard</h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Welcome back to Zona Waktu System</p>
        </div>
        <Link href="/penjualan/kasir" className="w-full md:w-auto">
          <Button className="w-full md:w-auto rounded-xl md:rounded-2xl bg-primary hover:bg-primary/90 px-8 font-black shadow-xl shadow-primary/20 h-12 uppercase tracking-widest text-[10px]">
            Input Closing Harian
          </Button>
        </Link>
      </div>

      {/* Stats Bento Box */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {[
          { 
            label: "Penjualan Bulan Ini", 
            value: `Rp ${(stats.totalSalesMonth).toLocaleString('id-ID')}`, 
            change: "Real-time", 
            icon: TrendingUp, 
            color: "bg-red-50 text-primary" 
          },
          { 
            label: "Pesanan Hari Ini", 
            value: `${stats.ordersToday.toString()} Pesanan`, 
            change: "Closing", 
            icon: ShoppingCart, 
            color: "bg-orange-50 text-orange-600" 
          },
          { 
            label: "Margin Keuntungan", 
            value: `${stats.profitMarginMonth.toFixed(1)}%`, 
            change: `${((stats.profitMarginMonth) >= 50) ? 'Sehat' : 'Normal'}`, 
            icon: Package, 
            color: "bg-emerald-50 text-emerald-600" 
          },
          { 
            label: "Restock Kontainer", 
            value: `${stats.lowKontainerCount} Item`, 
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
              <h3 className="text-xs sm:text-lg md:text-2xl font-black text-slate-900 tracking-tight truncate max-w-full">{stat.value}</h3>
              <span className={cn("text-[7px] md:text-[9px] font-black px-1.5 py-0.5 md:py-1 rounded-md shrink-0 w-fit", 
                stat.color.includes("emerald") || stat.change === 'Sehat' ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                {stat.change}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Sales Trend (Area Chart) */}
        <Card className="lg:col-span-8 border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-3 uppercase italic">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tren Penjualan Harian
            </h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Performa Omset 7 Hari Terakhir</p>
          </div>
          
          <div className="h-[250px] md:h-[300px] w-full mt-6">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b1a1a" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#8b1a1a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(tick) => `Rp ${(tick / 1000).toLocaleString('id-ID')}k`}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                    formatter={(value) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Omset']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8b1a1a" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorSales)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse" />
            )}
          </div>
        </Card>

        {/* Best Sellers (Pie/Donut Chart) */}
        <Card className="lg:col-span-4 border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8 flex flex-col justify-between">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 uppercase italic">Produk Terlaris</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Top 5 Penjualan Terbanyak Bulan Ini</p>
          </div>

          <div className="h-[180px] w-full mt-4 relative flex items-center justify-center">
            {mounted ? (
              bestSellersChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bestSellersChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {bestSellersChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                      formatter={(value) => [`${value} Pcs`, 'Terjual']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Belum ada penjualan</p>
              )
            ) : (
              <div className="h-28 w-28 rounded-full border-4 border-slate-100 border-t-primary animate-spin" />
            )}
          </div>

          <div className="mt-4 space-y-2">
            {bestSellersChartData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px] font-black uppercase tracking-tight">
                <div className="flex items-center gap-2 truncate max-w-[70%]">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="truncate text-slate-700">{item.name}</span>
                </div>
                <span className="text-slate-900 font-black">{item.value} Pcs</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Financial Analytics Grid (Laba Rugi & HPP Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Card Laba Rugi */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-3 uppercase italic">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Perbandingan Laba & Beban
            </h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Laba Bersih vs Beban (HPP + Operasional) 7 Hari Terakhir</p>
          </div>
          
          <div className="h-[250px] md:h-[300px] w-full mt-6">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyFinancialChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(tick) => `Rp ${(tick / 1000).toLocaleString('id-ID')}k`}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                    formatter={(value, name) => [
                      `Rp ${Number(value).toLocaleString('id-ID')}`, 
                      name === 'profit' ? 'Laba Bersih' : 'Beban (HPP + Ops)'
                    ]}
                  />
                  <Bar dataKey="profit" name="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="beban" name="beban" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse" />
            )}
          </div>
        </Card>

        {/* Card HPP */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-3 uppercase italic">
              <Package className="h-5 w-5 text-indigo-600" />
              Tren HPP Bahan Baku
            </h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Nilai HPP (Cost of Goods Sold) 7 Hari Terakhir</p>
          </div>
          
          <div className="h-[250px] md:h-[300px] w-full mt-6">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyFinancialChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHpp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(tick) => `Rp ${(tick / 1000).toLocaleString('id-ID')}k`}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                    formatter={(value) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'HPP']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="hpp" 
                    stroke="#6366f1" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorHpp)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse" />
            )}
          </div>
        </Card>
      </div>

      {/* Operational & Financial Details Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Card 1: HPP, Margin & Profit */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic mb-1">Analisis Keuangan</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {finPeriod === "month" ? "Performa Profitabilitas Toko Bulan Ini" : `Performa Profitabilitas H-1 (${yesterdayInfo.formatted})`}
              </p>
            </div>
            {/* Filter Toggle Period */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 self-start shrink-0">
              <button
                type="button"
                onClick={() => setFinPeriod("month")}
                className={cn(
                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  finPeriod === "month" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setFinPeriod("yesterday")}
                className={cn(
                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  finPeriod === "yesterday" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                H-1 (Kemarin)
              </button>
            </div>
          </div>
          
          <div className="space-y-4 my-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase">Omset Kotor</span>
              <span className="text-sm font-black text-slate-900">Rp {currentSales.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase">Total Operasional</span>
              <span className="text-sm font-black text-slate-700">Rp {currentOperasional.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase">Estimasi Pemakaian Bahan</span>
              <span className="text-sm font-black text-primary">Rp {currentHpp.toLocaleString('id-ID')}</span>
            </div>
            
            <div className="h-[1px] bg-slate-100" />
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase">Laba Bersih</span>
              <span className="text-sm font-black text-emerald-600">Rp {currentProfit.toLocaleString('id-ID')}</span>
            </div>

            {/* Profit Margin Progress Bar */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase">
                <span>Profit Margin Ratio</span>
                <span className="text-slate-800">{currentProfitMargin.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, currentProfitMargin)}%` }} />
              </div>
            </div>
          </div>

          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide leading-relaxed">
            * HPP dihitung secara otomatis berdasarkan data closing {finPeriod === "month" ? "harian" : "tanggal kemarin"} resep & bahan baku aktif.
          </div>
        </Card>

        {/* Card 2: Pemakaian Bahan Baku */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic mb-1">Pemakaian Bahan Baku</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {pemakaianPeriod === "today" ? "Top Konsumsi Terbanyak Hari Ini" : "Top Konsumsi Terbanyak Bulan Ini"}
              </p>
            </div>
            {/* Filter Toggle Period */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 self-start shrink-0">
              <button
                type="button"
                onClick={() => setPemakaianPeriod("today")}
                className={cn(
                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  pemakaianPeriod === "today" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setPemakaianPeriod("month")}
                className={cn(
                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  pemakaianPeriod === "month" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Per Bulan
              </button>
            </div>
          </div>

          <div className="space-y-4 my-6 flex-1 overflow-y-auto">
            {usageDataFiltered.length > 0 ? usageDataFiltered.slice(0, 4).map((r: any, idx: number) => (
              <div key={r.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3 truncate max-w-[70%]">
                  <span className="text-xs font-black text-slate-400">#0{idx + 1}</span>
                  <p className="text-[11px] font-black text-slate-700 uppercase italic truncate">{r.nama}</p>
                </div>
                <span className="text-xs font-bold text-slate-900 tabular-nums">
                  {r.qty.toLocaleString('id-ID')} <span className="text-[9px] font-bold text-slate-400 uppercase">{r.code}</span>
                </span>
              </div>
            )) : (
              <div className="py-10 text-center opacity-30 flex flex-col items-center gap-2">
                <Package className="h-8 w-8 text-slate-400" />
                <p className="text-[9px] font-black uppercase tracking-widest">
                  {pemakaianPeriod === "today" ? "Belum ada pemakaian hari ini" : "Belum ada pemakaian bulan ini"}
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <span className="font-bold text-slate-400 uppercase">Toast BB043 Gudang</span>
            <span className="font-black text-slate-800">{bb043 ? `${bb043.qtyBesar} Sak` : "-"}</span>
          </div>
        </Card>

        {/* Card 3: Restock & Critical Stock */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-white p-6 md:p-8 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic mb-1">Peringatan Restock</h4>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Bahan Baku Kontainer di Bawah Batas Minimum</p>
          </div>

          <div className="space-y-4 my-6 flex-1 overflow-y-auto">
            {stats.lowKontainerItems.length > 0 ? stats.lowKontainerItems.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate max-w-[60%]">
                  <div className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-[11px] font-black text-slate-700 uppercase italic truncate">{item.nama}</p>
                </div>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg shrink-0">
                  {item.qtyKontainerBesar || 0} {item.satuanBesar} / {item.qtyKontainerKecil || 0} {item.satuanKecil} sisa
                </span>
              </div>
            )) : (
              <div className="py-10 text-center opacity-30 flex flex-col items-center gap-2">
                <Package className="h-8 w-8 text-slate-400" />
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Seluruh Stok Kontainer Aman</p>
              </div>
            )}
          </div>

          <Link href="/stok/bahan-baku">
            <Button variant="ghost" className="w-full text-[9px] font-black text-primary hover:bg-primary/5 rounded-xl h-11 uppercase tracking-[0.2em] border border-primary/10 gap-2">
              Cek Detail Logistik <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
