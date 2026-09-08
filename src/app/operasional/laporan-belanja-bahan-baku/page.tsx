"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase, collection } from "@/firebase";
import { query, orderBy, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  Trash2, 
  Loader2, 
  Calendar as CalendarIcon, 
  Search, 
  RotateCcw, 
  ShoppingBag,
  FileText,
  DollarSign,
  FileDown,
  Building2,
  Store
} from "lucide-react";
import * as XLSX from "xlsx";

interface PurchaseItem {
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  qty?: number;
  unit?: string;
  satuan?: string;
  price?: number;
  purchasePrice?: number;
  isBeliSendiri?: boolean;
  metodePembelian?: string;
  supplierName?: string;
  suplier?: string;
}

interface PurchaseLog {
  id: string;
  nomorNota?: string;
  tanggal?: string;
  createdAt?: { toDate?: () => Date; seconds?: number; nanoseconds?: number } | null;
  type?: string;
  purchaseType?: string;
  supplier?: string;
  suplier?: string;
  supplierName?: string;
  items?: PurchaseItem[];
}

const getLogDateStr = (log: PurchaseLog): string => {
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

const formatCurrency = (val: number) => `Rp ${Number(val || 0).toLocaleString("id-ID")}`;

// Helper to determine Supliyer vs Beli Sendiri info
const getMetodeInfo = (log: PurchaseLog, item?: PurchaseItem) => {
  const supplierName = log.supplier || log.suplier || log.supplierName || item?.supplierName || item?.suplier;
  
  const isBeliSendiri = item?.isBeliSendiri === true || 
    item?.metodePembelian === "Beli Sendiri" || 
    log.type === "belanja" || 
    log.type === "beli-sendiri" || 
    log.type === "belanja-pasar" || 
    log.purchaseType === "belanja" || 
    log.purchaseType === "beli-sendiri";

  if (isBeliSendiri) {
    return {
      type: "beli-sendiri" as const,
      label: "Beli Sendiri",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
      itemBadgeClass: "bg-amber-100/80 text-amber-900 border-amber-200",
      icon: Store
    };
  }

  const labelText = supplierName ? `Supliyer: ${supplierName}` : "Supliyer";
  return {
    type: "supplier" as const,
    label: labelText,
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200/80",
    itemBadgeClass: "bg-blue-100/80 text-blue-900 border-blue-200",
    icon: Building2
  };
};

export default function LaporanBelanjaBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();

  // Date Interval & Filter State
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<"all" | "supplier" | "beli-sendiri">("all");

  // Fetch purchase logs (log_pembelian_bahan)
  const logsQuery = useMemoFirebase(
    () => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(500)),
    [db]
  );
  const { data: rawLogs, loading } = useCollection(logsQuery);
  const logs = rawLogs as PurchaseLog[] | null;

  // Filter logs by date range, method, & search term
  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    return logs.filter((log: PurchaseLog) => {
      // Exclude transfer logs if any mixed in
      if (log.type === "ambil-gudang" || log.type === "kembali-gudang") return false;

      // Method filter (Supliyer vs Beli Sendiri)
      if (methodFilter !== "all") {
        const info = getMetodeInfo(log);
        if (info.type !== methodFilter) return false;
      }

      // Date Range filter
      const dateStr = getLogDateStr(log);
      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNota = (log.nomorNota || "").toLowerCase().includes(term);
        const matchSupplier = (log.supplier || log.suplier || "").toLowerCase().includes(term);
        const matchItems = (log.items || []).some((it: PurchaseItem) =>
          (it.materialName || "").toLowerCase().includes(term) ||
          (it.materialCode || "").toLowerCase().includes(term)
        );
        if (!matchNota && !matchSupplier && !matchItems) return false;
      }

      return true;
    });
  }, [logs, startDate, endDate, methodFilter, searchTerm]);

  // Compute stats across filtered logs
  const stats = useMemo(() => {
    let totalSpending = 0;
    let totalItemsCount = 0;
    let totalSupplierSpending = 0;
    let totalBeliSendiriSpending = 0;

    filteredLogs.forEach((log: PurchaseLog) => {
      const logInfo = getMetodeInfo(log);
      (log.items ?? []).forEach((it: PurchaseItem) => {
        const price = it.price ?? it.purchasePrice ?? 0;
        const qty = it.qty ?? 0;
        const sub = price * qty;

        totalSpending += sub;
        totalItemsCount += Number(qty || 0);

        if (logInfo.type === "supplier") {
          totalSupplierSpending += sub;
        } else {
          totalBeliSendiriSpending += sub;
        }
      });
    });

    return {
      totalSpending,
      totalItemsCount,
      totalSupplierSpending,
      totalBeliSendiriSpending,
      totalNota: filteredLogs.length
    };
  }, [filteredLogs]);

  // Quick Preset Handlers
  const handleSetPreset = (preset: "today" | "7-days" | "this-month" | "all") => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "today") {
      const t = fmt(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === "7-days") {
      const past = new Date();
      past.setDate(now.getDate() - 6);
      setStartDate(fmt(past));
      setEndDate(fmt(now));
    } else if (preset === "this-month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(fmt(first));
      setEndDate(fmt(now));
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleResetFilter = () => {
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setMethodFilter("all");
  };

  // Delete a log entry
  const handleDelete = async (id: string) => {
    if (!confirm("Hapus catatan belanja ini?")) return;
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "log_pembelian_bahan", id));
      toast({ title: "Nota belanja berhasil dihapus" });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal menghapus",
        description: "Terjadi kesalahan saat menghapus data."
      });
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const exportRows: Record<string, string | number>[] = [];
    filteredLogs.forEach((log: PurchaseLog) => {
      const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "-");

      (log.items || []).forEach((item: PurchaseItem) => {
        const itemInfo = getMetodeInfo(log, item);
        const price = item.price ?? item.purchasePrice ?? 0;
        const qty = item.qty ?? 0;

        exportRows.push({
          "No Nota": log.nomorNota || "-",
          Tanggal: dateDisplay,
          "Keterangan Pembelian": itemInfo.label,
          "Kode Bahan": item.materialCode || "-",
          "Nama Bahan": item.materialName || "-",
          Jumlah: `${qty} ${item.unit || item.satuan || ""}`,
          "Harga Satuan": price,
          "Total Harga": price * qty,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Belanja");
    XLSX.writeFile(wb, `laporan-belanja-bahan-baku-${startDate || "all"}-to-${endDate || "all"}.xlsx`);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-primary shrink-0" />
            Laporan Belanja Bahan Baku
          </h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Rekapitulasi Pembelian & Belanja Bahan Baku • Supliyer & Beli Sendiri
          </p>
        </div>
      </header>

      {/* Date Interval & Method Filter Bar */}
      <Card className="rounded-[2rem] border-none bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          {/* Interval Date Pickers */}
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

            {(startDate || endDate || methodFilter !== "all" || searchTerm) && (
              <Button
                variant="ghost"
                onClick={handleResetFilter}
                className="h-8 sm:h-10 px-3 rounded-2xl text-rose-600 hover:bg-rose-50 font-black text-[10px] sm:text-xs gap-1.5 shrink-0 justify-center"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>

          {/* Filter Supliyer vs Beli Sendiri */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 sm:p-1.5 rounded-2xl border border-slate-200 w-full lg:w-auto shrink-0">
            <Button
              variant={methodFilter === "all" ? "default" : "ghost"}
              onClick={() => setMethodFilter("all")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-1 transition-all text-center flex items-center justify-center",
                methodFilter === "all" ? "bg-primary text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <span className="hidden sm:inline">Semua Metode</span>
              <span className="sm:hidden">Semua</span>
            </Button>
            <Button
              variant={methodFilter === "supplier" ? "default" : "ghost"}
              onClick={() => setMethodFilter("supplier")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-1 transition-all text-center flex items-center justify-center gap-1",
                methodFilter === "supplier" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <Building2 className="h-3 w-3 shrink-0 hidden xs:inline" />
              Supliyer
            </Button>
            <Button
              variant={methodFilter === "beli-sendiri" ? "default" : "ghost"}
              onClick={() => setMethodFilter("beli-sendiri")}
              className={cn(
                "rounded-xl h-8 font-black text-[8.5px] sm:text-[10px] uppercase px-1 transition-all text-center flex items-center justify-center gap-1",
                methodFilter === "beli-sendiri" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200/60"
              )}
            >
              <Store className="h-3 w-3 shrink-0 hidden xs:inline" />
              Beli Sendiri
            </Button>
          </div>
        </div>

        {/* Search & Presets & Export */}
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
                placeholder="Cari nota, suplier, atau bahan..."
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="rounded-[2rem] border-none bg-white p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Belanja</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{formatCurrency(stats.totalSpending)}</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Supliyer</p>
            <p className="text-xl font-black text-blue-900 mt-0.5">{formatCurrency(stats.totalSupplierSpending)}</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-amber-700 shrink-0">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Beli Sendiri</p>
            <p className="text-xl font-black text-amber-900 mt-0.5">{formatCurrency(stats.totalBeliSendiriSpending)}</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-5 shadow-sm flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Transaksi</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{stats.totalNota} Nota ({stats.totalItemsCount} Unit)</p>
          </div>
        </Card>
      </div>

      {/* Main List */}
      <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden p-6 md:p-10">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {!loading && filteredLogs.length > 0 ? (
          <div className="space-y-6">
            {filteredLogs.map((log: PurchaseLog) => {
              const dateDisplay = getLogDateStr(log) || (log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "Baru saja");
              const logTotal = (log.items || []).reduce((s: number, it: PurchaseItem) => s + (it.price ?? it.purchasePrice ?? 0) * (it.qty ?? 0), 0);
              const logMetode = getMetodeInfo(log);

              return (
                <Card key={log.id} className="rounded-[2rem] border border-slate-100 shadow-sm p-6 bg-slate-50/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                          #{log.nomorNota}
                        </span>
                        
                        {/* Badge Keterangan Suplier / Beli Sendiri */}
                        <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-none", logMetode.badgeClass)}>
                          <logMetode.icon className="h-3.5 w-3.5" />
                          {logMetode.label}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-500 pt-0.5">
                        Tanggal Pembelian: <span className="text-slate-800 font-black">{dateDisplay}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <span className="font-black text-sm text-slate-900 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                        {formatCurrency(logTotal)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(log.id)}
                        className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                        title="Hapus nota"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
                    <div className="col-span-5">Bahan Baku & Keterangan</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Harga Satuan</div>
                    <div className="col-span-3 text-right">Total</div>
                  </div>

                  {log.items?.map((item: PurchaseItem, idx: number) => {
                    const itemMetode = getMetodeInfo(log, item);
                    const price = item.price ?? item.purchasePrice ?? 0;
                    const qty = item.qty ?? 0;
                    const total = price * qty;

                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:grid sm:grid-cols-12 gap-1.5 sm:gap-2 py-3 border-b border-slate-100/60 text-xs font-bold"
                      >
                        <div className="sm:col-span-5 text-slate-900 font-black truncate flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span>{item.materialName}</span>
                            <span className="sm:hidden text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {qty} {item.unit || item.satuan || ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("inline-flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded border", itemMetode.itemBadgeClass)}>
                              <itemMetode.icon className="h-3 w-3 shrink-0" />
                              {itemMetode.label}
                            </span>
                          </div>
                        </div>
                        
                        <div className="hidden sm:block sm:col-span-2 text-center text-slate-700">
                          {qty} <span className="text-[10px] text-slate-400 font-semibold">{item.unit || item.satuan || ""}</span>
                        </div>
                        
                        <div className="flex sm:grid sm:col-span-2 justify-between sm:justify-end text-slate-600 sm:text-right">
                          <span className="sm:hidden text-slate-400 font-semibold">Harga Satuan:</span>
                          <span>{formatCurrency(price)}</span>
                        </div>
                        
                        <div className="flex sm:grid sm:col-span-3 justify-between sm:justify-end text-slate-900 font-black sm:text-right">
                          <span className="sm:hidden text-slate-400 font-semibold">Total Harga:</span>
                          <span>{formatCurrency(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              );
            })}
          </div>
        ) : !loading ? (
          <div className="py-20 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
            Belum ada data belanja bahan baku pada periode ini.
          </div>
        ) : null}
      </Card>
    </div>
  );
}
