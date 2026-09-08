"use client";

import { getStoreConfigDocId } from "@/lib/branch-helper";


import React, { useState, useMemo } from "react";
import { 
  TrendingUp, 
  Wallet, 
  Calendar,
  FileSpreadsheet,
  Printer,
  ShoppingBag,
  Trash2,
  AlertCircle,
  Search,
  Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore, useCollection, useMemoFirebase, useDoc, collection, doc } from "@/firebase";
import { query, where, orderBy, writeBatch } from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";

export default function LabaRugiPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const [appliedDate, setAppliedDate] = useState(selectedDate);
  const [appliedMonth, setAppliedMonth] = useState(selectedMonth);
  const [appliedType, setAppliedType] = useState(reportType);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);

  const handleCheck = () => {
    setAppliedDate(selectedDate);
    setAppliedMonth(selectedMonth);
    setAppliedType(reportType);
  };

  const penjualanQuery = useMemoFirebase(() => {
    if (appliedType === 'daily') {
      return query(
        collection(db, "penjualan"),
        where("tanggal", "==", appliedDate)
      );
    } else {
      return query(
        collection(db, "penjualan"),
        orderBy("tanggal", "asc")
      );
    }
  }, [db, appliedType, appliedDate]);

  const { data: rawData, loading } = useCollection(penjualanQuery);

  const productsQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const { data: products } = useCollection(productsQuery);

  const filteredData = useMemo(() => {
    if (appliedType === 'daily') return rawData;
    return rawData?.filter(d => d.tanggal.startsWith(appliedMonth)) || [];
  }, [rawData, appliedType, appliedMonth]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => ({
      pendapatan: acc.pendapatan + (curr.total || 0),
      hpp: acc.hpp + (curr.hpp || 0),
      keuntungan: acc.keuntungan + (Number(curr.keuntunganTotal ?? Math.max((curr.total || 0) - (curr.hpp || 0), 0))),
      qty: acc.qty + (curr.totalQty || 0)
    }), { pendapatan: 0, hpp: 0, keuntungan: 0, qty: 0 });
  }, [filteredData]);

  const productSummary = useMemo(() => {
    const summary: { [key: string]: any } = {};

    const findProduct = (itemCode?: string, itemName?: string, itemId?: string) => {
      if (!products || !products.length) return null;
      const rawCode = itemCode?.trim().toUpperCase();
      const cleanCode = rawCode?.replace(/[\s-_]/g, '');
      const rawName = itemName?.trim().toLowerCase();

      // 1. Match by product ID
      if (itemId) {
        const byId = products.find((p: any) => p.id === itemId);
        if (byId) return byId;
      }
      // 2. Match by exact code or normalized code
      if (rawCode) {
        const byCode = products.find((p: any) => {
          const pCode = p.code?.trim().toUpperCase();
          if (!pCode) return false;
          const pClean = pCode.replace(/[\s-_]/g, '');
          return pCode === rawCode || (cleanCode && pClean === cleanCode);
        });
        if (byCode) return byCode;
      }
      // 3. Match by Name
      if (rawName) {
        const byName = products.find((p: any) => p.nama?.trim().toLowerCase() === rawName);
        if (byName) return byName;
      }
      return null;
    };

    filteredData.forEach(closing => {
      closing.items?.forEach((item: any) => {
        const matchedProduct = findProduct(item.code || item.kode, item.name || item.nama, item.produkId || item.id);
        
        const finalCode = matchedProduct?.code || item.code || item.kode || "-";
        const finalName = matchedProduct?.nama || item.name || item.nama || "-";
        const finalCategory = matchedProduct?.kategori || item.kategori || "-";
        const groupKey = finalCode !== "-" ? finalCode.toUpperCase() : finalName.toLowerCase();

        if (!summary[groupKey]) {
          summary[groupKey] = { 
            code: finalCode, 
            name: finalName, 
            kategori: finalCategory,
            total: 0, 
            pendapatan: 0, 
            keuntungan: 0,
            margin: 0
          };
        }
        summary[groupKey].total += Number(item.total ?? item.qty ?? 0);
        summary[groupKey].pendapatan += Number(item.pendapatan ?? item.totalHarga ?? 0);
        summary[groupKey].keuntungan += Number(item.keuntungan ?? 0);
      });
    });

    return Object.values(summary).map((item: any) => ({
      ...item,
      margin: item.pendapatan > 0 ? (item.keuntungan / item.pendapatan) * 100 : 0
    })).sort((a: any, b: any) => 
      (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [filteredData, products]);

  const handleDeleteReport = async () => {
    const periodLabel = appliedType === 'daily' ? appliedDate : appliedMonth;
    if (!confirm(`PERINGATAN: Hapus seluruh data laporan untuk ${periodLabel}? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      const batch = writeBatch(db);
      filteredData.forEach((docItem: any) => {
        batch.delete(doc(db, "penjualan", docItem.id));
      });
      await batch.commit();
      
      toast({
        title: "Laporan Dihapus",
        description: `Seluruh data laporan periode ${periodLabel} telah dihapus dari database.`,
      });
    } catch (error) {
      console.error("Gagal menghapus laporan:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan sistem saat mencoba menghapus data.",
      });
    }
  };

  const handleExportExcel = () => {
    const wsData = productSummary.map(item => ({
      "Kode": item.code,
      "Nama Produk": item.name,
      "Kategori": item.kategori,
      "Qty Terjual": item.total,
      "Pendapatan (Rp)": item.pendapatan,
      "Keuntungan (Rp)": item.keuntungan,
      "Margin (%)": item.margin
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
    
    const fileName = `Laporan_${appliedType === 'daily' ? appliedDate : appliedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF('p', 'mm', 'a4');
    
    // Header / Kop
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

    docPDF.setFontSize(18);
    docPDF.setTextColor(139, 26, 26);
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 105, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 105, 21, { align: 'center' });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 195, 28);

    const title = appliedType === 'daily' ? `LAPORAN HARIAN - ${appliedDate}` : `LAPORAN BULANAN - ${appliedMonth}`;
    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text(title, 105, 40, { align: 'center' });

    docPDF.setFontSize(10);
    docPDF.text(`Total Pendapatan: Rp ${totals.pendapatan.toLocaleString('id-ID')}`, 20, 55);
    docPDF.text(`Total HPP: Rp ${totals.hpp.toLocaleString('id-ID')}`, 20, 62);
    docPDF.text(`Laba Kotor: Rp ${totals.keuntungan.toLocaleString('id-ID')}`, 20, 69);
    docPDF.text(`Total Produk Terjual: ${totals.qty}`, 20, 76);

    const tableData = productSummary.map(item => [
      item.code,
      item.name.toUpperCase(),
      item.kategori.toUpperCase(),
      item.total,
      `Rp ${item.pendapatan.toLocaleString('id-ID')}`,
      `Rp ${item.keuntungan.toLocaleString('id-ID')}`,
      `${item.margin.toFixed(1)}%`
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA PRODUK", "KATEGORI", "QTY", "PENDAPATAN", "KEUNTUNGAN", "MARGIN"]],
      body: tableData,
      startY: 85,
      theme: 'grid',
      headStyles: { fillColor: [139, 26, 26], textColor: [255, 255, 255] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      }
    });

    const fileName = `Laporan_${appliedType === 'daily' ? appliedDate : appliedMonth}.pdf`;
    docPDF.save(fileName);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Laporan Keuangan</h1>
          <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em]">
            Analisis Penjualan & Laba Rugi • Zona Waktu
          </p>
        </div>
        
        <div className="flex flex-col gap-3 w-full md:w-auto">
          {/* Row 1: Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center sm:justify-end w-full">
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              {/* Type Switcher */}
              <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  onClick={() => setReportType('daily')}
                  className={cn(
                    "flex-1 sm:flex-none rounded-xl px-3 sm:px-4 h-9 sm:h-10 text-[9px] font-black uppercase tracking-wider transition-all",
                    reportType === 'daily' ? "bg-primary text-white shadow-md" : "text-slate-500"
                  )}
                >
                  Harian
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={() => setReportType('monthly')}
                  className={cn(
                    "flex-1 sm:flex-none rounded-xl px-3 sm:px-4 h-9 sm:h-10 text-[9px] font-black uppercase tracking-wider transition-all",
                    reportType === 'monthly' ? "bg-primary text-white shadow-md" : "text-slate-500"
                  )}
                >
                  Bulanan
                </Button>
              </div>

              {/* Date/Month Input */}
              <div className="bg-white px-3 py-1.5 sm:py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center gap-2 min-h-[38px] sm:min-h-[42px]">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                {reportType === 'daily' ? (
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                  />
                ) : (
                  <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                  />
                )}
              </div>
            </div>

            {/* Tampilkan Data Button */}
            <Button 
              onClick={handleCheck}
              disabled={loading}
              className="rounded-xl sm:rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-5 sm:px-8 h-10 sm:h-12 font-black uppercase tracking-widest text-[9px] sm:text-[10px] gap-2 shadow-md w-full sm:w-auto shrink-0 flex items-center justify-center"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>Tampilkan Data</span>
            </Button>
          </div>

          {/* Row 2: Action Buttons (Excel, PDF A4, Hapus Laporan in 1 Row on Mobile) */}
          <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-end gap-1.5 sm:gap-2 w-full">
            <Button 
              variant="outline" 
              onClick={handleExportExcel}
              disabled={loading || filteredData.length === 0}
              className="rounded-xl border-slate-200 px-2 sm:px-5 h-9 sm:h-10 font-black uppercase tracking-tight sm:tracking-widest text-[8.5px] sm:text-[9px] gap-1.5 shadow-sm bg-white hover:bg-slate-50 text-slate-700 w-full sm:w-auto flex items-center justify-center"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Excel</span>
            </Button>
            <Button 
              onClick={handleExportPDF}
              disabled={loading || filteredData.length === 0}
              className="rounded-xl bg-slate-700 hover:bg-slate-600 text-white px-2 sm:px-5 h-9 sm:h-10 font-black uppercase tracking-tight sm:tracking-widest text-[8.5px] sm:text-[9px] gap-1.5 shadow-sm w-full sm:w-auto flex items-center justify-center"
            >
              <Printer className="h-3.5 w-3.5 text-white shrink-0" />
              <span className="truncate">PDF A4</span>
            </Button>
            <Button 
              variant="destructive"
              disabled={loading || filteredData.length === 0}
              onClick={handleDeleteReport}
              className="rounded-xl px-2 sm:px-5 h-9 sm:h-10 font-black uppercase tracking-tight sm:tracking-widest text-[8.5px] sm:text-[9px] gap-1.5 shadow-sm border-none bg-rose-500 hover:bg-rose-600 text-white w-full sm:w-auto flex items-center justify-center"
            >
              <Trash2 className="h-3.5 w-3.5 text-white shrink-0" />
              <span className="truncate">Hapus</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-none shadow-sm bg-white p-4 md:p-8 group hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-emerald-50 w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 group-hover:scale-110 transition-transform shrink-0">
            <Wallet className="h-5 w-5 md:h-7 md:w-7 text-emerald-600" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] md:tracking-[0.2em] mb-1 truncate">Total Pendapatan</p>
          <h3 className="text-sm sm:text-2xl md:text-3xl font-black text-slate-900 italic tracking-tighter truncate">
            {loading ? "..." : `Rp ${totals.pendapatan.toLocaleString('id-ID')}`}
          </h3>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-none shadow-sm bg-white p-4 md:p-8 group hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-amber-50 w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 group-hover:scale-110 transition-transform shrink-0">
            <TrendingUp className="h-5 w-5 md:h-7 md:w-7 text-amber-600" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] md:tracking-[0.2em] mb-1 truncate">Total HPP</p>
          <h3 className="text-sm sm:text-2xl md:text-3xl font-black text-amber-700 italic tracking-tighter truncate">
            {loading ? "..." : `Rp ${totals.hpp.toLocaleString('id-ID')}`}
          </h3>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-none shadow-sm bg-white p-4 md:p-8 group hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-primary/5 w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 group-hover:scale-110 transition-transform shrink-0">
            <TrendingUp className="h-5 w-5 md:h-7 md:w-7 text-primary" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] md:tracking-[0.2em] mb-1 truncate">Laba Kotor</p>
          <h3 className="text-sm sm:text-2xl md:text-3xl font-black text-primary italic tracking-tighter truncate">
            {loading ? "..." : `Rp ${totals.keuntungan.toLocaleString('id-ID')}`}
          </h3>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-none shadow-sm bg-slate-900 p-4 md:p-8 group hover:shadow-xl transition-all duration-500 text-white">
          <div className="bg-white/10 w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6 group-hover:scale-110 transition-transform shrink-0">
            <ShoppingBag className="h-5 w-5 md:h-7 md:w-7 text-white" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] md:tracking-[0.2em] mb-1 truncate">Produk Terjual</p>
          <h3 className="text-sm sm:text-2xl md:text-3xl font-black italic tracking-tighter truncate">
            {loading ? "..." : totals.qty} <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Item</span>
          </h3>
        </Card>
      </div>

      <Card className="border-none shadow-sm rounded-[3rem] bg-white overflow-hidden">
        <div className="p-10 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-900">
               Detail Penjualan: {appliedType === 'daily' ? appliedDate : appliedMonth}
             </h3>
             {!loading && filteredData.length > 0 && (
               <div className="px-3 py-1 rounded-full bg-amber-50 border border-amber-100 flex items-center gap-2">
                 <AlertCircle className="h-3 w-3 text-amber-600" />
                 <span className="text-[8px] font-black uppercase text-amber-700 tracking-wider">
                   Berdasarkan {filteredData.length} data closing
                 </span>
               </div>
             )}
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Database:</span>
             <span className="text-[10px] font-black text-primary">{loading ? "..." : productSummary.length} Item</span>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-10 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Produk</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Kategori</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Qty</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Total Pendapatan</th>
                <th className="px-10 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Keuntungan</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Menyusun Laporan...</p>
                    </div>
                  </td>
                </tr>
              ) : productSummary.length > 0 ? (
                productSummary.map((item: any) => (
                  <tr key={item.code} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-10 py-5">
                      <div className="inline-flex px-3 py-1 rounded-lg bg-primary/5 border border-primary/10 text-[10px] font-bold text-primary">
                        {item.code}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-sm font-black text-slate-900 uppercase italic tracking-tight">{item.name}</td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 whitespace-nowrap">
                        {item.kategori}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center text-sm font-black text-slate-600 tabular-nums">{item.total}</td>
                    <td className="px-8 py-5 text-right text-sm font-black text-slate-900 tabular-nums">Rp {item.pendapatan.toLocaleString('id-ID')}</td>
                    <td className="px-10 py-5 text-right text-sm font-black text-emerald-600 tabular-nums">Rp {item.keuntungan.toLocaleString('id-ID')}</td>
                    <td className="px-8 py-5 text-right text-sm font-black text-slate-700 tabular-nums">{item.margin.toFixed(1)}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <ShoppingBag className="h-16 w-16" />
                      <p className="text-xs font-black uppercase tracking-[0.3em]">Tidak ada transaksi untuk ditampilkan</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">Silakan pilih tanggal dan klik Tampilkan Data</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List Cards View */}
        <div className="md:hidden">
          {loading ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Menyusun Laporan...</p>
              </div>
            </div>
          ) : productSummary.length > 0 ? (
            <div className="p-4 space-y-4 bg-slate-50/30">
              {productSummary.map((item: any) => (
                <Card key={item.code} className="rounded-[1.5rem] bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow relative">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[8px] font-bold text-primary">
                          {item.code}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                          {item.kategori}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-slate-900 uppercase italic">
                        {item.name}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Terjual</span>
                      <span className="text-sm font-black text-slate-800 tabular-nums">
                        {item.total} <span className="text-[10px] text-slate-400 font-bold uppercase">Pcs</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100/60 text-center">
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Pendapatan</span>
                      <span className="text-[10px] font-black text-slate-900 tabular-nums">Rp {item.pendapatan.toLocaleString('id-ID')}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Keuntungan</span>
                      <span className="text-[10px] font-black text-emerald-600 tabular-nums">Rp {item.keuntungan.toLocaleString('id-ID')}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Margin</span>
                      <span className="text-[10px] font-black text-slate-700 tabular-nums">{item.margin.toFixed(1)}%</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-32 text-center">
              <div className="flex flex-col items-center gap-4 opacity-30">
                <ShoppingBag className="h-16 w-16" />
                <p className="text-xs font-black uppercase tracking-[0.3em]">Tidak ada transaksi</p>
                <p className="text-[9px] font-bold uppercase text-slate-400">Silakan pilih tanggal dan klik Tampilkan Data</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
