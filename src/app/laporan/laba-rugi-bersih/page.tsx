"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { Calendar, Search, Wallet, TrendingDown, Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LabaRugiBersihPage() {
  const db = useFirestore();

  const [filterMode, setFilterMode] = useState<"daily" | "monthly" | "yearly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [appliedDate, setAppliedDate] = useState(selectedDate);
  const [appliedMonth, setAppliedMonth] = useState(selectedMonth);
  const [appliedYear, setAppliedYear] = useState(selectedYear);
  const [appliedMode, setAppliedMode] = useState(filterMode);

  const handleCheck = () => {
    setAppliedDate(selectedDate);
    setAppliedMonth(selectedMonth);
    setAppliedYear(selectedYear);
    setAppliedMode(filterMode);
  };

  const penjualanQuery = useMemoFirebase(() => {
    if (appliedMode === "daily") {
      return query(collection(db, "penjualan"), where("tanggal", "==", appliedDate));
    }
    if (appliedMode === "monthly") {
      return query(collection(db, "penjualan"), orderBy("tanggal", "asc"));
    }
    return query(collection(db, "penjualan"), orderBy("tanggal", "asc"));
  }, [db, appliedMode, appliedDate]);

  const { data: penjualanData, loading } = useCollection(penjualanQuery);

  const operasionalQuery = useMemoFirebase(() => {
    return query(collection(db, "operasional-toko"), orderBy("createdAt", "asc"));
  }, [db]);
  const { data: operasionalData } = useCollection(operasionalQuery);

  const pembelianQuery = useMemoFirebase(() => {
    return query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "asc"));
  }, [db]);
  const { data: pembelianData } = useCollection(pembelianQuery);

  const filteredPenjualan = useMemo(() => {
    if (!penjualanData) return [];
    if (appliedMode === "daily") return penjualanData.filter((doc: any) => doc.tanggal === appliedDate);
    if (appliedMode === "monthly") return penjualanData.filter((doc: any) => doc.tanggal?.startsWith(appliedMonth));
    return penjualanData.filter((doc: any) => doc.tanggal?.startsWith(appliedYear));
  }, [penjualanData, appliedMode, appliedDate, appliedMonth, appliedYear]);

  const filteredOperasional = useMemo(() => {
    if (!operasionalData) return [];
    if (appliedMode === "daily") return operasionalData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedDate));
    if (appliedMode === "monthly") return operasionalData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedMonth));
    return operasionalData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedYear));
  }, [operasionalData, appliedMode, appliedDate, appliedMonth, appliedYear]);

  const filteredPembelian = useMemo(() => {
    if (!pembelianData) return [];
    if (appliedMode === "daily") return pembelianData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedDate));
    if (appliedMode === "monthly") return pembelianData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedMonth));
    return pembelianData.filter((doc: any) => doc.createdAt?.toDate?.().toISOString().startsWith(appliedYear));
  }, [pembelianData, appliedMode, appliedDate, appliedMonth, appliedYear]);

  const totals = useMemo(() => {
    const penjualan = filteredPenjualan.reduce((acc: number, curr: any) => acc + Number(curr.total || 0), 0);
    const operasional = filteredOperasional.reduce((acc: number, curr: any) => acc + Number(curr.nominal || 0), 0);
    const pembelian = filteredPembelian.reduce((acc: number, curr: any) => {
      const items = curr.items || [];
      return acc + items.reduce((sum: number, item: any) => sum + Number(item.qty || 0) * Number(item.purchasePrice || 0), 0);
    }, 0);

    return {
      penjualan,
      operasional,
      pembelian,
      labaBersih: penjualan - operasional - pembelian,
    };
  }, [filteredPenjualan, filteredOperasional, filteredPembelian]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Laporan Laba Rugi</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Perhitungan bersih dari penjualan, operasional, dan pembelian bahan baku</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center">
            <Button variant="ghost" onClick={() => setFilterMode("daily")} className={cn("rounded-xl px-4 h-10 text-[9px] font-black uppercase tracking-widest", filterMode === "daily" ? "bg-primary text-white" : "text-slate-500")}>Harian</Button>
            <Button variant="ghost" onClick={() => setFilterMode("monthly")} className={cn("rounded-xl px-4 h-10 text-[9px] font-black uppercase tracking-widest", filterMode === "monthly" ? "bg-primary text-white" : "text-slate-500")}>Bulanan</Button>
            <Button variant="ghost" onClick={() => setFilterMode("yearly")} className={cn("rounded-xl px-4 h-10 text-[9px] font-black uppercase tracking-widest", filterMode === "yearly" ? "bg-primary text-white" : "text-slate-500")}>Tahunan</Button>
          </div>

          <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <Calendar className="h-4 w-4 text-primary" />
            {filterMode === "daily" ? (
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-transparent border-none outline-none cursor-pointer" />
            ) : filterMode === "monthly" ? (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-transparent border-none outline-none cursor-pointer" />
            ) : (
              <input type="number" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-transparent border-none outline-none cursor-pointer w-20" />
            )}
          </div>

          <Button onClick={handleCheck} disabled={loading} className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg">
            <Search className="h-4 w-4" /> Tampilkan Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-emerald-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><Wallet className="h-6 w-6 text-emerald-600" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Penjualan</p>
          <h3 className="text-2xl font-black text-slate-900">Rp {totals.penjualan.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-amber-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><TrendingDown className="h-6 w-6 text-amber-600" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Operasional</p>
          <h3 className="text-2xl font-black text-amber-700">Rp {totals.operasional.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-slate-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><Package className="h-6 w-6 text-slate-700" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Pembelian Bahan</p>
          <h3 className="text-2xl font-black text-slate-800">Rp {totals.pembelian.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-slate-900 p-6 text-white">
          <div className="bg-white/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4"><Sparkles className="h-6 w-6 text-white" /></div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Laba Bersih</p>
          <h3 className="text-2xl font-black">Rp {totals.labaBersih.toLocaleString("id-ID")}</h3>
        </Card>
      </div>
    </div>
  );
}
