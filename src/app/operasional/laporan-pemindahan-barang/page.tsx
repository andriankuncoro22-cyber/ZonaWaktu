"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useConsolidatedCollection } from "@/firebase";
import { useActiveBranch, BRANCH_LIST } from "@/lib/branch-helper";
import { query, orderBy, limit } from "firebase/firestore";
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
  CheckCircle2,
  Building2,
  Store,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface LogItem {
  materialCode?: string;
  materialName?: string;
  targetMaterialCode?: string;
  targetMaterialName?: string;
  qty?: number;
  unit?: string;
  price?: number;
  subtotal?: number;
}

interface TransferLog {
  id: string;
  nomorNota?: string;
  type?: string;
  location?: string;
  sourceLocation?: string;
  targetLocation?: string;
  sourceType?: string;
  targetType?: string;
  totalNominal?: number;
  tanggal?: string;
  catatan?: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  totalItems?: number;
  items?: LogItem[];
  _branchId?: string;
  _branchName?: string;
}

const getLogDateStr = (log: TransferLog | Record<string, unknown>): string => {
  if (log.tanggal && typeof log.tanggal === "string") return log.tanggal;
  const createdAt = log.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
  if (createdAt?.toDate) {
    const d = createdAt.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (createdAt?.seconds) {
    const d = new Date(createdAt.seconds * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
};

export default function LaporanPemindahanBarangPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();

  // Date Interval & Filter States
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [transferType, setTransferType] = useState<"all" | "ambil-gudang" | "kembali-gudang" | "transfer_antar_gudang" | "transfer_antar_kontainer">("all");

  const { data: logs, loading } = useConsolidatedCollection(
    db,
    "log_pembelian_bahan",
    (ref) => query(ref, orderBy("createdAt", "desc"), limit(500))
  );

  const filteredTransferLogs = useMemo((): TransferLog[] => {
    if (!logs) return [];

    return ((logs as unknown as TransferLog[]) || []).filter((log) => {
      const isTransferType = 
        log.type === "ambil-gudang" || 
        log.type === "kembali-gudang" || 
        log.type === "transfer_antar_gudang" || 
        log.type === "transfer_antar_kontainer" ||
        log.type === "transfer_gudang_ke_kontainer";
        
      if (!isTransferType) return false;

      // Filter by Transfer Type
      if (transferType !== "all") {
        if (transferType === "ambil-gudang" && log.type !== "ambil-gudang" && log.type !== "transfer_gudang_ke_kontainer") return false;
        if (transferType === "kembali-gudang" && log.type !== "kembali-gudang") return false;
        if (transferType === "transfer_antar_gudang" && log.type !== "transfer_antar_gudang") return false;
        if (transferType === "transfer_antar_kontainer" && log.type !== "transfer_antar_kontainer") return false;
      }

      // Filter by Date Range
      const dateStr = getLogDateStr(log);
      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate) return false;

      // Filter by Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNota = (log.nomorNota || "").toLowerCase().includes(term);
        const matchSource = (log.sourceLocation || "").toLowerCase().includes(term);
        const matchTarget = (log.targetLocation || "").toLowerCase().includes(term);
        const matchItems = (log.items || []).some((it) =>
          (it.materialName || "").toLowerCase().includes(term) ||
          (it.materialCode || "").toLowerCase().includes(term) ||
          (it.targetMaterialName || "").toLowerCase().includes(term)
        );
        if (!matchNota && !matchSource && !matchTarget && !matchItems) return false;
      }

      return true;
    });
  }, [logs, startDate, endDate, transferType, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let totalItemsSum = 0;
    let ambilGudangCount = 0;
    let kembaliGudangCount = 0;
    let antarGudangCount = 0;
    let antarKontainerCount = 0;
    let totalNominalSum = 0;

    filteredTransferLogs.forEach((log) => {
      if (log.type === "ambil-gudang" || log.type === "transfer_gudang_ke_kontainer") ambilGudangCount++;
      else if (log.type === "kembali-gudang") kembaliGudangCount++;
      else if (log.type === "transfer_antar_gudang") antarGudangCount++;
      else if (log.type === "transfer_antar_kontainer") antarKontainerCount++;

      totalNominalSum += Number(log.totalNominal || 0);

      (log.items || []).forEach((it) => {
        totalItemsSum += Number(it.qty || 0);
      });
    });

    return {
      totalTransfers: filteredTransferLogs.length,
      totalItemsSum,
      totalNominalSum,
      ambilGudangCount,
      kembaliGudangCount,
      antarGudangCount,
      antarKontainerCount
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
    const exportRows: Record<string, unknown>[] = [];
    filteredTransferLogs.forEach((log) => {
      let typeLabel = "Gudang ke Kontainer";
      if (log.type === "kembali-gudang") typeLabel = "Kontainer ke Gudang";
      else if (log.type === "transfer_antar_gudang") typeLabel = "Antar Gudang";
      else if (log.type === "transfer_antar_kontainer") typeLabel = "Antar Kontainer";

      const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "-");

      (log.items || []).forEach((item) => {
        exportRows.push({
          "No Bukti": log.nomorNota || "-",
          Tanggal: dateDisplay,
          "Tipe Pemindahan": typeLabel,
          "Lokasi Asal": log.sourceLocation || "Gudang Utama",
          "Lokasi Tujuan": log.targetLocation || "Kontainer Toko",
          "Kode Bahan": item.materialCode || "-",
          "Nama Bahan": item.materialName || "-",
          "Jumlah": `${item.qty || 0} ${item.unit || ""}`,
          "Nilai HPP (Rp)": Number(item.subtotal || (Number(item.qty || 0) * Number(item.price || 0))),
          "Catatan": log.catatan || "-"
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pemindahan Barang");
    XLSX.writeFile(wb, `laporan-pemindahan-barang-${startDate || "all"}-to-${endDate || "all"}.xlsx`);
  };

  const getLogTypeBadge = (type?: string) => {
    switch (type) {
      case "ambil-gudang":
      case "transfer_gudang_ke_kontainer":
        return {
          label: "Gudang ➔ Kontainer",
          sub: "Ambil untuk Toko",
          icon: Package,
          bg: "bg-indigo-50 border-indigo-200 text-indigo-700",
          iconBg: "bg-indigo-600 text-white"
        };
      case "kembali-gudang":
        return {
          label: "Kontainer ➔ Gudang",
          sub: "Retur Sisa ke Gudang",
          icon: Truck,
          bg: "bg-emerald-50 border-emerald-200 text-emerald-700",
          iconBg: "bg-emerald-600 text-white"
        };
      case "transfer_antar_gudang":
        return {
          label: "Antar Gudang",
          sub: "GDM ⟷ Kedungreja",
          icon: Building2,
          bg: "bg-amber-50 border-amber-200 text-amber-700",
          iconBg: "bg-amber-600 text-white"
        };
      case "transfer_antar_kontainer":
        return {
          label: "Antar Kontainer",
          sub: "Mutasi Antar Toko",
          icon: Store,
          bg: "bg-purple-50 border-purple-200 text-purple-700",
          iconBg: "bg-purple-600 text-white"
        };
      default:
        return {
          label: "Pemindahan Barang",
          sub: "Transfer Bahan",
          icon: ArrowRightLeft,
          bg: "bg-slate-50 border-slate-200 text-slate-700",
          iconBg: "bg-slate-800 text-white"
        };
    }
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
            Riwayat Mutasi & Sinkronisasi Stok Multi-Gudang & Kontainer
          </p>
        </div>
      </header>

      {/* Date Interval & Type Filter Bar */}
      <Card className="rounded-[2rem] border-none bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          {/* Date Interval Pickers */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 flex-1">
            <div className="grid grid-cols-2 gap-2 flex-1 items-center">
              <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl border border-slate-200">
                <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Dari Tanggal</span>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-6 sm:h-7 border-none bg-transparent font-black text-[11px] sm:text-xs text-slate-800 focus-visible:ring-0 p-0 w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl border border-slate-200">
                <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Sampai Tanggal</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-6 sm:h-7 border-none bg-transparent font-black text-[11px] sm:text-xs text-slate-800 focus-visible:ring-0 p-0 w-full"
                  />
                </div>
              </div>
            </div>

            {(startDate || endDate || transferType !== "all" || searchTerm) && (
              <Button
                variant="ghost"
                onClick={handleResetFilter}
                className="h-8 sm:h-10 px-3 rounded-2xl text-rose-600 hover:bg-rose-50 font-black text-[10px] sm:text-xs gap-1.5 shrink-0 justify-center"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>

          {/* Transfer Type Filters (5 Buttons) */}
          <div className="flex flex-wrap gap-1 bg-slate-100 p-1 sm:p-1.5 rounded-2xl border border-slate-200 w-full lg:w-auto shrink-0">
            <Button
              variant={transferType === "all" ? "default" : "ghost"}
              onClick={() => setTransferType("all")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-2.5 transition-all text-center",
                transferType === "all" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Semua Arah
            </Button>
            <Button
              variant={transferType === "ambil-gudang" ? "default" : "ghost"}
              onClick={() => setTransferType("ambil-gudang")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-2.5 transition-all text-center",
                transferType === "ambil-gudang" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Gudang ➔ Kont.
            </Button>
            <Button
              variant={transferType === "kembali-gudang" ? "default" : "ghost"}
              onClick={() => setTransferType("kembali-gudang")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-2.5 transition-all text-center",
                transferType === "kembali-gudang" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Kont. ➔ Gudang
            </Button>
            <Button
              variant={transferType === "transfer_antar_gudang" ? "default" : "ghost"}
              onClick={() => setTransferType("transfer_antar_gudang")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-2.5 transition-all text-center",
                transferType === "transfer_antar_gudang" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Antar Gudang
            </Button>
            <Button
              variant={transferType === "transfer_antar_kontainer" ? "default" : "ghost"}
              onClick={() => setTransferType("transfer_antar_kontainer")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-2.5 transition-all text-center",
                transferType === "transfer_antar_kontainer" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Antar Kont.
            </Button>
          </div>
        </div>

        {/* Quick Date Presets & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-4 gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
            <Button
              variant={!startDate && !endDate ? "secondary" : "ghost"}
              onClick={() => handleSetPreset("all")}
              className={cn(
                "rounded-lg h-7 font-black text-[8.5px] sm:text-[9px] uppercase px-1 text-center",
                !startDate && !endDate ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              Semua
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("today")}
              className="rounded-lg h-7 font-black text-[8.5px] sm:text-[9px] uppercase px-1 text-center text-slate-600 hover:bg-slate-200/60"
            >
              Hari Ini
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("7-days")}
              className="rounded-lg h-7 font-black text-[8.5px] sm:text-[9px] uppercase px-1 text-center text-slate-600 hover:bg-slate-200/60"
            >
              7 Hari
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSetPreset("this-month")}
              className="rounded-lg h-7 font-black text-[8.5px] sm:text-[9px] uppercase px-1 text-center text-slate-600 hover:bg-slate-200/60"
            >
              Bulan Ini
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari nota, lokasi, atau bahan..."
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rounded-3xl border-none bg-white p-4 sm:p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Gudang ➔ Kontainer</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.ambilGudangCount} Mutasi</p>
          </div>
        </Card>

        <Card className="rounded-3xl border-none bg-white p-4 sm:p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Kontainer ➔ Gudang</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.kembaliGudangCount} Mutasi</p>
          </div>
        </Card>

        <Card className="rounded-3xl border-none bg-white p-4 sm:p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Antar Gudang & Toko</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.antarGudangCount + stats.antarKontainerCount} Mutasi</p>
          </div>
        </Card>

        <Card className="rounded-3xl border-none bg-white p-4 sm:p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">Total Volume Barang</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.totalItemsSum.toLocaleString("id-ID")} Unit</p>
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
                const badge = getLogTypeBadge(log.type);
                const IconComponent = badge.icon;
                const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "Baru saja");

                return (
                  <div key={log.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4 sm:p-5 transition-all hover:border-slate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 shadow-sm", badge.iconBg)}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">#{log.nomorNota}</span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                              {dateDisplay}
                            </span>
                            <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-full border", badge.bg)}>
                              {badge.label}
                            </span>
                            {activeBranch === 'all' && log._branchName && (
                              <span className={cn(
                                "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                                BRANCH_LIST[log._branchId as keyof typeof BRANCH_LIST]?.badgeColor || "bg-slate-100 text-slate-700"
                              )}>
                                {log._branchName}
                              </span>
                            )}
                          </div>
                          
                          {/* Route Visualizer */}
                          <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 mt-1">
                            <span className="text-slate-700">{log.sourceLocation || "Lokasi Asal"}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="text-indigo-950 font-extrabold">{log.targetLocation || "Lokasi Tujuan"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {log.totalNominal && log.totalNominal > 0 ? (
                          <div className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-[10px] font-black">
                            Nilai HPP: Rp {log.totalNominal.toLocaleString("id-ID")}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-700 shadow-xs border border-slate-200">
                          <ArrowRightLeft className="h-3 w-3 text-primary" />
                          {log.totalItems || log.items?.length || 0} Material
                        </div>
                      </div>
                    </div>

                    {log.catatan && (
                      <p className="text-[11px] text-slate-500 italic mt-2 bg-white/70 px-3 py-1.5 rounded-xl border border-slate-100">
                        Catatan: &ldquo;{log.catatan}&rdquo;
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      {log.items?.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-[10px] sm:text-xs">
                          <div>
                            <p className="font-bold uppercase tracking-wider text-slate-400">{item.materialCode || "-"}</p>
                            <p className="font-black uppercase italic text-slate-800 mt-0.5">{item.materialName || "-"}</p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            {item.subtotal && item.subtotal > 0 ? (
                              <span className="text-[10px] font-bold text-slate-500">
                                Rp {item.subtotal.toLocaleString("id-ID")}
                              </span>
                            ) : null}
                            <span className="inline-block font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100">
                              {item.qty} {item.unit || "Unit"}
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
                Belum ada data pemindahan barang pada filter ini.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
