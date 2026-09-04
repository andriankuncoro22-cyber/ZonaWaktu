"use client";

import { getStoreConfigDocId } from "@/lib/branch-helper";

import React, { useState, useMemo } from "react";
import { 
  Gift, 
  Trash2, 
  Search, 
  Calendar as CalendarIcon, 
  FileUp, 
  FileDown,
  User,
  Users,
  Clock,
  Layers,
  CheckCircle2,
  Package,
  ShoppingBag,
  DollarSign,
  Tag,
  Sparkles
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase, useDoc, collection, doc } from "@/firebase";
import { query, deleteDoc, getDocs, where, orderBy } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const formatCurrency = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

const getDocDateStr = (docData: any): string => {
  if (!docData) return "";
  const rawDate = docData.tanggal || docData.date || docData.tgl;
  if (rawDate && typeof rawDate === "string") {
    const raw = rawDate.trim();
    if (raw.includes("/")) {
      const parts = raw.split("/");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
        }
        return `${parts[2]}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
      }
    }
    if (raw.includes("T")) {
      return raw.split("T")[0];
    }
    return raw;
  }
  const timestampField = docData.createdAt || docData.timestamp || docData.updatedAt;
  if (timestampField?.toDate) {
    const d = timestampField.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (timestampField?.seconds) {
    const d = new Date(timestampField.seconds * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (rawDate instanceof Date) {
    const year = rawDate.getFullYear();
    const month = String(rawDate.getMonth() + 1).padStart(2, "0");
    const day = String(rawDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
};

interface FreeProductRow {
  docId: string;
  operasionalDocId?: string;
  tanggal: string;
  shift: number;
  karyawanNama: string;
  productName: string;
  productCode?: string;
  kategori?: string;
  volume: number;
  harga: number;
  subtotal: number;
  notes: string;
  createdAt?: any;
  rawLog: any;
}

export default function LaporanFreeProdukPage() {
  const db = useFirestore();
  const { toast } = useToast();

  const [reportType, setReportType] = useState<"daily" | "monthly" | "yearly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedKaryawan, setSelectedKaryawan] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Store config settings for PDF Kop
  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);

  // Fetch Input Free logs from Firestore
  const freeLogsQuery = useMemoFirebase(() => {
    return query(collection(db, "input-free"), orderBy("createdAt", "desc"));
  }, [db]);
  const { data: rawLogs, loading: loadingLogs } = useCollection(freeLogsQuery);

  // Fetch Karyawan list from Firestore
  const karyawanQuery = useMemoFirebase(() => {
    return query(collection(db, "karyawan"), orderBy("nama", "asc"));
  }, [db]);
  const { data: rawKaryawanList, loading: loadingKaryawan } = useCollection(karyawanQuery);

  const loading = loadingLogs || loadingKaryawan;

  // Extract all unique karyawan options from both collection and logs
  const availableKaryawanOptions = useMemo(() => {
    const set = new Set<string>();

    (rawKaryawanList || []).forEach((k: any) => {
      const name = (k.nama || k.name || "").trim();
      if (name) set.add(name);
    });

    (rawLogs || []).forEach((log: any) => {
      const name = (log.karyawanNama || log.karyawan || "").trim();
      if (name && name !== "-") set.add(name);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [rawKaryawanList, rawLogs]);

  // Date match helper
  const isDateMatch = (docDate: string) => {
    if (!docDate) return false;
    if (reportType === "daily") return docDate === selectedDate;
    if (reportType === "monthly") return docDate.startsWith(selectedMonth);
    return docDate.startsWith(selectedYear);
  };

  // Flatten and filter logs by date/month/year, selected karyawan, and search term
  const filteredRows = useMemo(() => {
    if (!rawLogs) return [];

    const rows: FreeProductRow[] = [];

    rawLogs.forEach((log: any) => {
      const logDate = getDocDateStr(log);
      if (!isDateMatch(logDate)) return;

      const logKaryawan = (log.karyawanNama || log.karyawan || "-").trim();

      // Karyawan Filter
      if (selectedKaryawan !== "all") {
        if (logKaryawan.toLowerCase() !== selectedKaryawan.toLowerCase()) {
          return;
        }
      }

      const items = Array.isArray(log.items) && log.items.length > 0 
        ? log.items 
        : [{
            productName: log.productName || "Free Produk",
            productCode: "-",
            kategori: "-",
            harga: Number(log.harga || log.totalNominal || 0),
            qty: Number(log.volume || log.totalItems || 1),
            subtotal: Number(log.totalNominal || 0)
          }];

      items.forEach((item: any) => {
        const row: FreeProductRow = {
          docId: log.id,
          operasionalDocId: log.operasionalDocId,
          tanggal: logDate || "-",
          shift: Number(log.shift || 1),
          karyawanNama: logKaryawan,
          productName: item.productName || item.name || "Produk",
          productCode: item.productCode || item.code || "-",
          kategori: item.kategori || "-",
          volume: Number(item.qty || item.volume || 1),
          harga: Number(item.harga || 0),
          subtotal: Number(item.subtotal || (Number(item.harga || 0) * Number(item.qty || 1))),
          notes: log.notes || log.note || "-",
          createdAt: log.createdAt,
          rawLog: log,
        };

        // Search term filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchName = row.productName.toLowerCase().includes(term);
          const matchCode = (row.productCode || "").toLowerCase().includes(term);
          const matchKaryawan = row.karyawanNama.toLowerCase().includes(term);
          const matchNotes = row.notes.toLowerCase().includes(term);
          const matchShift = `shift ${row.shift}`.includes(term) || `sift ${row.shift}`.includes(term);

          if (!matchName && !matchCode && !matchKaryawan && !matchNotes && !matchShift) {
            return;
          }
        }

        rows.push(row);
      });
    });

    return rows;
  }, [rawLogs, reportType, selectedDate, selectedMonth, selectedYear, selectedKaryawan, searchTerm]);

  // Unique documents count in current filter
  const uniqueDocIds = useMemo(() => {
    return new Set(filteredRows.map(r => r.docId)).size;
  }, [filteredRows]);

  // Per-Karyawan Breakdown for summary & rankings
  const karyawanBreakdown = useMemo(() => {
    const map = new Map<string, { nama: string; totalNominal: number; totalVolume: number; count: number }>();

    filteredRows.forEach((r) => {
      const kName = r.karyawanNama || "Tidak Diketahui";
      const prev = map.get(kName) || { nama: kName, totalNominal: 0, totalVolume: 0, count: 0 };
      prev.totalNominal += r.subtotal;
      prev.totalVolume += r.volume;
      prev.count += 1;
      map.set(kName, prev);
    });

    return Array.from(map.values()).sort((a, b) => b.totalNominal - a.totalNominal);
  }, [filteredRows]);

  // Statistics
  const stats = useMemo(() => {
    const totalNominal = filteredRows.reduce((sum, r) => sum + r.subtotal, 0);
    const totalVolume = filteredRows.reduce((sum, r) => sum + r.volume, 0);
    const totalItems = filteredRows.length;

    return { totalNominal, totalVolume, totalItems, uniqueDocIds };
  }, [filteredRows, uniqueDocIds]);

  const currentPeriodLabel = useMemo(() => {
    if (reportType === "daily") {
      const parts = selectedDate.split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return selectedDate;
    }
    if (reportType === "monthly") {
      const parts = selectedMonth.split("-");
      if (parts.length === 2) {
        const monthNames = [
          "Januari", "Februari", "Maret", "April", "Mei", "Juni",
          "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        return `${monthNames[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
      }
      return selectedMonth;
    }
    return `Tahun ${selectedYear}`;
  }, [reportType, selectedDate, selectedMonth, selectedYear]);

  // Delete entire Input Free log entry
  const handleDeleteLog = async (docId: string, operasionalDocId?: string, productName?: string) => {
    const confirmMessage = `Hapus catatan input free produk "${productName || 'ini'}"?\n\nCatatan ini juga akan dihapus dari Laporan Operasional Owner.`;
    if (!confirm(confirmMessage)) return;

    try {
      await deleteDoc(doc(db, "input-free", docId));

      if (operasionalDocId) {
        await deleteDoc(doc(db, "operasional-kontainer", operasionalDocId)).catch(() => {});
      } else {
        const opSnap = await getDocs(query(collection(db, "operasional-kontainer"), where("inputFreeId", "==", docId)));
        opSnap.forEach(async (d) => {
          await deleteDoc(doc(db, "operasional-kontainer", d.id)).catch(() => {});
        });
      }

      toast({
        title: "Catatan Free Produk Dihapus",
        description: "Catatan berhasil dihapus dari sistem.",
      });
    } catch (err) {
      console.error("Error deleting free product log:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus catatan.",
      });
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Ringkasan
    const summaryData = [
      { Keterangan: "Periode Laporan", Nilai: currentPeriodLabel },
      { Keterangan: "Filter Karyawan", Nilai: selectedKaryawan === "all" ? "Semua Karyawan" : selectedKaryawan },
      { Keterangan: "Total Transaksi Free", Nilai: stats.uniqueDocIds },
      { Keterangan: "Total Item Produk", Nilai: stats.totalItems },
      { Keterangan: "Total Volume (Pcs)", Nilai: stats.totalVolume },
      { Keterangan: "Total Nominal Free", Nilai: stats.totalNominal },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");

    // Sheet 2: Daftar Free Produk
    const dataToExport = filteredRows.map((row, idx) => ({
      No: idx + 1,
      Tanggal: row.tanggal,
      Shift: `Shift ${row.shift}`,
      "Nama Karyawan": row.karyawanNama,
      "Nama Produk": row.productName,
      "Volume (Qty)": row.volume,
      "Harga Satuan": row.harga,
      Subtotal: row.subtotal,
      Catatan: row.notes,
    }));
    const wsDetail = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Rincian Free Produk");

    // Sheet 3: Rekap Per Karyawan (if Semua Karyawan)
    if (karyawanBreakdown.length > 0) {
      const kRows = karyawanBreakdown.map((k, idx) => ({
        No: idx + 1,
        "Nama Karyawan": k.nama,
        "Total Nominal": k.totalNominal,
        "Total Volume (Pcs)": k.totalVolume,
        "Jumlah Transaksi": k.count,
      }));
      const wsKaryawan = XLSX.utils.json_to_sheet(kRows);
      XLSX.utils.book_append_sheet(wb, wsKaryawan, "Rekap Per Karyawan");
    }

    const fileKaryawanSuffix = selectedKaryawan === "all" ? "semua-karyawan" : selectedKaryawan.replace(/\s+/g, "_").toLowerCase();
    XLSX.writeFile(wb, `laporan-free-produk-${fileKaryawanSuffix}-${reportType}-${selectedDate || selectedMonth || selectedYear}.xlsx`);
  };

  // Export PDF
  const handleExportPDF = async () => {
    const docPDF = new jsPDF();
    
    // Header Kop Logo
    if (settings?.logoHeader) {
      try {
        const response = await fetch(settings.logoHeader);
        const blob = await response.blob();
        const logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        docPDF.addImage(logoBase64 as string, 'PNG', 15, 10, 35, 12);
      } catch (e) {
        console.error("Failed to load logo for PDF", e);
      }
    }

    docPDF.setFontSize(16);
    docPDF.setTextColor(219, 39, 119); // Pink theme
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 105, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 105, 21, { align: 'center' });
    docPDF.setDrawColor(219, 39, 119);
    docPDF.line(15, 26, 195, 26);
    
    docPDF.setFontSize(13);
    docPDF.setTextColor(0);
    const karyawanLabel = selectedKaryawan === "all" ? "Semua Karyawan" : `Karyawan: ${selectedKaryawan}`;
    docPDF.text(`LAPORAN FREE PRODUK (${currentPeriodLabel})`, 105, 34, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(`${karyawanLabel} | Total: ${formatCurrency(stats.totalNominal)} (${stats.totalVolume} Pcs)`, 105, 40, { align: 'center' });

    const tableData = filteredRows.map((row) => [
      row.tanggal,
      `Shift ${row.shift}`,
      row.karyawanNama,
      row.productName,
      `${row.volume} pcs`,
      formatCurrency(row.harga),
      formatCurrency(row.subtotal),
      row.notes
    ]);

    // Footer summary row
    tableData.push([
      "TOTAL",
      "-",
      "-",
      "-",
      `${stats.totalVolume} pcs`,
      "-",
      formatCurrency(stats.totalNominal),
      "-"
    ]);

    autoTable(docPDF, {
      head: [["TANGGAL", "SHIFT", "KARYAWAN", "NAMA PRODUK", "VOLUME", "HARGA", "SUBTOTAL", "CATATAN"]],
      body: tableData,
      startY: 46,
      theme: 'grid',
      headStyles: { fillColor: [219, 39, 119], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const fileKaryawanSuffix = selectedKaryawan === "all" ? "semua-karyawan" : selectedKaryawan.replace(/\s+/g, "_").toLowerCase();
    docPDF.save(`laporan-free-produk-${fileKaryawanSuffix}-${reportType}-${selectedDate || selectedMonth || selectedYear}.pdf`);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
      {/* Header & Filter Controls */}
      <Card className="rounded-[2.5rem] border-none bg-white p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700">
              <Gift className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">Laporan Pengeluaran Free Produk</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-1">
              Laporan Free Produk
            </h1>
            <p className="text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-[0.2em]">
              Rekapitulasi produk gratis karyawan per shift & per tanggal
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={loading || filteredRows.length === 0}
              className="rounded-2xl border-slate-200 font-bold text-xs h-11 px-4 gap-2 text-slate-700 hover:bg-slate-50 shadow-sm"
              title="Download Excel"
            >
              <FileDown className="h-4 w-4 text-emerald-600" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={loading || filteredRows.length === 0}
              className="rounded-2xl border-slate-200 font-bold text-xs h-11 px-4 gap-2 text-slate-700 hover:bg-slate-50 shadow-sm"
              title="Download PDF"
            >
              <FileUp className="h-4 w-4 text-pink-600" /> PDF
            </Button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Selector Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <Button
              variant={reportType === "daily" ? "default" : "ghost"}
              onClick={() => setReportType("daily")}
              className={cn(
                "rounded-xl px-3.5 font-black uppercase tracking-wider text-[9px] h-9 transition-all",
                reportType === "daily" ? "bg-pink-600 hover:bg-pink-700 text-white shadow-sm" : "text-slate-600"
              )}
            >
              Harian
            </Button>
            <Button
              variant={reportType === "monthly" ? "default" : "ghost"}
              onClick={() => setReportType("monthly")}
              className={cn(
                "rounded-xl px-3.5 font-black uppercase tracking-wider text-[9px] h-9 transition-all",
                reportType === "monthly" ? "bg-pink-600 hover:bg-pink-700 text-white shadow-sm" : "text-slate-600"
              )}
            >
              Bulanan
            </Button>
            <Button
              variant={reportType === "yearly" ? "default" : "ghost"}
              onClick={() => setReportType("yearly")}
              className={cn(
                "rounded-xl px-3.5 font-black uppercase tracking-wider text-[9px] h-9 transition-all",
                reportType === "yearly" ? "bg-pink-600 hover:bg-pink-700 text-white shadow-sm" : "text-slate-600"
              )}
            >
              Tahunan
            </Button>
          </div>

          {/* Date Picker Input */}
          {reportType === "daily" ? (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
              <CalendarIcon className="h-4 w-4 text-pink-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-black text-xs text-slate-800 border-none outline-none cursor-pointer"
              />
            </div>
          ) : reportType === "monthly" ? (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
              <CalendarIcon className="h-4 w-4 text-pink-600 shrink-0" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-black text-xs text-slate-800 border-none outline-none cursor-pointer"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
              <CalendarIcon className="h-4 w-4 text-pink-600 shrink-0" />
              <input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent font-black text-xs text-slate-800 border-none outline-none cursor-pointer w-20"
              />
            </div>
          )}

          {/* KARYAWAN SELECTOR DROPDOWN (FITUR BARU) */}
          <div className="flex items-center gap-2 bg-pink-50/60 px-3 py-1.5 rounded-2xl border border-pink-200 shadow-sm">
            <User className="h-4 w-4 text-pink-600 shrink-0" />
            <span className="text-[9px] font-black uppercase text-pink-800 shrink-0">Karyawan:</span>
            <select
              value={selectedKaryawan}
              onChange={(e) => setSelectedKaryawan(e.target.value)}
              className="bg-transparent font-black text-xs text-slate-800 border-none outline-none cursor-pointer py-1 pr-2 uppercase"
            >
              <option value="all">-- Semua Karyawan --</option>
              {availableKaryawanOptions.map((nama) => (
                <option key={nama} value={nama}>
                  {nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="h-12 w-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 shrink-0">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Nominal Free</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{formatCurrency(stats.totalNominal)}</p>
            {selectedKaryawan !== "all" && (
              <p className="text-[9px] font-black text-pink-600 uppercase mt-1">Khusus: {selectedKaryawan}</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Volume Produk</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalVolume.toLocaleString('id-ID')} Pcs</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1">Akumulasi seluruh cup & produk</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
          <div className="h-12 w-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Transaksi Free</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.uniqueDocIds} Sesi Closing</p>
            <p className="text-[9px] font-bold text-slate-400 mt-1">Dari {stats.totalItems} baris item produk</p>
          </div>
        </Card>
      </div>

      {/* Per-Karyawan Summary Pills (When viewing Semua Karyawan) */}
      {selectedKaryawan === "all" && karyawanBreakdown.length > 0 && (
        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase italic tracking-wider text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-pink-600" /> Rekapitulasi Per Karyawan ({karyawanBreakdown.length} Orang)
            </h4>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Klik nama untuk filter</span>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            {karyawanBreakdown.map((k, i) => (
              <button
                key={i}
                onClick={() => setSelectedKaryawan(k.nama)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-50 hover:bg-pink-50 border border-slate-100 hover:border-pink-200 text-slate-700 transition-all text-left group"
              >
                <div className="w-6 h-6 rounded-full bg-pink-100 group-hover:bg-pink-600 text-pink-700 group-hover:text-white flex items-center justify-center text-[10px] font-black uppercase transition-colors">
                  {k.nama.charAt(0)}
                </div>
                <div>
                  <span className="text-xs font-black uppercase block leading-none">{k.nama}</span>
                  <span className="text-[10px] font-black text-pink-700 tabular-nums">
                    {formatCurrency(k.totalNominal)} ({k.totalVolume} Pcs)
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Main Table Card */}
      <Card className="rounded-[2.5rem] border-none bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Cari produk, karyawan, shift, catatan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-11 rounded-2xl border-none bg-slate-50 font-bold text-xs text-slate-900"
            />
          </div>

          <div className="flex items-center gap-2">
            {selectedKaryawan !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedKaryawan("all")}
                className="rounded-xl text-[9px] font-black uppercase text-pink-600 bg-pink-50 hover:bg-pink-100 h-8"
              >
                Reset Filter Karyawan
              </Button>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Baris:</span>
            <span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-full">{filteredRows.length}</span>
          </div>
        </div>

        {/* Mobile Card List View */}
        <div className="block md:hidden p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs font-bold text-slate-400">
              Memuat data laporan free produk...
            </div>
          ) : filteredRows.length > 0 ? (
            filteredRows.map((row, idx) => (
              <div 
                key={`mobile-card-${row.docId}-${idx}`} 
                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3"
              >
                {/* Header Card: Product Name & Subtotal */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-pink-50 text-pink-600 shrink-0">
                      <Gift className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-xs text-slate-900 uppercase leading-tight">
                        {row.productName}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {formatCurrency(row.harga)} × {row.volume} pcs
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-pink-900 block">
                      {formatCurrency(row.subtotal)}
                    </span>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[9px] font-black uppercase mt-1 border border-pink-100">
                      {row.volume} Pcs
                    </span>
                  </div>
                </div>

                {/* Details Grid: Shift, Karyawan, Tanggal */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                  <div className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-1.5 text-slate-700">
                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate uppercase font-black">{row.karyawanNama}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between text-slate-700">
                    <span className="font-black text-[9px] uppercase px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800">
                      Shift {row.shift}
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold">{row.tanggal}</span>
                  </div>
                </div>

                {/* Footer: Notes & Action */}
                <div className="flex items-center justify-between pt-1 text-[10px] gap-2">
                  <div className="text-slate-500 truncate max-w-[82%] font-medium italic">
                    {row.notes && row.notes !== "-" ? `Catatan: ${row.notes}` : "Tidak ada catatan"}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteLog(row.docId, row.operasionalDocId, row.productName)}
                    className="h-8 w-8 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    title="Hapus catatan free produk"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-pink-400 opacity-60 mx-auto mb-2" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                Tidak ada catatan free produk pada periode ini {selectedKaryawan !== "all" ? `untuk ${selectedKaryawan}` : ""}
              </p>
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="pl-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Tanggal</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Nama Produk</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Volume (Qty)</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Harga Satuan</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Subtotal</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Shift</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Nama Karyawan</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600">Catatan</th>
                <th className="pr-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-600 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-xs font-bold text-slate-400">
                    Memuat data laporan free produk...
                  </td>
                </tr>
              ) : filteredRows.length > 0 ? (
                filteredRows.map((row, idx) => (
                  <tr key={`${row.docId}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="pl-6 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                      <div>{row.tanggal}</div>
                      <div className="text-[9px] text-slate-400 font-medium">
                        {row.createdAt?.seconds 
                          ? new Date(row.createdAt.seconds * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) 
                          : row.createdAt?.toDate 
                            ? new Date(row.createdAt.toDate()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                            : "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-black text-xs text-slate-900 uppercase">
                      <div className="flex items-center gap-2">
                        <Gift className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                        <span>{row.productName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-black text-xs text-slate-900">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-pink-50 text-pink-700 border border-pink-100 font-black">
                        {row.volume} pcs
                      </span>
                    </td>
                    <td className="px-4 py-4 font-bold text-xs text-slate-700">
                      {formatCurrency(row.harga)}
                    </td>
                    <td className="px-4 py-4 font-black text-xs text-pink-900">
                      {formatCurrency(row.subtotal)}
                    </td>
                    <td className="px-4 py-4 text-xs font-bold text-slate-700 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black text-[10px] uppercase">
                        Shift {row.shift}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-black text-slate-800 uppercase">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{row.karyawanNama}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-600 max-w-xs truncate">
                      {row.notes}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLog(row.docId, row.operasionalDocId, row.productName)}
                        className="h-8 w-8 rounded-xl hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors"
                        title="Hapus catatan free produk"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-10 w-10 text-pink-400 opacity-60" />
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Tidak ada catatan free produk pada periode ini {selectedKaryawan !== "all" ? `untuk ${selectedKaryawan}` : ""}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-black text-xs">
                  <td colSpan={2} className="pl-6 py-4 uppercase text-[9px] tracking-wider">
                    TOTAL KESELURUHAN ({filteredRows.length} ITEM)
                  </td>
                  <td className="px-4 py-4 text-pink-300 font-black">{stats.totalVolume} pcs</td>
                  <td className="px-4 py-4 text-slate-400">-</td>
                  <td className="px-4 py-4 text-pink-300 font-black">{formatCurrency(stats.totalNominal)}</td>
                  <td colSpan={4} className="px-4 py-4 text-right pr-6 text-slate-400">
                    {selectedKaryawan === "all" ? `${karyawanBreakdown.length} Karyawan` : selectedKaryawan}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
