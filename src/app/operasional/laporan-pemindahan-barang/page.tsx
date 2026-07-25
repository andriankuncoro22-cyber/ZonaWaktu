"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  ArrowRightLeft, 
  Loader2, 
  Package, 
  Truck, 
  Calendar as CalendarIcon, 
  Search, 
  RotateCcw, 
  FileDown,
  Layers,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

const getLogDateStr = (log: any): string => {
  if (log.tanggal && typeof log.tanggal === "string") return log.tanggal;
  if (log.createdAt?.toDate) {
    const d = log.createdAt.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (log.createdAt?.seconds) {
    const d = new Date(log.createdAt.seconds * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
};

interface LogItem {
  materialCode?: string;
  materialName?: string;
  qty?: number;
  unit?: string;
}

interface TransferLog {
  id: string;
  nomorNota?: string;
  type?: string;
  location?: string;
  tanggal?: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  totalItems?: number;
  items?: LogItem[];
}

export default function LaporanPemindahanBarangPage() {
  const db = useFirestore();

  // Date Interval & Filter States
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [transferType, setTransferType] = useState<"all" | "ambil-gudang" | "kembali-gudang">("all");

  const logsQuery = useMemoFirebase(
    () => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(500)),
    [db]
  );
  const { data: logs, loading } = useCollection(logsQuery);

  const filteredTransferLogs = useMemo((): TransferLog[] => {
    if (!logs) return [];

    return ((logs as unknown as TransferLog[]) || []).filter((log) => {
      const isKontainer = log.location === "kontainer";
      const isTransferType = log.type === "ambil-gudang" || log.type === "kembali-gudang";
      if (!isKontainer || !isTransferType) return false;

      // Filter by Transfer Type (ambil gudang vs kembali gudang)
      if (transferType !== "all" && log.type !== transferType) return false;

      // Filter by Date Range
      const dateStr = getLogDateStr(log);
      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate) return false;

      // Filter by Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNota = (log.nomorNota || "").toLowerCase().includes(term);
        const matchItems = (log.items || []).some((it) =>
          (it.materialName || "").toLowerCase().includes(term) ||
          (it.materialCode || "").toLowerCase().includes(term)
        );
        if (!matchNota && !matchItems) return false;
      }

      return true;
    });
  }, [logs, startDate, endDate, transferType, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let totalItemsSum = 0;
    let ambilGudangCount = 0;
    let kembaliGudangCount = 0;

    filteredTransferLogs.forEach((log) => {
      if (log.type === "ambil-gudang") ambilGudangCount++;
      if (log.type === "kembali-gudang") kembaliGudangCount++;

      (log.items || []).forEach((it) => {
        totalItemsSum += Number(it.qty || 0);
      });
    });

    return {
      totalTransfers: filteredTransferLogs.length,
      totalItemsSum,
      ambilGudangCount,
      kembaliGudangCount
    };
  }, [filteredTransferLogs]);

  // Quick Presets
  const handleSetPreset = (preset: "today" | "this-month" | "7-days" | "all") => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7-days") {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 6);
      setStartDate(past7.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else if (preset === "this-month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(todayStr);
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleResetFilter = () => {
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setTransferType("all");
  };

  // Export Excel
  const handleExportExcel = () => {
    const exportRows: any[] = [];
    filteredTransferLogs.forEach((log) => {
      const isTake = log.type === "ambil-gudang";
      const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "-");

      (log.items || []).forEach((item) => {
        exportRows.push({
          "No Nota": log.nomorNota || "-",
          Tanggal: dateDisplay,
          "Tipe Pemindahan": isTake ? "Gudang ke Kontainer" : "Kontainer ke Gudang",
          "Kode Bahan": item.materialCode || "-",
          "Nama Bahan": item.materialName || "-",
          Jumlah: `${item.qty || 0} ${item.unit || ""}`,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pemindahan Barang");
    XLSX.writeFile(wb, `laporan-pemindahan-barang-${startDate || "all"}-to-${endDate || "all"}.xlsx`);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none flex items-center gap-3">
            <ArrowRightLeft className="h-8 w-8 text-primary shrink-0" />
            Laporan Pemindahan Barang
          </h1>
          <p className="mt-2 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-slate-600">
            Riwayat Transfer Stok Antara Gudang Utama & Kontainer
          </p>
        </div>
      </header>

      {/* Date Interval & Type Filter Bar */}
      <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Interval Pickers */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Dari Tanggal</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-7 border-none bg-transparent font-black text-xs text-slate-800 focus-visible:ring-0 p-0 w-auto"
                />
              </div>
            </div>

            <span className="text-slate-600 font-black text-xs">s/d</span>

            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Sampai Tanggal</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-7 border-none bg-transparent font-black text-xs text-slate-800 focus-visible:ring-0 p-0 w-auto"
                />
              </div>
            </div>

            {(startDate || endDate || transferType !== "all" || searchTerm) && (
              <Button
                variant="ghost"
                onClick={handleResetFilter}
                className="h-10 px-3 rounded-2xl text-rose-600 hover:bg-rose-50 font-bold text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
              </Button>
            )}
          </div>

          {/* Transfer Type Filters */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <Button
              variant={transferType === "all" ? "default" : "ghost"}
              onClick={() => setTransferType("all")}
              className={cn("rounded-xl px-3 h-8 font-black text-[10px] uppercase", transferType === "all" ? "bg-primary text-white" : "text-slate-600")}
            >
              Semua Arah
            </Button>
            <Button
              variant={transferType === "ambil-gudang" ? "default" : "ghost"}
              onClick={() => setTransferType("ambil-gudang")}
              className={cn("rounded-xl px-3 h-8 font-black text-[10px] uppercase", transferType === "ambil-gudang" ? "bg-amber-600 text-white" : "text-slate-600")}
            >
              Gudang → Kontainer
            </Button>
            <Button
              variant={transferType === "kembali-gudang" ? "default" : "ghost"}
              onClick={() => setTransferType("kembali-gudang")}
              className={cn("rounded-xl px-3 h-8 font-black text-[10px] uppercase", transferType === "kembali-gudang" ? "bg-emerald-600 text-white" : "text-slate-600")}
            >
              Kontainer → Gudang
            </Button>
          </div>
        </div>

        {/* Quick Date Presets & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Preset:</span>
            <Button
              variant={!startDate && !endDate ? "secondary" : "ghost"}
              onClick={() => handleSetPreset("all")}
              className="rounded-xl px-2.5 h-7 font-black text-[9px] uppercase"
            >
              Semua
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("today")}
              className="rounded-xl px-2.5 h-7 font-black text-[9px] uppercase text-slate-600 hover:bg-slate-100"
            >
              Hari Ini
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("7-days")}
              className="rounded-xl px-2.5 h-7 font-black text-[9px] uppercase text-slate-600 hover:bg-slate-100"
            >
              7 Hari
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("this-month")}
              className="rounded-xl px-2.5 h-7 font-black text-[9px] uppercase text-slate-600 hover:bg-slate-100"
            >
              Bulan Ini
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari nota atau nama bahan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9 rounded-2xl border-none bg-slate-50 font-bold text-xs text-slate-900"
              />
            </div>

            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="rounded-2xl border-slate-200 font-bold text-xs h-9 px-3 gap-1.5 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <FileDown className="h-4 w-4 text-emerald-600" /> Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gudang → Kontainer</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.ambilGudangCount} Transfer</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kontainer → Gudang</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.kembaliGudangCount} Transfer</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Volume Bahan</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalItemsSum.toLocaleString("id-ID")} Unit</p>
          </div>
        </Card>
      </div>

      {/* Main List */}
      <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
        <div className="p-4 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredTransferLogs.length > 0 ? (
            <div className="space-y-4">
              {filteredTransferLogs.map((log) => {
                const isTake = log.type === "ambil-gudang";
                const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "Baru saja");

                return (
                  <div key={log.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4 sm:p-5 transition-all hover:border-slate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 shadow-sm",
                          isTake ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
                        )}>
                          {isTake ? <Package className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">#{log.nomorNota}</span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                              {dateDisplay}
                            </span>
                          </div>
                          <p className="text-sm font-black uppercase italic text-slate-900 mt-0.5">
                            {isTake ? "Pemindahan dari Gudang ke Kontainer" : "Pemindahan dari Kontainer ke Gudang"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm border border-slate-100 self-start sm:self-auto">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                        {log.totalItems} Jenis Material
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {log.items?.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[10px] sm:text-xs">
                          <div>
                            <p className="font-bold uppercase tracking-[0.18em] text-slate-400">{item.materialCode}</p>
                            <p className="font-black uppercase italic text-slate-800 mt-0.5">{item.materialName}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block font-black text-primary bg-primary/5 px-3 py-1 rounded-xl border border-primary/10">
                              {item.qty} {item.unit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-slate-300" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                Belum ada data pemindahan barang pada periode ini.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
