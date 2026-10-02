"use client";

import React, { useState, useMemo } from "react";
import { 
  useFirestore, 
  useConsolidatedCollection 
} from "@/firebase";
import { 
  useActiveBranch, 
  BRANCH_LIST, 
  BranchId,
  normalizeBranchId
} from "@/lib/branch-helper";
import { 
  DEFAULT_KONSINYASI_PRODUCTS, 
  isKonsinyasiProduct 
} from "@/lib/konsinyasi-helper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Store, 
  Calendar, 
  FileSpreadsheet, 
  FileDown, 
  Sparkles, 
  DollarSign, 
  ShoppingBag, 
  RotateCcw,
  Boxes
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

interface TitipJualItem {
  code: string;
  nama: string;
  qtyMasuk: number;
  qtyRetur: number;
  hargaJual: number;
  hargaDasar: number;
  catatan?: string;
}

interface TitipJualDoc {
  id: string;
  tanggal: string;
  branchId: string;
  vendor: string;
  penerima: string;
  pengembali?: string;
  items: TitipJualItem[];
  catatan?: string;
  status?: string;
  createdAt?: unknown;
}

interface RawProductDoc {
  code?: string;
  nama?: string;
  name?: string;
  kategori?: string;
  hargaJual?: number;
  hargaDasar?: number;
  isKonsinyasi?: boolean;
  namaPenitip?: string;
}

interface RawSaleItem {
  code?: string;
  name?: string;
  nama?: string;
  total?: number;
  qty?: number;
}

interface RawSaleDoc {
  tanggal?: string;
  _branchId?: string;
  branchId?: string;
  items?: RawSaleItem[];
}

interface ConsignmentSummaryRow {
  key: string;
  tanggal: string;
  branchId: string;
  branchName: string;
  code: string;
  nama: string;
  vendor: string;
  qtyMasuk: number;
  qtyTerjual: number;
  qtyRetur: number;
  sisaFisik: number;
  hargaJual: number;
  hargaDasar: number;
  omsetPenjualan: number;
  wajibBayarVendor: number;
  marginToko: number;
}

export default function LaporanTitipJualPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const [filterMode, setFilterMode] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(activeBranch);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fetch Firestore collections
  const { data: rawTitipJual, loading: loadingTitip } = useConsolidatedCollection(db, "titip-jual");
  const { data: rawSales, loading: loadingSales } = useConsolidatedCollection(db, "penjualan");
  const { data: rawProducts } = useConsolidatedCollection(db, "produk");

  // Konsinyasi Product Catalog Mapping
  const konsinyasiProductMap = useMemo(() => {
    const map: Record<string, { code: string; name: string; hargaJual: number; hargaDasar: number; vendor: string }> = {};

    DEFAULT_KONSINYASI_PRODUCTS.forEach((p) => {
      map[p.code] = {
        code: p.code,
        name: p.name,
        hargaJual: p.hargaJual,
        hargaDasar: p.hargaDasar,
        vendor: p.vendor,
      };
      map[p.name.toLowerCase()] = map[p.code];
    });

    if (rawProducts && Array.isArray(rawProducts)) {
      (rawProducts as RawProductDoc[]).forEach((p) => {
        if (isKonsinyasiProduct(p)) {
          const code = String(p.code || "").trim();
          const name = String(p.nama || p.name || "").trim();
          const itemData = {
            code: code || `KONS-${Object.keys(map).length + 1}`,
            name: name,
            hargaJual: Number(p.hargaJual || 8000),
            hargaDasar: Number(p.hargaDasar || 5000),
            vendor: p.namaPenitip || "Penitip Soft Cookies",
          };
          if (code) map[code] = itemData;
          if (name) map[name.toLowerCase()] = itemData;
        }
      });
    }

    return map;
  }, [rawProducts]);

  // Aggregate Sales from Excel Closing Toko
  // Key format: `${tanggal}_${branchId}_${code}`
  const salesAggregate = useMemo(() => {
    const map: Record<string, number> = {};
    if (!rawSales) return map;

    (rawSales as RawSaleDoc[]).forEach((saleDoc) => {
      const saleDate = String(saleDoc.tanggal || "").split("T")[0];
      if (!saleDate) return;
      const saleBranch = normalizeBranchId(saleDoc._branchId || saleDoc.branchId || "gdm");

      const items = saleDoc.items || [];
      items.forEach((it) => {
        const itCode = String(it.code || "").trim();
        const itName = String(it.name || it.nama || "").trim().toLowerCase();
        const qty = Number(it.total || it.qty || 0);

        // Check if item is konsinyasi
        const matched = konsinyasiProductMap[itCode] || konsinyasiProductMap[itName];
        if (matched) {
          const key = `${saleDate}_${saleBranch}_${matched.code}`;
          map[key] = (map[key] || 0) + qty;
        }
      });
    });

    return map;
  }, [rawSales, konsinyasiProductMap]);

  // Aggregate Titip Jual Masuk & Retur
  // Key format: `${tanggal}_${branchId}_${code}`
  const titipAggregate = useMemo(() => {
    const map: Record<string, { masuk: number; retur: number; vendor: string; name: string }> = {};
    if (!rawTitipJual) return map;

    (rawTitipJual as TitipJualDoc[]).forEach((doc) => {
      const docDate = doc.tanggal;
      if (!docDate) return;
      const docBranch = normalizeBranchId(doc.branchId || "gdm");

      (doc.items || []).forEach((it) => {
        const itCode = String(it.code || "").trim();
        const key = `${docDate}_${docBranch}_${itCode}`;

        if (!map[key]) {
          map[key] = {
            masuk: 0,
            retur: 0,
            vendor: doc.vendor || "Penitip Soft Cookies",
            name: it.nama,
          };
        }

        map[key].masuk += Number(it.qtyMasuk || 0);
        map[key].retur += Number(it.qtyRetur || 0);
      });
    });

    return map;
  }, [rawTitipJual]);

  // Build Consolidated Table Rows
  const tableRows = useMemo((): ConsignmentSummaryRow[] => {
    const allKeys = new Set<string>();

    // Collect keys from titipAggregate and salesAggregate
    Object.keys(titipAggregate).forEach((k) => allKeys.add(k));
    Object.keys(salesAggregate).forEach((k) => allKeys.add(k));

    // Also populate default products for selected date/month if filter is active
    const targetBranches: BranchId[] = 
      selectedBranchFilter === "all" 
        ? ["gdm", "kedungreja", "tehwarga", "gembong"]
        : [selectedBranchFilter as BranchId];

    if (filterMode === "daily") {
      targetBranches.forEach((b) => {
        DEFAULT_KONSINYASI_PRODUCTS.forEach((p) => {
          allKeys.add(`${selectedDate}_${b}_${p.code}`);
        });
      });
    }

    const rows: ConsignmentSummaryRow[] = [];

    allKeys.forEach((key) => {
      const parts = key.split("_");
      if (parts.length < 3) return;
      const tanggal = parts[0];
      const branchId = parts[1] as BranchId;
      const code = parts[2];

      // Date Filtering
      if (filterMode === "daily" && tanggal !== selectedDate) return;
      if (filterMode === "monthly" && !tanggal.startsWith(selectedMonth)) return;

      // Branch Filtering
      if (selectedBranchFilter !== "all" && branchId !== selectedBranchFilter) return;

      const productInfo = konsinyasiProductMap[code] || {
        code,
        name: titipAggregate[key]?.name || "Soft Cookies",
        hargaJual: 8000,
        hargaDasar: 5000,
        vendor: "Penitip Soft Cookies",
      };

      const titipData = titipAggregate[key] || { masuk: 0, retur: 0, vendor: productInfo.vendor, name: productInfo.name };
      const qtyMasuk = titipData.masuk;
      const qtyRetur = titipData.retur;
      const qtyTerjual = salesAggregate[key] || 0;

      // If in monthly or daily view and there's no activity whatsoever, skip unless default daily
      if (filterMode === "monthly" && qtyMasuk === 0 && qtyTerjual === 0 && qtyRetur === 0) {
        return;
      }

      const sisaFisik = Math.max(0, qtyMasuk - qtyTerjual - qtyRetur);
      const hj = productInfo.hargaJual;
      const hd = productInfo.hargaDasar;
      const omset = qtyTerjual * hj;
      const wajibBayar = qtyTerjual * hd;
      const margin = qtyTerjual * (hj - hd);

      const branchName = BRANCH_LIST[branchId]?.shortName || branchId.toUpperCase();

      rows.push({
        key,
        tanggal,
        branchId,
        branchName,
        code,
        nama: productInfo.name,
        vendor: titipData.vendor || productInfo.vendor,
        qtyMasuk,
        qtyTerjual,
        qtyRetur,
        sisaFisik,
        hargaJual: hj,
        hargaDasar: hd,
        omsetPenjualan: omset,
        wajibBayarVendor: wajibBayar,
        marginToko: margin,
      });
    });

    // Sort by Date Descending, then Branch, then Product Code
    return rows
      .filter((r) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          r.nama.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.vendor.toLowerCase().includes(q) ||
          r.branchName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.code.localeCompare(b.code));
  }, [
    titipAggregate,
    salesAggregate,
    filterMode,
    selectedDate,
    selectedMonth,
    selectedBranchFilter,
    searchTerm,
    konsinyasiProductMap,
  ]);

  // KPI Calculations
  const stats = useMemo(() => {
    return tableRows.reduce(
      (acc, curr) => {
        acc.totalMasuk += curr.qtyMasuk;
        acc.totalTerjual += curr.qtyTerjual;
        acc.totalRetur += curr.qtyRetur;
        acc.totalSisa += curr.sisaFisik;
        acc.totalOmset += curr.omsetPenjualan;
        acc.totalWajibBayar += curr.wajibBayarVendor;
        acc.totalMargin += curr.marginToko;
        return acc;
      },
      {
        totalMasuk: 0,
        totalTerjual: 0,
        totalRetur: 0,
        totalSisa: 0,
        totalOmset: 0,
        totalWajibBayar: 0,
        totalMargin: 0,
      }
    );
  }, [tableRows]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = tableRows.map((r, idx) => ({
      No: idx + 1,
      Tanggal: r.tanggal,
      Outlet: r.branchName,
      Kode: r.code,
      "Nama Produk": r.nama,
      Penitip: r.vendor,
      "Barang Masuk (Pcs)": r.qtyMasuk,
      "Terjual (Excel Closing)": r.qtyTerjual,
      "Retur / Kembali (Pcs)": r.qtyRetur,
      "Sisa Fisik (Pcs)": r.sisaFisik,
      "Harga Jual Toko (Rp)": r.hargaJual,
      "Harga Setor Vendor (Rp)": r.hargaDasar,
      "Omset Penjualan (Rp)": r.omsetPenjualan,
      "Wajib Bayar ke Vendor (Rp)": r.wajibBayarVendor,
      "Margin Laba Toko (Rp)": r.marginToko,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Titip Jual");
    const periodLabel = filterMode === "daily" ? selectedDate : selectedMonth;
    XLSX.writeFile(wb, `Laporan_Titip_Jual_Konsinyasi_${periodLabel}.xlsx`);
  };

  // Export Nota Pelunasan / Pembayaran Vendor (PDF)
  const handleExportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");

    // Header Kop
    doc.setFontSize(16);
    doc.setTextColor(180, 83, 9); // Amber 700
    doc.text("NOTA PELUNASAN BARANG TITIP JUAL", 105, 18, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const periodLabel = filterMode === "daily" ? `Tanggal: ${selectedDate}` : `Bulan: ${selectedMonth}`;
    const branchLabel = selectedBranchFilter === "all" ? "Semua Cabang Toko" : BRANCH_LIST[selectedBranchFilter as BranchId]?.name || selectedBranchFilter;
    doc.text(`Zona Waktu Management • ${periodLabel} • ${branchLabel}`, 105, 24, { align: "center" });

    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.5);
    doc.line(14, 28, 196, 28);

    // Summary Box
    doc.setFillColor(254, 243, 199); // amber 100
    doc.roundedRect(14, 32, 182, 22, 3, 3, "F");
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15);
    doc.text(`Total Masuk: ${stats.totalMasuk} Pcs`, 20, 41);
    doc.text(`Total Terjual: ${stats.totalTerjual} Pcs`, 68, 41);
    doc.text(`Total Retur: ${stats.totalRetur} Pcs`, 116, 41);
    doc.text(`Sisa Belum Retur: ${stats.totalSisa} Pcs`, 155, 41);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL HAK PENITIP (WAJIB DIBAYAR): Rp ${stats.totalWajibBayar.toLocaleString("id-ID")}`, 20, 50);

    // Table Data
    const tableBody = tableRows.map((r, idx) => [
      idx + 1,
      r.tanggal,
      r.branchName,
      r.nama,
      `${r.qtyMasuk} pcs`,
      `${r.qtyTerjual} pcs`,
      `${r.qtyRetur} pcs`,
      `Rp ${r.hargaDasar.toLocaleString("id-ID")}`,
      `Rp ${r.wajibBayarVendor.toLocaleString("id-ID")}`,
    ]);

    autoTable(doc, {
      head: [["No", "Tgl", "Toko", "Produk", "Masuk", "Laku", "Retur", "Setor/Pcs", "Wajib Bayar"]],
      body: tableBody,
      startY: 58,
      theme: "grid",
      headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { halign: "center", cellWidth: 20 },
        2: { halign: "center", cellWidth: 20 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 16 },
        6: { halign: "right", cellWidth: 16 },
        7: { halign: "right", cellWidth: 22 },
        8: { halign: "right", cellWidth: 26, fontStyle: "bold" },
      },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 160;

    // Signatures
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text("Diserahkan oleh (Pihak Toko),", 25, finalY + 18);
    doc.text("Diterima oleh (Pihak Penitip),", 140, finalY + 18);

    doc.line(25, finalY + 36, 75, finalY + 36);
    doc.line(140, finalY + 36, 190, finalY + 36);

    doc.text("(................................)", 32, finalY + 41);
    doc.text("(................................)", 147, finalY + 41);

    doc.save(`Nota_Pelunasan_Titip_Jual_${filterMode === "daily" ? selectedDate : selectedMonth}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header Card */}
      <Card className="p-6 rounded-[2rem] border-slate-100 bg-white shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Laporan Terpadu
                </span>
                <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                  Konsinyasi / Titip Jual
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black uppercase italic text-slate-900 leading-tight">
                Rekapitulasi Barang Titip Jual
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Pencatatan barang titipan pihak ketiga (Soft Cookies), hasil penjualan riil dari Excel closing, retur, serta pelunasan vendor.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs h-9 gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleExportPDF}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 gap-1.5 shadow-md shadow-amber-600/20"
            >
              <FileDown className="h-4 w-4" />
              Cetak Nota Pelunasan (PDF)
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode: Harian / Bulanan */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterMode("daily")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                  filterMode === "daily" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("monthly")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                  filterMode === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Bulanan
              </button>
            </div>

            {/* Date Input */}
            {filterMode === "daily" ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                />
              </div>
            )}

            {/* Branch Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
              <span className="text-[9px] font-black uppercase text-slate-400">Outlet:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">Semua Toko Terpadu</option>
                <option value="gdm">Zona GDM</option>
                <option value="kedungreja">Kedungreja</option>
                <option value="tehwarga">Teh Warga GDM</option>
                <option value="gembong">Zona Gembong</option>
              </select>
            </div>
          </div>

          {/* Quick Search */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Cari produk / penitip..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </Card>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Masuk</p>
              <p className="text-lg font-black text-slate-900">{stats.totalMasuk} Pcs</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Terjual (Excel)</p>
              <p className="text-lg font-black text-emerald-950">{stats.totalTerjual} Pcs</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Barang Diretur</p>
              <p className="text-lg font-black text-rose-950">{stats.totalRetur} Pcs</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Wajib Bayar Vendor</p>
              <p className="text-lg font-black text-amber-950">Rp {stats.totalWajibBayar.toLocaleString("id-ID")}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Margin Bersih Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-amber-100/50 to-emerald-50 border border-amber-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold text-amber-950">Pendapatan Kotor Toko: </span>
            <strong className="text-slate-900 font-black">Rp {stats.totalOmset.toLocaleString("id-ID")}</strong>
            <span className="text-slate-500 mx-2">•</span>
            <span className="font-bold text-emerald-950">Laba Bersih Toko (Margin): </span>
            <strong className="text-emerald-700 font-black text-sm">Rp {stats.totalMargin.toLocaleString("id-ID")}</strong>
          </div>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-800 bg-white/80 px-2.5 py-1 rounded-lg border border-amber-200">
          Margin Rp 3.000 / Pcs
        </span>
      </div>

      {/* 3. Main Data Table */}
      <Card className="rounded-[2rem] border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-black uppercase italic text-slate-900">
            Rincian Barang Titip Jual ({tableRows.length} Baris Data)
          </h2>
        </div>

        {loadingTitip || loadingSales ? (
          <div className="py-20 text-center text-sm font-bold text-slate-400">
            Memuat data rekapan titip jual...
          </div>
        ) : tableRows.length === 0 ? (
          <div className="py-20 text-center text-sm font-bold text-slate-400">
            Tidak ada transaksi barang titip jual pada periode ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-700">
                  <th className="px-3 py-3 w-8 text-center">No</th>
                  <th className="px-3 py-3 w-24">Tanggal</th>
                  <th className="px-3 py-3 w-24">Outlet</th>
                  <th className="px-3 py-3 w-28">Kode</th>
                  <th className="px-4 py-3">Nama Produk</th>
                  <th className="px-3 py-3 text-right bg-blue-50 text-blue-900">Masuk</th>
                  <th className="px-3 py-3 text-right bg-emerald-50 text-emerald-900">Terjual (Excel)</th>
                  <th className="px-3 py-3 text-right bg-rose-50 text-rose-900">Retur</th>
                  <th className="px-3 py-3 text-right bg-slate-50 text-slate-900">Sisa</th>
                  <th className="px-3 py-3 text-right">Harga Jual</th>
                  <th className="px-3 py-3 text-right">Setor Vendor</th>
                  <th className="px-3 py-3 text-right font-black bg-amber-50 text-amber-950">Wajib Bayar</th>
                  <th className="px-3 py-3 text-right font-black bg-emerald-50 text-emerald-950">Laba Toko</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {tableRows.map((r, idx) => (
                  <tr key={r.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3 text-center font-bold text-slate-400 text-[10px]">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                      {r.tanggal}
                    </td>
                    <td className="px-3 py-3 font-bold text-[10px] text-slate-800 whitespace-nowrap">
                      {r.branchName}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-indigo-600 text-[10px] whitespace-nowrap">
                      {r.code}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-900 block">{r.nama}</span>
                      <span className="text-[9px] text-slate-400">{r.vendor}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-blue-950 bg-blue-50/30 tabular-nums">
                      {r.qtyMasuk > 0 ? `${r.qtyMasuk} pcs` : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-950 bg-emerald-50/30 tabular-nums">
                      {r.qtyTerjual > 0 ? `${r.qtyTerjual} pcs` : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-rose-950 bg-rose-50/30 tabular-nums">
                      {r.qtyRetur > 0 ? `${r.qtyRetur} pcs` : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-600 bg-slate-50/40 tabular-nums">
                      {r.sisaFisik > 0 ? `${r.sisaFisik} pcs` : "-"}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-600 tabular-nums whitespace-nowrap">
                      Rp {r.hargaJual.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-amber-700 tabular-nums whitespace-nowrap">
                      Rp {r.hargaDasar.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-amber-950 bg-amber-50/40 tabular-nums whitespace-nowrap">
                      Rp {r.wajibBayarVendor.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-950 bg-emerald-50/40 tabular-nums whitespace-nowrap">
                      Rp {r.marginToko.toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
