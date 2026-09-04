"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase, collection } from "@/firebase";
import { query, orderBy } from "firebase/firestore";
import { 
  Calendar, 
  Search, 
  Wallet, 
  TrendingDown, 
  Package, 
  Sparkles, 
  FileText, 
  ShoppingBag, 
  FileSpreadsheet, 
  FileDown, 
  RotateCcw,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Store,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

const formatCurrency = (val: number) => `Rp ${Number(val || 0).toLocaleString("id-ID")}`;

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

  // 1. Fetch Penjualan Data
  const penjualanQuery = useMemoFirebase(() => collection(db, "penjualan"), [db]);
  const { data: rawPenjualan, loading: loadingPenjualan } = useCollection(penjualanQuery);

  // 2. Fetch Operasional Toko (Owner)
  const operasionalTokoQuery = useMemoFirebase(() => collection(db, "operasional-toko"), [db]);
  const { data: rawOperasionalToko, loading: loadingOpToko } = useCollection(operasionalTokoQuery);

  // 3. Fetch Operasional Kontainer (Karyawan)
  const operasionalKontainerQuery = useMemoFirebase(() => collection(db, "operasional-kontainer"), [db]);
  const { data: rawOperasionalKontainer, loading: loadingOpKontainer } = useCollection(operasionalKontainerQuery);

  // 4. Fetch Pembelian / Belanja Bahan Baku (log_pembelian_bahan)
  const pembelianQuery = useMemoFirebase(() => collection(db, "log_pembelian_bahan"), [db]);
  const { data: rawPembelian, loading: loadingPembelian } = useCollection(pembelianQuery);

  const isDateMatch = (docDate: string) => {
    if (!docDate) return false;
    if (appliedMode === "daily") return docDate === appliedDate;
    if (appliedMode === "monthly") return docDate.startsWith(appliedMonth);
    return docDate.startsWith(appliedYear);
  };

  // Filtered lists
  const filteredPenjualan = useMemo(() => {
    if (!rawPenjualan) return [];
    return rawPenjualan.filter((doc: any) => {
      const dStr = getDocDateStr(doc);
      return isDateMatch(dStr);
    });
  }, [rawPenjualan, appliedMode, appliedDate, appliedMonth, appliedYear]);

  const filteredOperasional = useMemo(() => {
    const list: any[] = [];
    (rawOperasionalKontainer || []).forEach((doc: any) => {
      const dStr = getDocDateStr(doc);
      if (isDateMatch(dStr)) {
        list.push({
          id: doc.id,
          tanggal: dStr,
          pembayaran: doc.pembayaran || doc.keterangan || "Operasional Kontainer",
          nominal: Number(doc.nominal ?? doc.total ?? doc.jumlah ?? doc.biaya ?? 0),
          sumber: "Karyawan",
          sourceCol: "operasional-kontainer"
        });
      }
    });

    (rawOperasionalToko || []).forEach((doc: any) => {
      const dStr = getDocDateStr(doc);
      if (isDateMatch(dStr)) {
        list.push({
          id: doc.id,
          tanggal: dStr,
          pembayaran: doc.paymentTypeLabel || doc.paymentType || doc.keterangan || "Operasional Toko",
          nominal: Number(doc.nominal ?? doc.total ?? doc.jumlah ?? doc.biaya ?? 0),
          sumber: "Owner",
          sourceCol: "operasional-toko"
        });
      }
    });

    list.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    return list;
  }, [rawOperasionalKontainer, rawOperasionalToko, appliedMode, appliedDate, appliedMonth, appliedYear]);

  const filteredPembelian = useMemo(() => {
    if (!rawPembelian) return [];
    return rawPembelian.filter((doc: any) => {
      // Exclude transfers
      if (doc.type === "ambil-gudang" || doc.type === "kembali-gudang") return false;
      const dStr = getDocDateStr(doc);
      return isDateMatch(dStr);
    });
  }, [rawPembelian, appliedMode, appliedDate, appliedMonth, appliedYear]);

  // Totals calculation
  const totals = useMemo(() => {
    const penjualan = filteredPenjualan.reduce((acc: number, curr: any) => {
      const val = curr.total ?? curr.totalPenjualan ?? curr.grandTotal ?? curr.totalBayar ?? 0;
      return acc + Number(val || 0);
    }, 0);

    const operasional = filteredOperasional.reduce((acc: number, curr: any) => {
      return acc + Number(curr.nominal || 0);
    }, 0);
    
    let pembelian = 0;
    let totalQtyBahan = 0;

    filteredPembelian.forEach((curr: any) => {
      const items = curr.items || [];
      if (items.length > 0) {
        let itemsSum = 0;
        items.forEach((item: any) => {
          const price = item.price ?? item.purchasePrice ?? item.harga ?? item.hargaBeli ?? 0;
          const qty = item.qty ?? item.jumlah ?? 1;
          const sub = Number(price) * Number(qty);
          itemsSum += sub;
          totalQtyBahan += Number(qty);
        });
        if (itemsSum > 0) {
          pembelian += itemsSum;
        } else {
          pembelian += Number(curr.total ?? curr.totalBelanja ?? curr.grandTotal ?? curr.nominal ?? 0);
        }
      } else {
        pembelian += Number(curr.total ?? curr.totalBelanja ?? curr.grandTotal ?? curr.nominal ?? 0);
      }
    });

    const totalPengeluaran = operasional + pembelian;
    const labaBersih = penjualan - totalPengeluaran;
    const marginLabaBersih = penjualan > 0 ? (labaBersih / penjualan) * 100 : 0;

    return {
      penjualan,
      operasional,
      pembelian,
      totalPengeluaran,
      labaBersih,
      marginLabaBersih,
      totalQtyBahan
    };
  }, [filteredPenjualan, filteredOperasional, filteredPembelian]);

  const loading = loadingPenjualan || loadingOpToko || loadingOpKontainer || loadingPembelian;

  const currentPeriodLabel = useMemo(() => {
    if (appliedMode === "daily") {
      const parts = appliedDate.split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return appliedDate;
    }
    if (appliedMode === "monthly") {
      const parts = appliedMonth.split("-");
      if (parts.length === 2) {
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        return `${monthNames[parseInt(parts[1], 10) - 1] || parts[1]} ${parts[0]}`;
      }
      return appliedMonth;
    }
    return `Tahun ${appliedYear}`;
  }, [appliedMode, appliedDate, appliedMonth, appliedYear]);

  // Export Excel
  const handleExportExcel = () => {
    const summaryData = [
      { Keterangan: "Periode Laporan", Nilai: currentPeriodLabel },
      { Keterangan: "Total Penjualan", Nilai: totals.penjualan },
      { Keterangan: "Total Operasional (Karyawan & Owner)", Nilai: totals.operasional },
      { Keterangan: "Total Pembelian Bahan Baku", Nilai: totals.pembelian },
      { Keterangan: "Total Pengeluaran", Nilai: totals.totalPengeluaran },
      { Keterangan: "Laba Bersih", Nilai: totals.labaBersih },
      { Keterangan: "Margin Laba Bersih (%)", Nilai: `${totals.marginLabaBersih.toFixed(1)}%` },
    ];

    const operasionalRows = filteredOperasional.map(r => ({
      Tanggal: r.tanggal,
      Sumber: r.sumber,
      Keterangan: r.pembayaran,
      Nominal: r.nominal
    }));

    const pembelianRows: any[] = [];
    filteredPembelian.forEach(log => {
      const dateDisplay = getDocDateStr(log);
      const items = log.items || [];
      if (items.length > 0) {
        items.forEach((it: any) => {
          const price = it.price ?? it.purchasePrice ?? it.harga ?? it.hargaBeli ?? 0;
          const qty = it.qty ?? it.jumlah ?? 1;
          pembelianRows.push({
            "No Nota": log.nomorNota || "-",
            Tanggal: dateDisplay,
            Supplier: log.supplier || log.suplier || it.supplierName || "Beli Sendiri",
            "Nama Bahan": it.materialName || "-",
            Jumlah: `${qty} ${it.unit || it.satuan || ""}`,
            "Harga Satuan": price,
            "Total Harga": price * qty
          });
        });
      } else {
        const totalVal = Number(log.total ?? log.totalBelanja ?? log.grandTotal ?? log.nominal ?? 0);
        pembelianRows.push({
          "No Nota": log.nomorNota || "-",
          Tanggal: dateDisplay,
          Supplier: log.supplier || log.suplier || "Beli Sendiri",
          "Nama Bahan": log.keterangan || "Belanja Bahan Baku",
          Jumlah: "1 Paket",
          "Harga Satuan": totalVal,
          "Total Harga": totalVal
        });
      }
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");

    if (operasionalRows.length > 0) {
      const wsOp = XLSX.utils.json_to_sheet(operasionalRows);
      XLSX.utils.book_append_sheet(wb, wsOp, "Operasional");
    }

    if (pembelianRows.length > 0) {
      const wsPem = XLSX.utils.json_to_sheet(pembelianRows);
      XLSX.utils.book_append_sheet(wb, wsPem, "Pembelian Bahan");
    }

    XLSX.writeFile(wb, `Laba_Rugi_Bersih_${appliedMode}_${appliedDate || appliedMonth || appliedYear}.xlsx`);
  };

  // Export PDF
  const handleExportPDF = () => {
    const docPDF = new jsPDF("p", "mm", "a4");
    docPDF.setFontSize(16);
    docPDF.text("LAPORAN LABA RUGI BERSIH", 105, 18, { align: "center" });
    docPDF.setFontSize(10);
    docPDF.text(`Periode: ${currentPeriodLabel}`, 105, 25, { align: "center" });

    const summaryTable = [
      ["Total Penjualan", formatCurrency(totals.penjualan)],
      ["Total Biaya Operasional", formatCurrency(totals.operasional)],
      ["Total Pembelian Bahan Baku", formatCurrency(totals.pembelian)],
      ["Total Beban Pengeluaran", formatCurrency(totals.totalPengeluaran)],
      ["Laba Bersih (Net Profit)", formatCurrency(totals.labaBersih)],
      ["Margin Bersih", `${totals.marginLabaBersih.toFixed(1)}%`]
    ];

    autoTable(docPDF, {
      head: [["Komponen Keuangan", "Nominal"]],
      body: summaryTable,
      startY: 32,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3.5 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } }
    });

    docPDF.save(`Laba_Rugi_Bersih_${appliedMode}_${appliedDate || appliedMonth || appliedYear}.pdf`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Kalkulasi Keuangan Bersih</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Laporan Laba Rugi
          </h1>
          <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-500 mt-1">
            Penjualan dikurangi Beban Operasional (/laporan?tab=operasional) & Pembelian Bahan (/laporan?tab=belanja)
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center">
            <Button 
              variant="ghost" 
              onClick={() => setFilterMode("daily")} 
              className={cn("rounded-xl px-3.5 h-9 text-[9px] font-black uppercase tracking-widest transition-all", filterMode === "daily" ? "bg-primary text-white shadow-sm" : "text-slate-500")}
            >
              Harian
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setFilterMode("monthly")} 
              className={cn("rounded-xl px-3.5 h-9 text-[9px] font-black uppercase tracking-widest transition-all", filterMode === "monthly" ? "bg-primary text-white shadow-sm" : "text-slate-500")}
            >
              Bulanan
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setFilterMode("yearly")} 
              className={cn("rounded-xl px-3.5 h-9 text-[9px] font-black uppercase tracking-widest transition-all", filterMode === "yearly" ? "bg-primary text-white shadow-sm" : "text-slate-500")}
            >
              Tahunan
            </Button>
          </div>

          <div className="bg-white px-3.5 py-1.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            {filterMode === "daily" ? (
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-transparent border-none outline-none cursor-pointer" 
              />
            ) : filterMode === "monthly" ? (
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-transparent border-none outline-none cursor-pointer" 
              />
            ) : (
              <input 
                type="number" 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)} 
                className="text-[10px] font-black uppercase tracking-widest text-slate-800 bg-transparent border-none outline-none cursor-pointer w-20" 
              />
            )}
          </div>

          <Button 
            onClick={handleCheck} 
            disabled={loading} 
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-6 h-11 font-black uppercase tracking-widest text-[9px] gap-2 shadow-md"
          >
            <Search className="h-3.5 w-3.5" /> Tampilkan
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={loading}
              className="rounded-2xl border-slate-200 h-11 px-3 text-[9px] font-black uppercase tracking-wider text-slate-700 bg-white hover:bg-slate-50 gap-1.5 shadow-sm"
              title="Export Excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={loading}
              className="rounded-2xl border-slate-200 h-11 px-3 text-[9px] font-black uppercase tracking-wider text-slate-700 bg-white hover:bg-slate-50 gap-1.5 shadow-sm"
              title="Export PDF"
            >
              <FileDown className="h-3.5 w-3.5 text-primary" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Total Penjualan */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-5 md:p-6 hover:shadow-md transition-all duration-300 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-50 w-11 h-11 rounded-2xl flex items-center justify-center border border-emerald-100 text-emerald-600 shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Pemasukan
            </span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Total Penjualan</p>
          <h3 className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums">
            {loading ? "..." : formatCurrency(totals.penjualan)}
          </h3>
          <p className="text-[8px] font-bold text-slate-400 mt-2">
            Dari {filteredPenjualan.length} transaksi closing kasir
          </p>
        </Card>

        {/* Total Operasional */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-5 md:p-6 hover:shadow-md transition-all duration-300 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-amber-50 w-11 h-11 rounded-2xl flex items-center justify-center border border-amber-100 text-amber-600 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Tab Operasional
            </span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Total Operasional</p>
          <h3 className="text-lg sm:text-2xl font-black text-amber-700 tabular-nums">
            {loading ? "..." : formatCurrency(totals.operasional)}
          </h3>
          <p className="text-[8px] font-bold text-slate-400 mt-2">
            Dari {filteredOperasional.length} catatan pengeluaran toko & kontainer
          </p>
        </Card>

        {/* Total Pembelian Bahan Baku */}
        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-5 md:p-6 hover:shadow-md transition-all duration-300 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-50 w-11 h-11 rounded-2xl flex items-center justify-center border border-blue-100 text-blue-600 shrink-0">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Tab Belanja
            </span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Pembelian Bahan</p>
          <h3 className="text-lg sm:text-2xl font-black text-blue-900 tabular-nums">
            {loading ? "..." : formatCurrency(totals.pembelian)}
          </h3>
          <p className="text-[8px] font-bold text-slate-400 mt-2">
            Dari {filteredPembelian.length} nota belanja ({totals.totalQtyBahan} unit bahan)
          </p>
        </Card>

        {/* Laba Bersih */}
        <Card className={cn(
          "rounded-[2rem] border-none shadow-sm p-5 md:p-6 transition-all duration-300 text-white",
          totals.labaBersih >= 0 ? "bg-slate-900" : "bg-rose-950"
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="bg-white/10 w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0">
              {totals.labaBersih >= 0 ? <Sparkles className="h-5 w-5 text-amber-400" /> : <TrendingDown className="h-5 w-5 text-rose-400" />}
            </div>
            <span className={cn(
              "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
              totals.labaBersih >= 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
            )}>
              {totals.marginLabaBersih.toFixed(1)}% Margin
            </span>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Laba Bersih (Net Profit)</p>
          <h3 className={cn(
            "text-lg sm:text-2xl font-black tabular-nums",
            totals.labaBersih >= 0 ? "text-white" : "text-rose-300"
          )}>
            {loading ? "..." : formatCurrency(totals.labaBersih)}
          </h3>
          <p className="text-[8px] font-bold text-slate-400 mt-2">
            Penjualan - (Operasional + Belanja Bahan)
          </p>
        </Card>
      </div>

      {/* Rincian Beban & Pengeluaran Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rincian Operasional Toko & Kontainer */}
        <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <h3 className="text-base md:text-lg font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                Rincian Biaya Operasional
              </h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Sumber data: /laporan?tab=operasional
              </p>
            </div>
            <span className="font-black text-xs md:text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
              {formatCurrency(totals.operasional)}
            </span>
          </div>

          {filteredOperasional.length > 0 ? (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredOperasional.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 text-xs">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                        item.sumber === "Owner" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      )}>
                        {item.sumber}
                      </span>
                      <span className="text-[9px] font-black text-slate-400">{item.tanggal}</span>
                    </div>
                    <p className="font-black text-slate-800 text-xs truncate mt-0.5">{item.pembayaran}</p>
                  </div>
                  <span className="font-black text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(item.nominal)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl">
              Tidak ada data pengeluaran operasional pada periode ini.
            </div>
          )}
        </Card>

        {/* Rincian Belanja Bahan Baku */}
        <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <h3 className="text-base md:text-lg font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-blue-600" />
                Rincian Belanja Bahan Baku
              </h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Sumber data: /laporan?tab=belanja
              </p>
            </div>
            <span className="font-black text-xs md:text-sm text-blue-900 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
              {formatCurrency(totals.pembelian)}
            </span>
          </div>

          {filteredPembelian.length > 0 ? (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredPembelian.map((log, idx) => {
                const logDate = getDocDateStr(log);
                const items = log.items || [];
                let logTotal = 0;
                if (items.length > 0) {
                  logTotal = items.reduce((s: number, it: any) => {
                    const price = it.price ?? it.purchasePrice ?? it.harga ?? it.hargaBeli ?? 0;
                    const qty = it.qty ?? it.jumlah ?? 1;
                    return s + (Number(price) * Number(qty));
                  }, 0);
                } else {
                  logTotal = Number(log.total ?? log.totalBelanja ?? log.grandTotal ?? log.nominal ?? 0);
                }
                const isBeliSendiri = log.type === "belanja" || log.type === "beli-sendiri" || log.purchaseType === "beli-sendiri";

                return (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                          #{log.nomorNota || "NOTA"}
                        </span>
                        <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded border",
                          isBeliSendiri ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-50 text-blue-800 border-blue-200"
                        )}>
                          {isBeliSendiri ? "Beli Sendiri" : (log.supplier || log.suplier || "Supliyer")}
                        </span>
                        <span className="text-[9px] font-black text-slate-400">{logDate}</span>
                      </div>
                      <span className="font-black text-xs text-slate-900 tabular-nums shrink-0">
                        {formatCurrency(logTotal)}
                      </span>
                    </div>

                    <div className="space-y-1 pl-1">
                      {items.length > 0 ? (
                        items.map((it: any, itemIdx: number) => {
                          const itPrice = it.price ?? it.purchasePrice ?? it.harga ?? it.hargaBeli ?? 0;
                          const itQty = it.qty ?? it.jumlah ?? 1;
                          return (
                            <div key={itemIdx} className="flex justify-between items-center text-[10px] text-slate-600">
                              <span className="font-bold truncate pr-2">
                                • {it.materialName} ({itQty} {it.unit || it.satuan || ""})
                              </span>
                              <span className="font-black text-slate-800 tabular-nums shrink-0">
                                {formatCurrency(itPrice * itQty)}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex justify-between items-center text-[10px] text-slate-600">
                          <span className="font-bold truncate pr-2">
                            • {log.keterangan || "Belanja Bahan Baku"}
                          </span>
                          <span className="font-black text-slate-800 tabular-nums shrink-0">
                            {formatCurrency(logTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl">
              Tidak ada data belanja bahan baku pada periode ini.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
