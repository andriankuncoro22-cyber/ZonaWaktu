"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Eye,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Coins,
  CheckCircle2,
  FileSpreadsheet,
  FileDown,
  Layers,
  FileText,
  Gift,
  Search,
  Store,
  Sparkles,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ShoppingBag,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, collection } from "@/firebase";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function LaporanClosingTokoPage() {
  const db = useFirestore();

  // Filter state
  const [filterMode, setFilterMode] = useState<"daily" | "monthly" | "yearly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedShift, setSelectedShift] = useState<"all" | 1 | 2>(2);

  const [appliedMode, setAppliedMode] = useState(filterMode);
  const [appliedDate, setAppliedDate] = useState(selectedDate);
  const [appliedMonth, setAppliedMonth] = useState(selectedMonth);
  const [appliedYear, setAppliedYear] = useState(selectedYear);
  const [appliedShift, setAppliedShift] = useState(selectedShift);

  // Detail modal state for specific item
  const [selectedClosingItem, setSelectedClosingItem] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleCheck = () => {
    setAppliedMode(filterMode);
    setAppliedDate(selectedDate);
    setAppliedMonth(selectedMonth);
    setAppliedYear(selectedYear);
    setAppliedShift(selectedShift);
  };

  // 1. Fetch all Keuangan Kontainer (Closing records)
  const keuanganQuery = useMemoFirebase(() => collection(db, "keuangan-kontainer"), [db]);
  const { data: rawKeuanganLogs, loading: loadingKeuangan } = useCollection(keuanganQuery);

  // 2. Fetch all Penjualan (Sales POS records)
  const penjualanQuery = useMemoFirebase(() => collection(db, "penjualan"), [db]);
  const { data: rawPenjualanLogs, loading: loadingPenjualan } = useCollection(penjualanQuery);

  // 3. Fetch all Input Free logs
  const freeQuery = useMemoFirebase(() => collection(db, "input-free"), [db]);
  const { data: rawFreeLogs } = useCollection(freeQuery);

  const loading = loadingKeuangan || loadingPenjualan;

  const isDateMatch = (docDate: string) => {
    if (!docDate) return false;
    if (appliedMode === "daily") return docDate === appliedDate;
    if (appliedMode === "monthly") return docDate.startsWith(appliedMonth);
    return docDate.startsWith(appliedYear);
  };

  // Map of date to penjualan document
  const penjualanByDateMap = useMemo(() => {
    const map = new Map<string, any>();
    (rawPenjualanLogs || []).forEach((doc: any) => {
      const dStr = getDocDateStr(doc);
      if (dStr) {
        map.set(dStr, doc);
      }
    });
    return map;
  }, [rawPenjualanLogs]);

  // Combined & Filtered closing records
  const filteredClosingList = useMemo(() => {
    if (!rawKeuanganLogs) return [];

    const list: any[] = [];

    rawKeuanganLogs.forEach((log: any) => {
      const dStr = getDocDateStr(log);
      if (!isDateMatch(dStr)) return;

      const logShift = Number(log.shift ?? 2);
      if (appliedShift !== "all" && logShift !== appliedShift) return;

      const matchingPenjualan = penjualanByDateMap.get(dStr);

      const isShift1 = logShift === 1;

      const totalPenjualan = isShift1
        ? Number(log.totalSales || 0)
        : Number(matchingPenjualan?.total ?? log.totalSales ?? 0);

      const totalQris = isShift1
        ? Number(log.qrisSales || 0)
        : Number(matchingPenjualan?.transactionReport?.qrisTotal ?? log.qrisSales ?? 0);

      const totalCash = isShift1
        ? Number(log.cashSales || 0)
        : Number(matchingPenjualan?.transactionReport?.cashTotal ?? log.cashSales ?? 0);

      const totalGofood = isShift1 ? 0 : Number(matchingPenjualan?.transactionReport?.goFoodTotal || 0);
      const totalLainnya = isShift1 ? 0 : Number(matchingPenjualan?.transactionReport?.otherTotal || 0);

      const modalAwal = Number(log.modalAwal || 0);
      const modalTambahan = Number(log.modalTambahan || 0);
      const shift1Difference = Number(log.shift1Difference || 0);
      const totalOperasional = Number(log.operationalTotal || 0);
      const totalBelanja = Number(log.purchaseTotal || 0);
      const totalFree = Number(log.freeTotal || 0);
      const diambilOwner = Number(log.diambilOwner || 0);
      const uangDiPegang = Number(log.cashOnHand || 0);

      // Sisa uang disetor / Wajib setor
      let sisaUangDisetor = Number(log.expectedCashToSettle || 0);
      const cashSales = isShift1
        ? Number(log.cashSales || 0)
        : Number(log.cashFromClosing || log.cashSales || 0);
      
      const calcExpected = cashSales + modalAwal + modalTambahan + (isShift1 ? 0 : shift1Difference) - totalOperasional - totalBelanja - totalFree - diambilOwner;
      if (cashSales > 0 || modalAwal > 0 || modalTambahan > 0 || totalOperasional > 0 || totalBelanja > 0) {
        sisaUangDisetor = calcExpected;
      }

      const selisihKeuangan = uangDiPegang - sisaUangDisetor;

      list.push({
        id: log.id,
        tanggal: dStr,
        shift: logShift,
        karyawanNama: log.karyawanNama || "Karyawan",
        totalPenjualan,
        totalQris,
        totalCash,
        totalGofood,
        totalLainnya,
        modalAwal,
        modalTambahan,
        shift1Difference,
        totalOperasional,
        totalBelanja,
        totalFree,
        diambilOwner,
        sisaUangDisetor,
        uangDiPegang,
        selisihKeuangan,
        note: log.note || log.notes || "",
        operationalDetails: log.operationalDetails || [],
        purchaseDetails: log.purchaseDetails || [],
        freeDetails: log.freeDetails || [],
        penjualanDoc: matchingPenjualan || null,
        rawLog: log
      });
    });

    // Sort by date desc, then shift desc
    list.sort((a, b) => {
      const cmp = b.tanggal.localeCompare(a.tanggal);
      if (cmp !== 0) return cmp;
      return b.shift - a.shift;
    });

    return list;
  }, [rawKeuanganLogs, rawPenjualanLogs, appliedMode, appliedDate, appliedMonth, appliedYear, appliedShift, penjualanByDateMap]);

  // Totals of all closing components
  const totals = useMemo(() => {
    return filteredClosingList.reduce((acc, curr) => {
      acc.totalPenjualan += curr.totalPenjualan;
      acc.totalQris += curr.totalQris;
      acc.totalCash += curr.totalCash;
      acc.totalGofood += curr.totalGofood;
      acc.totalLainnya += curr.totalLainnya;
      acc.totalModalAwal += curr.modalAwal;
      acc.totalModalTambahan += curr.modalTambahan;
      acc.totalOperasional += curr.totalOperasional;
      acc.totalBelanja += curr.totalBelanja;
      acc.totalFree += curr.totalFree;
      acc.totalDiambilOwner += curr.diambilOwner;
      acc.totalWajibSetor += curr.sisaUangDisetor;
      acc.totalUangFisik += curr.uangDiPegang;
      acc.totalSelisih += curr.selisihKeuangan;
      return acc;
    }, {
      totalPenjualan: 0,
      totalQris: 0,
      totalCash: 0,
      totalGofood: 0,
      totalLainnya: 0,
      totalModalAwal: 0,
      totalModalTambahan: 0,
      totalOperasional: 0,
      totalBelanja: 0,
      totalFree: 0,
      totalDiambilOwner: 0,
      totalWajibSetor: 0,
      totalUangFisik: 0,
      totalSelisih: 0,
    });
  }, [filteredClosingList]);

  // Breakdown aggregations for Operasional, Belanja, and Free
  const aggregatedBreakdown = useMemo(() => {
    const operasionalList: any[] = [];
    const purchaseList: any[] = [];
    const freeList: any[] = [];
    const productSalesMap = new Map<string, { code: string; name: string; qty: number; pendapatan: number; keuntungan: number }>();

    filteredClosingList.forEach((closing) => {
      // 1. Operasional items
      (closing.operationalDetails || []).forEach((op: any) => {
        operasionalList.push({
          tanggal: closing.tanggal,
          shift: closing.shift,
          karyawan: closing.karyawanNama,
          pembayaran: op.pembayaran || op.keterangan || "Operasional",
          nominal: Number(op.nominal || 0)
        });
      });

      // 2. Belanja items
      (closing.purchaseDetails || []).forEach((pur: any) => {
        purchaseList.push({
          tanggal: closing.tanggal,
          shift: closing.shift,
          karyawan: closing.karyawanNama,
          nomorNota: pur.nomorNota || "-",
          total: Number(pur.total || 0),
          items: pur.items || []
        });
      });

      // 3. Free items
      (closing.freeDetails || []).forEach((fr: any) => {
        freeList.push({
          tanggal: closing.tanggal,
          shift: closing.shift,
          karyawan: closing.karyawanNama,
          notes: fr.notes || "-",
          totalNominal: Number(fr.totalNominal || 0),
          items: fr.items || []
        });
      });

      // 4. Products sold from penjualanDoc
      if (closing.penjualanDoc?.items) {
        closing.penjualanDoc.items.forEach((it: any) => {
          const key = it.code || it.name;
          if (!key) return;
          const prev = productSalesMap.get(key) || {
            code: it.code || "-",
            name: it.name || "-",
            qty: 0,
            pendapatan: 0,
            keuntungan: 0
          };
          prev.qty += Number(it.total || 0);
          prev.pendapatan += Number(it.pendapatan || 0);
          prev.keuntungan += Number(it.keuntungan || 0);
          productSalesMap.set(key, prev);
        });
      }
    });

    const topProducts = Array.from(productSalesMap.values()).sort((a, b) => b.qty - a.qty);

    return {
      operasionalList,
      purchaseList,
      freeList,
      topProducts
    };
  }, [filteredClosingList]);

  const currentPeriodLabel = useMemo(() => {
    if (appliedMode === "daily") {
      const parts = appliedDate.split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return appliedDate;
    }
    if (appliedMode === "monthly") {
      const parts = appliedMonth.split("-");
      if (parts.length === 2) {
        const monthNames = [
          "Januari", "Februari", "Maret", "April", "Mei", "Juni",
          "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        return `${monthNames[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
      }
      return appliedMonth;
    }
    return `Tahun ${appliedYear}`;
  }, [appliedMode, appliedDate, appliedMonth, appliedYear]);

  // Single daily active item for daily mode
  const singleDailyItem = useMemo(() => {
    if (appliedMode !== "daily" || filteredClosingList.length === 0) return null;
    return filteredClosingList[0];
  }, [appliedMode, filteredClosingList]);

  // Export Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Sheet Ringkasan
    const summaryData = [
      { Keterangan: "Periode Laporan", Nilai: currentPeriodLabel },
      { Keterangan: "Filter Shift", Nilai: appliedShift === "all" ? "Semua Shift" : `Shift ${appliedShift}` },
      { Keterangan: "Total Closing Tercatat", Nilai: filteredClosingList.length },
      { Keterangan: "Total Penjualan", Nilai: totals.totalPenjualan },
      { Keterangan: "Total QRIS", Nilai: totals.totalQris },
      { Keterangan: "Total Cash", Nilai: totals.totalCash },
      { Keterangan: "Total GoFood", Nilai: totals.totalGofood },
      { Keterangan: "Total Modal Awal", Nilai: totals.totalModalAwal },
      { Keterangan: "Total Modal Tambahan", Nilai: totals.totalModalTambahan },
      { Keterangan: "Total Operasional", Nilai: totals.totalOperasional },
      { Keterangan: "Total Belanja Bahan", Nilai: totals.totalBelanja },
      { Keterangan: "Total Input Free", Nilai: totals.totalFree },
      { Keterangan: "Total Diambil Owner", Nilai: totals.totalDiambilOwner },
      { Keterangan: "Total Wajib Setor", Nilai: totals.totalWajibSetor },
      { Keterangan: "Total Uang Fisik (Cash on Hand)", Nilai: totals.totalUangFisik },
      { Keterangan: "Total Selisih Verifikasi", Nilai: totals.totalSelisih },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Rekapan");

    // 2. Sheet Rincian Closing
    const closingRows = filteredClosingList.map((r, idx) => ({
      No: idx + 1,
      Tanggal: r.tanggal,
      Shift: `Shift ${r.shift}`,
      Karyawan: r.karyawanNama,
      "Total Penjualan": r.totalPenjualan,
      QRIS: r.totalQris,
      Cash: r.totalCash,
      "Modal Awal": r.modalAwal,
      "Modal Tambahan": r.modalTambahan,
      Operasional: r.totalOperasional,
      "Belanja Bahan": r.totalBelanja,
      "Free Produk": r.totalFree,
      "Diambil Owner": r.diambilOwner,
      "Wajib Setor": r.sisaUangDisetor,
      "Uang Fisik": r.uangDiPegang,
      Selisih: r.selisihKeuangan,
      Catatan: r.note || "-"
    }));
    if (closingRows.length > 0) {
      const wsClosing = XLSX.utils.json_to_sheet(closingRows);
      XLSX.utils.book_append_sheet(wb, wsClosing, "Daftar Closing");
    }

    // 3. Sheet Operasional
    if (aggregatedBreakdown.operasionalList.length > 0) {
      const opRows = aggregatedBreakdown.operasionalList.map((op, idx) => ({
        No: idx + 1,
        Tanggal: op.tanggal,
        Shift: `Shift ${op.shift}`,
        Karyawan: op.karyawan,
        Keterangan: op.pembayaran,
        Nominal: op.nominal
      }));
      const wsOp = XLSX.utils.json_to_sheet(opRows);
      XLSX.utils.book_append_sheet(wb, wsOp, "Operasional");
    }

    // 4. Sheet Belanja Bahan
    if (aggregatedBreakdown.purchaseList.length > 0) {
      const purRows: any[] = [];
      aggregatedBreakdown.purchaseList.forEach((pur) => {
        if (pur.items && pur.items.length > 0) {
          pur.items.forEach((it: any) => {
            purRows.push({
              Tanggal: pur.tanggal,
              Shift: `Shift ${pur.shift}`,
              "No Nota": pur.nomorNota,
              "Nama Bahan": it.materialName || "-",
              Jumlah: `${it.qty || 0} ${it.unit || ""}`,
              "Harga Satuan": it.price || 0,
              Total: (it.price || 0) * (it.qty || 0)
            });
          });
        } else {
          purRows.push({
            Tanggal: pur.tanggal,
            Shift: `Shift ${pur.shift}`,
            "No Nota": pur.nomorNota,
            "Nama Bahan": "Paket Belanja",
            Jumlah: "1",
            "Harga Satuan": pur.total,
            Total: pur.total
          });
        }
      });
      const wsPur = XLSX.utils.json_to_sheet(purRows);
      XLSX.utils.book_append_sheet(wb, wsPur, "Belanja Bahan");
    }

    // 5. Sheet Produk Terjual
    if (aggregatedBreakdown.topProducts.length > 0) {
      const prodRows = aggregatedBreakdown.topProducts.map((p, idx) => ({
        No: idx + 1,
        Kode: p.code,
        "Nama Produk": p.name,
        "Jumlah Terjual (Pcs)": p.qty,
        "Total Pendapatan": p.pendapatan,
        "Total Keuntungan": p.keuntungan
      }));
      const wsProd = XLSX.utils.json_to_sheet(prodRows);
      XLSX.utils.book_append_sheet(wb, wsProd, "Produk Terjual");
    }

    XLSX.writeFile(wb, `Laporan_Closing_Toko_${appliedMode}_${appliedDate || appliedMonth || appliedYear}.xlsx`);
  };

  // Export PDF
  const handleExportPDF = () => {
    const docPDF = new jsPDF("l", "mm", "a4");
    docPDF.setFontSize(14);
    docPDF.text("LAPORAN REKAPITULASI CLOSING TOKO", 148, 14, { align: "center" });
    docPDF.setFontSize(9);
    docPDF.text(`Periode: ${currentPeriodLabel} | Shift: ${appliedShift === "all" ? "Semua Shift" : `Shift ${appliedShift}`}`, 148, 20, { align: "center" });

    // Summary Table (2 rows)
    const summaryRows = [
      [
        formatCurrency(totals.totalPenjualan),
        formatCurrency(totals.totalQris),
        formatCurrency(totals.totalCash),
        formatCurrency(totals.totalOperasional),
        formatCurrency(totals.totalBelanja),
        formatCurrency(totals.totalFree),
        formatCurrency(totals.totalDiambilOwner),
        formatCurrency(totals.totalWajibSetor),
        formatCurrency(totals.totalUangFisik),
        formatCurrency(totals.totalSelisih)
      ]
    ];

    autoTable(docPDF, {
      head: [["Penjualan", "QRIS", "Cash", "Operasional", "Belanja", "Free", "D. Owner", "Wajib Setor", "Uang Fisik", "Selisih"]],
      body: summaryRows,
      startY: 25,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7, halign: "center" },
      styles: { fontSize: 7, cellPadding: 2, halign: "right" }
    });

    // Detail Table
    const tableBody = filteredClosingList.map((r, idx) => [
      idx + 1,
      r.tanggal,
      `S${r.shift}`,
      formatCurrency(r.totalPenjualan),
      formatCurrency(r.totalQris),
      formatCurrency(r.totalCash),
      formatCurrency(r.modalAwal),
      formatCurrency(r.totalOperasional),
      formatCurrency(r.totalBelanja),
      formatCurrency(r.totalFree),
      formatCurrency(r.diambilOwner),
      formatCurrency(r.sisaUangDisetor),
      formatCurrency(r.uangDiPegang),
      formatCurrency(r.selisihKeuangan)
    ]);

    // Footer summary row
    tableBody.push([
      "TOTAL",
      "-",
      "-",
      formatCurrency(totals.totalPenjualan),
      formatCurrency(totals.totalQris),
      formatCurrency(totals.totalCash),
      formatCurrency(totals.totalModalAwal),
      formatCurrency(totals.totalOperasional),
      formatCurrency(totals.totalBelanja),
      formatCurrency(totals.totalFree),
      formatCurrency(totals.totalDiambilOwner),
      formatCurrency(totals.totalWajibSetor),
      formatCurrency(totals.totalUangFisik),
      formatCurrency(totals.totalSelisih)
    ]);

    autoTable(docPDF, {
      head: [["No", "Tanggal", "Shift", "Penjualan", "QRIS", "Cash", "M. Awal", "Operasional", "Belanja", "Free", "D. Owner", "Wajib Setor", "Uang Fisik", "Selisih"]],
      body: tableBody,
      startY: (docPDF as any).lastAutoTable.finalY + 5,
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5, halign: "center" },
      styles: { fontSize: 6, cellPadding: 1.8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { halign: "center", cellWidth: 18 },
        2: { halign: "center", cellWidth: 10 },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
        10: { halign: "right" },
        11: { halign: "right" },
        12: { halign: "right" },
        13: { halign: "right", fontStyle: "bold" },
      }
    });

    docPDF.save(`Laporan_Closing_Toko_${appliedMode}_${appliedDate || appliedMonth || appliedYear}.pdf`);
  };

  const openDetailDialog = (item: any) => {
    setSelectedClosingItem(item);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Rekapitulasi Closing Toko</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-2">
            Laporan Closing Toko
          </h1>
          <p className="text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
            Rekapitulasi penjualan POS, pengeluaran operasional, belanja bahan, dan verifikasi fisik kas
          </p>
        </div>

        <div className="flex flex-col gap-2.5 w-full md:w-auto">
          {/* Row 1: Mode & Shift Switchers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
            {/* Mode Switcher */}
            <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setFilterMode("daily")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2.5 sm:px-3.5 h-9 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  filterMode === "daily" ? "bg-primary text-white shadow-sm" : "text-slate-500"
                )}
              >
                Harian
              </Button>
              <Button
                variant="ghost"
                onClick={() => setFilterMode("monthly")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2.5 sm:px-3.5 h-9 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  filterMode === "monthly" ? "bg-primary text-white shadow-sm" : "text-slate-500"
                )}
              >
                Bulanan
              </Button>
              <Button
                variant="ghost"
                onClick={() => setFilterMode("yearly")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2.5 sm:px-3.5 h-9 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  filterMode === "yearly" ? "bg-primary text-white shadow-sm" : "text-slate-500"
                )}
              >
                Tahunan
              </Button>
            </div>

            {/* Shift Filter Switcher */}
            <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setSelectedShift("all")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2 sm:px-3 h-9 text-[8px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  selectedShift === "all" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500"
                )}
              >
                Semua
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedShift(1)}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2 sm:px-3 h-9 text-[8px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  selectedShift === 1 ? "bg-primary text-white shadow-sm" : "text-slate-500"
                )}
              >
                Shift 1
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedShift(2)}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-2 sm:px-3 h-9 text-[8px] sm:text-[9px] font-black uppercase tracking-wider transition-all",
                  selectedShift === 2 ? "bg-primary text-white shadow-sm" : "text-slate-500"
                )}
              >
                Shift 2
              </Button>
            </div>
          </div>

          {/* Row 2: Date Picker, Tampilkan, Excel, PDF */}
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-1.5 sm:gap-2 w-full">
            {/* Date Picker */}
            <div className="bg-white px-3 py-1.5 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center gap-2 min-h-[38px] sm:min-h-[42px]">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              {filterMode === "daily" ? (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-800 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                />
              ) : filterMode === "monthly" ? (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-800 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                />
              ) : (
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-800 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                />
              )}
            </div>

            {/* Tampilkan Button */}
            <Button
              onClick={handleCheck}
              disabled={loading}
              className="rounded-xl sm:rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-3 sm:px-6 h-9 sm:h-11 font-black uppercase tracking-tight sm:tracking-widest text-[8.5px] sm:text-[9px] gap-1.5 shadow-md flex items-center justify-center"
            >
              <Search className="h-3.5 w-3.5 shrink-0" /> <span>Tampilkan</span>
            </Button>

            {/* Export Buttons */}
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={loading || filteredClosingList.length === 0}
              className="rounded-xl sm:rounded-2xl border-slate-200 h-9 sm:h-11 px-2.5 sm:px-4 text-[8.5px] sm:text-[9px] font-black uppercase tracking-tight sm:tracking-wider text-slate-700 bg-white hover:bg-slate-50 gap-1.5 shadow-sm flex items-center justify-center"
              title="Download Excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> <span>Excel</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={loading || filteredClosingList.length === 0}
              className="rounded-xl sm:rounded-2xl border-slate-200 h-9 sm:h-11 px-2.5 sm:px-4 text-[8.5px] sm:text-[9px] font-black uppercase tracking-tight sm:tracking-wider text-slate-700 bg-white hover:bg-slate-50 gap-1.5 shadow-sm flex items-center justify-center"
              title="Download PDF"
            >
              <FileDown className="h-3.5 w-3.5 text-primary shrink-0" /> <span>PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="flex flex-col items-center justify-center p-20 min-h-[300px] border-none bg-white shadow-sm rounded-3xl">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">
            Memuat Rekapan Closing Toko...
          </p>
        </Card>
      ) : filteredClosingList.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 md:p-20 text-center min-h-[350px] border-none bg-white shadow-sm rounded-3xl">
          <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Belum Ada Data Closing</h4>
          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider max-w-sm mt-1">
            Tidak ditemukan catatan closing toko untuk periode {currentPeriodLabel} {appliedShift !== "all" ? `(Shift ${appliedShift})` : ""}.
          </p>
        </Card>
      ) : (
        <div className="space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500">
          {/* Primary KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {/* 1. Total Penjualan */}
            <Card className="p-4 md:p-6 bg-white border border-slate-100 shadow-sm rounded-3xl hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {filteredClosingList.length} Closing
                </span>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Penjualan</p>
              <h3 className="text-lg md:text-2xl font-black text-blue-900 mt-1 tabular-nums">
                {formatCurrency(totals.totalPenjualan)}
              </h3>
              <p className="text-[8px] font-bold text-slate-400 mt-1.5">
                QRIS: {formatCurrency(totals.totalQris)} • Cash: {formatCurrency(totals.totalCash)}
              </p>
            </Card>

            {/* 2. Total Pengeluaran (Operasional, Belanja, Free) */}
            <Card className="p-4 md:p-6 bg-white border border-slate-100 shadow-sm rounded-3xl hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-rose-50 text-rose-600 w-10 h-10 rounded-2xl flex items-center justify-center">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Pengeluaran
                </span>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Pengeluaran</p>
              <h3 className="text-lg md:text-2xl font-black text-rose-600 mt-1 tabular-nums">
                {formatCurrency(totals.totalOperasional + totals.totalBelanja + totals.totalFree)}
              </h3>
              <p className="text-[8px] font-bold text-slate-400 mt-1.5">
                Ops: {formatCurrency(totals.totalOperasional)} • Belanja: {formatCurrency(totals.totalBelanja)}
              </p>
            </Card>

            {/* 3. Total Wajib Setor vs Diambil Owner */}
            <Card className="p-4 md:p-6 bg-white border border-slate-100 shadow-sm rounded-3xl hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-emerald-50 text-emerald-600 w-10 h-10 rounded-2xl flex items-center justify-center">
                  <Coins className="h-5 w-5" />
                </div>
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                  Owner: {formatCurrency(totals.totalDiambilOwner)}
                </span>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Wajib Setor</p>
              <h3 className="text-lg md:text-2xl font-black text-emerald-700 mt-1 tabular-nums">
                {formatCurrency(totals.totalWajibSetor)}
              </h3>
              <p className="text-[8px] font-bold text-slate-400 mt-1.5">
                Fisik Kas: {formatCurrency(totals.totalUangFisik)}
              </p>
            </Card>

            {/* 4. Total Selisih Verifikasi */}
            <Card className={cn(
              "p-4 md:p-6 border shadow-sm rounded-3xl transition-all",
              totals.totalSelisih === 0
                ? "bg-slate-900 text-white border-slate-800"
                : totals.totalSelisih > 0
                ? "bg-amber-950 text-white border-amber-800"
                : "bg-rose-950 text-white border-rose-900"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-white">
                  {totals.totalSelisih === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  )}
                </div>
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {totals.totalSelisih === 0 ? "Akumulasi Klop" : totals.totalSelisih > 0 ? "Lebih Fisik" : "Kurang Fisik"}
                </span>
              </div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Selisih Verifikasi</p>
              <h3 className="text-lg md:text-2xl font-black mt-1 tabular-nums text-white">
                {formatCurrency(totals.totalSelisih)}
              </h3>
              <p className="text-[8px] font-bold text-slate-300 mt-1.5">
                Uang Fisik dikurangi Wajib Setor
              </p>
            </Card>
          </div>

          {/* If Single Daily Mode with 1 record, show the detailed 2-column breakdown card */}
          {appliedMode === "daily" && appliedShift !== "all" && singleDailyItem && (
            <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between gap-4 bg-slate-50/20">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-md font-black uppercase italic text-slate-900">
                      Rincian Closing Toko • {singleDailyItem.tanggal} (Shift {singleDailyItem.shift})
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Karyawan Input: {singleDailyItem.karyawanNama}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => openDetailDialog(singleDailyItem)}
                  className="rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[9px] gap-2 px-4 h-10 hover:bg-primary/95 transition-all duration-300 shadow-md"
                >
                  <Eye className="h-4 w-4" /> Detail Input Karyawan
                </Button>
              </div>

              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2 p-6 md:p-8 gap-6">
                  {/* Left Side: Summary of Sales */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Ikhtisar Pendapatan & Pembayaran
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-4">
                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">
                          {singleDailyItem.shift === 1 ? "Penjualan (Input)" : "Penjualan (POS/Excel)"}
                        </span>
                        <span className="text-sm md:text-base font-black text-slate-900 tabular-nums">
                          {formatCurrency(singleDailyItem.totalPenjualan)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Total QRIS</span>
                        <span className="text-sm md:text-base font-black text-indigo-600 tabular-nums">
                          {formatCurrency(singleDailyItem.totalQris)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Total Cash</span>
                        <span className="text-sm md:text-base font-black text-emerald-600 tabular-nums">
                          {formatCurrency(singleDailyItem.totalCash)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">
                          {singleDailyItem.shift === 1 ? "Modal Awal (Pagi)" : "Modal Awal (Shift 1)"}
                        </span>
                        <span className="text-sm md:text-base font-black text-indigo-700 tabular-nums">
                          {formatCurrency(singleDailyItem.modalAwal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Summary of Finances / Expenses */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Ikhtisar Pengeluaran & Setoran
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-4">
                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Operasional</span>
                        <span className="text-sm md:text-base font-black text-rose-600 tabular-nums">
                          {formatCurrency(singleDailyItem.totalOperasional)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Belanja Bahan</span>
                        <span className="text-sm md:text-base font-black text-rose-600 tabular-nums">
                          {formatCurrency(singleDailyItem.totalBelanja)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Input Free</span>
                        <span className="text-sm md:text-base font-black text-pink-600 tabular-nums">
                          {formatCurrency(singleDailyItem.totalFree)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600">Modal Tambahan</span>
                        <span className="text-sm md:text-base font-black text-amber-700 tabular-nums">
                          {formatCurrency(singleDailyItem.modalTambahan)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-orange-100 bg-orange-50/50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-orange-700">Diambil Owner</span>
                        <span className="text-sm md:text-base font-black text-orange-950 tabular-nums">
                          {formatCurrency(singleDailyItem.diambilOwner)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-emerald-200 bg-emerald-50 md:flex-row md:items-center md:px-5 md:py-4">
                        <span className="text-[9px] md:text-xs font-black uppercase text-emerald-700">Wajib Setor</span>
                        <span className="text-sm md:text-base font-black text-emerald-700 tabular-nums">
                          {formatCurrency(singleDailyItem.sisaUangDisetor)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cash Verification Footer */}
                <div className="bg-slate-50/30 p-6 md:p-8 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Wajib Setor</span>
                      <span className="text-lg font-black mt-2 text-slate-800 tabular-nums">
                        {formatCurrency(singleDailyItem.sisaUangDisetor)}
                      </span>
                    </div>
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Uang Fisik Diterima (Cash On Hand)
                      </span>
                      <span className="text-lg font-black mt-2 text-slate-800 tabular-nums">
                        {formatCurrency(singleDailyItem.uangDiPegang)}
                      </span>
                    </div>
                    <div className={cn(
                      "p-4 bg-white rounded-2xl shadow-sm border flex flex-col justify-between",
                      singleDailyItem.selisihKeuangan === 0 ? "border-emerald-200" : "border-rose-200"
                    )}>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider",
                        singleDailyItem.selisihKeuangan === 0 ? "text-emerald-600" : "text-rose-500"
                      )}>
                        Selisih Verifikasi
                      </span>
                      <span className={cn(
                        "text-lg font-black mt-2 tabular-nums",
                        singleDailyItem.selisihKeuangan === 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {formatCurrency(singleDailyItem.selisihKeuangan)}
                      </span>
                    </div>
                  </div>

                  {singleDailyItem.note && (
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Catatan dari Karyawan</span>
                      <p className="text-xs text-slate-700 italic font-bold leading-relaxed whitespace-pre-line">
                        "{singleDailyItem.note}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Rekap Table for Bulanan, Tahunan, or Semua Shift */}
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-base md:text-lg font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Tabel Rekapitulasi Closing Toko
                </h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Periode: {currentPeriodLabel} • Total {filteredClosingList.length} Catatan Closing
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-black text-slate-600 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                <span>Total Wajib Setor:</span>
                <span className="text-emerald-700 font-black tabular-nums">{formatCurrency(totals.totalWajibSetor)}</span>
              </div>
            </div>

            {/* Desktop & Mobile Responsive Table */}
            <div className="overflow-x-auto border border-slate-100 rounded-3xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3.5 text-center">No</th>
                    <th className="px-4 py-3.5">Tanggal</th>
                    <th className="px-3 py-3.5 text-center">Shift</th>
                    <th className="px-4 py-3.5 text-right">Penjualan</th>
                    <th className="px-4 py-3.5 text-right">QRIS</th>
                    <th className="px-4 py-3.5 text-right">Cash</th>
                    <th className="px-4 py-3.5 text-right">M. Awal</th>
                    <th className="px-4 py-3.5 text-right">Operasional</th>
                    <th className="px-4 py-3.5 text-right">Belanja</th>
                    <th className="px-4 py-3.5 text-right">Free</th>
                    <th className="px-4 py-3.5 text-right text-orange-700">D. Owner</th>
                    <th className="px-4 py-3.5 text-right text-emerald-700 font-black">Wajib Setor</th>
                    <th className="px-4 py-3.5 text-right">Fisik Kas</th>
                    <th className="px-4 py-3.5 text-right">Selisih</th>
                    <th className="px-4 py-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClosingList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">{item.tanggal}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                          item.shift === 1 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-purple-50 text-purple-700 border border-purple-200"
                        )}>
                          S{item.shift}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                        {formatCurrency(item.totalPenjualan)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600 tabular-nums">
                        {formatCurrency(item.totalQris)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(item.totalCash)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700 tabular-nums">
                        {formatCurrency(item.modalAwal)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600 tabular-nums">
                        {formatCurrency(item.totalOperasional)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600 tabular-nums">
                        {formatCurrency(item.totalBelanja)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-pink-600 tabular-nums">
                        {formatCurrency(item.totalFree)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-orange-950 tabular-nums">
                        {formatCurrency(item.diambilOwner)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700 tabular-nums bg-emerald-50/30">
                        {formatCurrency(item.sisaUangDisetor)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900 tabular-nums">
                        {formatCurrency(item.uangDiPegang)}
                      </td>
                      <td className="px-4 py-3 text-right font-black tabular-nums">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px]",
                          item.selisihKeuangan === 0 ? "text-emerald-600" : item.selisihKeuangan > 0 ? "text-amber-600 bg-amber-50" : "text-rose-600 bg-rose-50"
                        )}>
                          {formatCurrency(item.selisihKeuangan)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDetailDialog(item)}
                          className="h-7 w-7 p-0 rounded-lg hover:bg-slate-100 text-slate-600"
                          title="Lihat Detail"
                        >
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black text-xs">
                    <td colSpan={3} className="px-4 py-3.5 text-center uppercase tracking-wider text-[9px]">
                      TOTAL REKAPAN ({filteredClosingList.length} CLOSING)
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.totalPenjualan)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-indigo-300">{formatCurrency(totals.totalQris)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-300">{formatCurrency(totals.totalCash)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-indigo-300">{formatCurrency(totals.totalModalAwal)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-rose-300">{formatCurrency(totals.totalOperasional)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-rose-300">{formatCurrency(totals.totalBelanja)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-pink-300">{formatCurrency(totals.totalFree)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-amber-300">{formatCurrency(totals.totalDiambilOwner)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-emerald-400">{formatCurrency(totals.totalWajibSetor)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.totalUangFisik)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className={totals.totalSelisih === 0 ? "text-emerald-400" : "text-amber-400"}>
                        {formatCurrency(totals.totalSelisih)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Breakdown Section: Operasional, Belanja, Input Free & Produk Terjual */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* 1. Rincian Pengeluaran Operasional & Belanja Rekap */}
            <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-600" />
                    Rincian Operasional & Belanja ({aggregatedBreakdown.operasionalList.length + aggregatedBreakdown.purchaseList.length})
                  </h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Semua pengeluaran kontainer tercatat dalam closing
                  </p>
                </div>
                <span className="font-black text-xs md:text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                  {formatCurrency(totals.totalOperasional + totals.totalBelanja)}
                </span>
              </div>

              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                {aggregatedBreakdown.operasionalList.length > 0 || aggregatedBreakdown.purchaseList.length > 0 ? (
                  <>
                    {/* Operasional items */}
                    {aggregatedBreakdown.operasionalList.map((op, i) => (
                      <div key={`op-${i}`} className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/40 border border-amber-100/60 text-xs">
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              Operasional S{op.shift}
                            </span>
                            <span className="text-[9px] font-black text-slate-400">{op.tanggal}</span>
                            <span className="text-[9px] font-bold text-slate-500">• {op.karyawan}</span>
                          </div>
                          <p className="font-black text-slate-800 text-xs truncate mt-0.5">{op.pembayaran}</p>
                        </div>
                        <span className="font-black text-rose-600 tabular-nums shrink-0">
                          {formatCurrency(op.nominal)}
                        </span>
                      </div>
                    ))}

                    {/* Belanja items */}
                    {aggregatedBreakdown.purchaseList.map((pur, i) => (
                      <div key={`pur-${i}`} className="p-3 rounded-2xl bg-blue-50/40 border border-blue-100/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                              Belanja S{pur.shift}
                            </span>
                            <span className="text-[9px] font-black text-slate-400">{pur.tanggal}</span>
                            <span className="text-[9px] font-bold text-slate-500">Nota: {pur.nomorNota}</span>
                          </div>
                          <span className="font-black text-rose-600 tabular-nums shrink-0">
                            {formatCurrency(pur.total)}
                          </span>
                        </div>
                        {pur.items && pur.items.length > 0 && (
                          <div className="pl-1 space-y-0.5 text-[10px] text-slate-600">
                            {pur.items.map((it: any, itemIdx: number) => (
                              <div key={itemIdx} className="flex justify-between">
                                <span>• {it.materialName} ({it.qty} {it.unit || ""})</span>
                                <span className="tabular-nums font-bold">{formatCurrency((it.price || 0) * (it.qty || 0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl">
                    Tidak ada pengeluaran operasional atau belanja pada periode ini.
                  </div>
                )}
              </div>
            </Card>

            {/* 2. Top Produk Terjual Rekap */}
            <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <h3 className="text-base md:text-lg font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-blue-600" />
                    Rekapitulasi Produk Terjual ({aggregatedBreakdown.topProducts.length})
                  </h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Akumulasi item produk dari penjualan POS closing
                  </p>
                </div>
                <span className="font-black text-xs md:text-sm text-blue-900 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                  {aggregatedBreakdown.topProducts.reduce((s, p) => s + p.qty, 0)} Pcs
                </span>
              </div>

              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                {aggregatedBreakdown.topProducts.length > 0 ? (
                  aggregatedBreakdown.topProducts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 text-xs">
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                            {p.code}
                          </span>
                          <p className="font-black text-slate-800 text-xs truncate">{p.name}</p>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">
                          Pendapatan: {formatCurrency(p.pendapatan)} • Untung: {formatCurrency(p.keuntungan)}
                        </p>
                      </div>
                      <span className="font-black text-primary bg-primary/10 px-3 py-1 rounded-xl tabular-nums shrink-0">
                        {p.qty} Pcs
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl">
                    Detail produk terjual belum tersedia untuk periode ini.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Detail Dialog for a specific closing item */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-4 sm:p-6 md:p-10 max-w-4xl w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b border-slate-100 pb-3 md:pb-4 mb-4">
            <DialogTitle className="text-base md:text-2xl font-black uppercase italic text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <Eye className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
                <span>Detail Closing {selectedClosingItem?.tanggal} (Shift {selectedClosingItem?.shift})</span>
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest mr-6">
                Karyawan: {selectedClosingItem?.karyawanNama}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedClosingItem && (
            <Tabs defaultValue="produk" className="w-full">
              <TabsList className="bg-slate-50 p-1 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-1 mb-6 border border-slate-100 w-full">
                <TabsTrigger value="produk" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                  Produk Terjual
                </TabsTrigger>
                <TabsTrigger value="transaksi" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                  Pembayaran
                </TabsTrigger>
                <TabsTrigger value="operasional" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                  Operasional, Belanja & Free
                </TabsTrigger>
                <TabsTrigger value="catatan" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                  Catatan & Selisih
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Produk Terjual */}
              <TabsContent value="produk" className="m-0 space-y-4">
                {selectedClosingItem.shift === 1 ? (
                  <div className="text-center py-12 border border-dashed border-slate-100 rounded-2xl p-6 text-slate-500 text-xs font-black uppercase">
                    Detail produk terjual tidak tersedia untuk Shift 1 (Pagi) karena hanya mencatat nominal penjualan cash dan QRIS secara manual.
                  </div>
                ) : selectedClosingItem.penjualanDoc?.items && selectedClosingItem.penjualanDoc.items.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-5 py-3 font-black uppercase text-slate-500">Kode</th>
                          <th className="px-4 py-3 font-black uppercase text-slate-500">Nama Produk</th>
                          <th className="px-4 py-3 font-black uppercase text-slate-500 text-center">Jumlah</th>
                          <th className="px-4 py-3 font-black uppercase text-slate-500 text-right">Pendapatan</th>
                          <th className="px-5 py-3 font-black uppercase text-slate-500 text-right">Keuntungan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedClosingItem.penjualanDoc.items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-5 py-3.5 font-bold text-slate-900">{item.code || "-"}</td>
                            <td className="px-4 py-3.5 font-black text-slate-800 uppercase italic">{item.name || "-"}</td>
                            <td className="px-4 py-3.5 text-center font-black text-primary tabular-nums">{item.total || 0}</td>
                            <td className="px-4 py-3.5 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(item.pendapatan || 0)}</td>
                            <td className="px-5 py-3.5 text-right font-black text-emerald-600 tabular-nums">{formatCurrency(item.keuntungan || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400 text-xs font-black uppercase border border-dashed rounded-2xl">
                    Tidak ada detail produk terjual (Laporan POS Kosong).
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Rincian Pembayaran */}
              <TabsContent value="transaksi" className="m-0 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nominal QRIS</span>
                    <span className="text-lg font-black mt-1.5 block tabular-nums text-indigo-600">
                      {formatCurrency(selectedClosingItem.totalQris)}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nominal Cash</span>
                    <span className="text-lg font-black mt-1.5 block tabular-nums text-emerald-600">
                      {formatCurrency(selectedClosingItem.totalCash)}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Modal Awal</span>
                    <span className="text-lg font-black mt-1.5 block tabular-nums text-indigo-700">
                      {formatCurrency(selectedClosingItem.modalAwal)}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Modal Tambahan</span>
                    <span className="text-lg font-black mt-1.5 block tabular-nums text-amber-700">
                      {formatCurrency(selectedClosingItem.modalTambahan)}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 col-span-2 flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-orange-700">Diambil Owner</span>
                    <span className="text-lg font-black tabular-nums text-orange-950">
                      {formatCurrency(selectedClosingItem.diambilOwner)}
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Operasional, Belanja & Free */}
              <TabsContent value="operasional" className="m-0 space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Wallet className="h-4 w-4" /> Pengeluaran Operasional ({selectedClosingItem.operationalDetails?.length || 0})
                  </h4>
                  {selectedClosingItem.operationalDetails && selectedClosingItem.operationalDetails.length > 0 ? (
                    <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
                      {selectedClosingItem.operationalDetails.map((op: any, i: number) => (
                        <div key={i} className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/50 flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-slate-700">{op.pembayaran || "Operasional"}</span>
                          <span className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(op.nominal)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase">
                      Tidak ada operasional dicatat.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Layers className="h-4 w-4" /> Belanja Bahan Baku ({selectedClosingItem.purchaseDetails?.length || 0})
                  </h4>
                  {selectedClosingItem.purchaseDetails && selectedClosingItem.purchaseDetails.length > 0 ? (
                    <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
                      {selectedClosingItem.purchaseDetails.map((pur: any, i: number) => (
                        <div key={i} className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/50 space-y-2">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-xs font-black text-slate-800 uppercase italic">Nota: {pur.nomorNota || "-"}</span>
                            <span className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(pur.total)}</span>
                          </div>
                          {(pur.items || []).map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-[11px] text-slate-500 font-bold uppercase">
                              <span>{it.materialName || "-"}</span>
                              <span className="tabular-nums">{it.qty} x {formatCurrency(it.price)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase">
                      Tidak ada belanja bahan baku dicatat.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-pink-600" /> Input Free Produk ({selectedClosingItem.freeDetails?.length || 0})
                  </h4>
                  {selectedClosingItem.freeDetails && selectedClosingItem.freeDetails.length > 0 ? (
                    <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
                      {selectedClosingItem.freeDetails.map((fr: any, i: number) => (
                        <div key={i} className="border border-pink-100 rounded-2xl p-3.5 bg-pink-50/30 space-y-2">
                          <div className="flex justify-between items-center pb-2 border-b border-pink-100/60">
                            <span className="text-xs font-black text-slate-800 uppercase">{fr.karyawanNama || "Karyawan"}</span>
                            <span className="text-xs font-black text-pink-700 tabular-nums">{formatCurrency(fr.totalNominal || 0)}</span>
                          </div>
                          {(fr.items || []).map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-[11px] text-slate-600 font-bold uppercase">
                              <span>{it.productName || it.name || "-"}</span>
                              <span className="tabular-nums">{it.qty} x {formatCurrency(it.harga || 0)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase">
                      Tidak ada input free produk.
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 4: Catatan & Selisih */}
              <TabsContent value="catatan" className="m-0 space-y-4">
                <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Catatan/Pesan Karyawan</h4>
                  <p className="text-xs text-slate-700 italic font-bold leading-relaxed whitespace-pre-line">
                    {selectedClosingItem.note ? `"${selectedClosingItem.note}"` : "Tidak ada catatan khusus dari karyawan untuk closing ini."}
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Wajib Setor</span>
                    <span className="text-base font-black text-slate-900 block mt-1 tabular-nums">
                      {formatCurrency(selectedClosingItem.sisaUangDisetor)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fisik Kas</span>
                    <span className="text-base font-black text-slate-900 block mt-1 tabular-nums">
                      {formatCurrency(selectedClosingItem.uangDiPegang)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Selisih Kas</span>
                    <span className={cn(
                      "text-base font-black block mt-1 tabular-nums",
                      selectedClosingItem.selisihKeuangan === 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {formatCurrency(selectedClosingItem.selisihKeuangan)}
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
