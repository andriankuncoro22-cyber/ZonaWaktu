"use client";

import React, { useState, useMemo } from "react";
import { 
  AlertTriangle, 
  Search, 
  FileDown,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  Store,
  Compass,
  MessageCircle,
  ClipboardCopy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, query, orderBy, doc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  qtyBesar?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  qtyKecil?: number;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyMinGudang?: number;
  qtyMinKontainer?: number;
  qtyMin?: number;
  [key: string]: unknown;
}
export default function RekapanStockKritisPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("kontainer");

  const materialsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("code", "asc")), 
    [db]
  );
  
  const { data: materials, loading } = useCollection(materialsQuery);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const getMinStockGudang = (item: BahanBaku) => Number(item.qtyMinGudang ?? item.qtyMin ?? 5);
  const getMinStockKontainer = (item: BahanBaku) => Number(item.qtyMinKontainer ?? item.qtyMin ?? 5);
  
  const getKontainerTotal = (item: BahanBaku) => {
    const qtyBulk = Number(item.qtyKontainerBesar || 0);
    const qtyAktif = Number(item.qtyKontainerKecil || 0);
    const konversi = Number(item.qtyKecil || 1);
    return qtyBulk + (qtyAktif / (konversi || 1));
  };

  const criticalGudang = useMemo(() => {
    if (!materials) return [];
    return (materials as BahanBaku[]).filter(item => {
      const minStock = getMinStockGudang(item);
      const stock = Number(item.qtyBesar || 0);
      return stock <= minStock;
    });
  }, [materials]);

  const criticalKontainer = useMemo(() => {
    if (!materials) return [];
    return (materials as BahanBaku[]).filter(item => {
      const minStock = getMinStockKontainer(item);
      const total = getKontainerTotal(item);
      return total <= minStock;
    });
  }, [materials]);

  const filteredGudang = useMemo(() => {
    return criticalGudang.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [criticalGudang, searchTerm]);

  const filteredKontainer = useMemo(() => {
    return criticalKontainer.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [criticalKontainer, searchTerm]);

  const totalUniqueCritical = useMemo(() => {
    const ids = new Set([
      ...criticalGudang.map(item => item.id),
      ...criticalKontainer.map(item => item.id)
    ]);
    return ids.size;
  }, [criticalGudang, criticalKontainer]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Pesanan Disalin",
      description: `"${text}" telah disalin ke clipboard.`,
    });
  };

  const openWhatsApp = (text: string) => {
    navigator.clipboard.writeText(text);
    const encodedText = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, "_blank");
    toast({
      title: "Membuka WhatsApp",
      description: "Pesanan disalin ke clipboard dan mengarahkan ke WhatsApp.",
    });
  };

  const getBulkOrderText = () => {
    const activeList = activeTab === "kontainer" ? criticalKontainer : criticalGudang;
    if (activeList.length === 0) return "";
    
    const list = activeList.map(item => {
      const minStock = activeTab === "kontainer" ? getMinStockKontainer(item) : getMinStockGudang(item);
      const currentStock = activeTab === "kontainer" ? getKontainerTotal(item) : Number(item.qtyBesar || 0);
      const orderQty = Math.ceil(Math.max(0, minStock - currentStock));
      return `- ${item.nama} ${orderQty} ${item.satuanBesar}`;
    }).join("\n");

    const sourceName = activeTab === "kontainer" ? "Area Kontainer" : "Gudang Utama";
    return `Halo, saya ingin memesan bahan baku berikut untuk ${sourceName}:\n${list}\n\nTerima kasih!`;
  };

  const handleBulkWhatsApp = () => {
    const text = getBulkOrderText();
    if (!text) {
      toast({
        variant: "destructive",
        title: "Tidak Ada Data",
        description: "Tidak ada bahan baku kritis di tab ini untuk dipesan."
      });
      return;
    }
    openWhatsApp(text);
  };

  const handleExportExcel = () => {
    if (criticalGudang.length === 0 && criticalKontainer.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak Ada Data",
        description: "Tidak ada bahan baku kritis untuk diekspor ke Excel."
      });
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Kontainer
      const wsKontainerData = criticalKontainer.map(item => ({
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Qty Bulk (Satuan Besar)": item.qtyKontainerBesar || 0,
        "Satuan Besar": item.satuanBesar,
        "Qty Aktif (Satuan Kecil)": item.qtyKontainerKecil || 0,
        "Satuan Kecil": item.satuanKecil,
        "Total Kontainer (Satuan Besar)": Number(getKontainerTotal(item).toFixed(4)),
        "Batas Minimum Kontainer": getMinStockKontainer(item)
      }));
      const wsKontainer = XLSX.utils.json_to_sheet(wsKontainerData);
      XLSX.utils.book_append_sheet(wb, wsKontainer, "Kritis Kontainer");

      // Sheet 2: Gudang
      const wsGudangData = criticalGudang.map(item => ({
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Stok Gudang": item.qtyBesar || 0,
        "Satuan": item.satuanBesar,
        "Batas Minimum Gudang": getMinStockGudang(item)
      }));
      const wsGudang = XLSX.utils.json_to_sheet(wsGudangData);
      XLSX.utils.book_append_sheet(wb, wsGudang, "Kritis Gudang");

      XLSX.writeFile(wb, `Laporan_Stok_Kritis_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({
        title: "Berhasil Diekspor",
        description: "Data stok kritis berhasil diunduh sebagai file Excel."
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Ekspor Gagal",
        description: "Terjadi kesalahan saat mengekspor ke Excel."
      });
    }
  };

  const handleExportPDF = async () => {
    if (criticalGudang.length === 0 && criticalKontainer.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak Ada Data",
        description: "Tidak ada bahan baku kritis untuk diekspor ke PDF."
      });
      return;
    }

    try {
      const docPDF = new jsPDF();
      
      // Header Kop Surat
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
      docPDF.setFont("helvetica", "bold");
      docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 105, 16, { align: 'center' });
      docPDF.setFontSize(9);
      docPDF.setTextColor(100);
      docPDF.setFont("helvetica", "normal");
      docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 105, 22, { align: 'center' });
      docPDF.setDrawColor(139, 26, 26);
      docPDF.setLineWidth(0.5);
      docPDF.line(15, 28, 195, 28);
      
      docPDF.setFontSize(14);
      docPDF.setTextColor(40);
      docPDF.setFont("helvetica", "bold");
      docPDF.text("LAPORAN REKAPAN STOK KRITIS", 105, 38, { align: 'center' });
      docPDF.setFontSize(9);
      docPDF.setTextColor(120);
      docPDF.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 105, 43, { align: 'center' });

      // Table 1: Area Kontainer
      docPDF.setFontSize(11);
      docPDF.setTextColor(139, 26, 26);
      docPDF.setFont("helvetica", "bold");
      docPDF.text("1. DETAIL AREA KONTAINER", 15, 52);
      
      const containerTableData = criticalKontainer.map(item => [
        item.code || "",
        item.nama || "",
        item.qtyKontainerBesar || 0,
        item.satuanBesar || "",
        item.qtyKontainerKecil || 0,
        item.satuanKecil || "",
        getKontainerTotal(item).toFixed(2),
        getMinStockKontainer(item)
      ]);

      autoTable(docPDF, {
        head: [["KODE", "NAMA BAHAN", "BULK", "SAT. B", "AKTIF", "SAT. K", "TOTAL (SAT. B)", "MIN STOK"]],
        body: containerTableData,
        startY: 56,
        theme: 'grid',
        headStyles: { fillColor: [139, 26, 26] },
        styles: { fontSize: 8 }
      });

      // Table 2: Gudang Utama
      const finalY = (docPDF as any).lastAutoTable.finalY || 100; // eslint-disable-line @typescript-eslint/no-explicit-any
      
      docPDF.setFontSize(11);
      docPDF.setTextColor(139, 26, 26);
      docPDF.setFont("helvetica", "bold");
      docPDF.text("2. DETAIL GUDANG UTAMA", 15, finalY + 12);

      const warehouseTableData = criticalGudang.map(item => [
        item.code || "",
        item.nama || "",
        item.qtyBesar || 0,
        item.satuanBesar || "",
        getMinStockGudang(item)
      ]);

      autoTable(docPDF, {
        head: [["KODE", "NAMA BAHAN", "STOK GUDANG", "SATUAN", "MIN STOK"]],
        body: warehouseTableData,
        startY: finalY + 16,
        theme: 'grid',
        headStyles: { fillColor: [139, 26, 26] },
        styles: { fontSize: 8 }
      });

      docPDF.save(`Laporan_Stok_Kritis_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({
        title: "Berhasil Diekspor",
        description: "Laporan stok kritis berhasil diunduh sebagai file PDF."
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Ekspor Gagal",
        description: "Terjadi kesalahan saat mengekspor ke PDF."
      });
    }
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest">Peringatan Stok Kritis</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-2">
            Rekapan Stock Kritis
          </h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Bahan Baku Di Bawah Batas Minimum
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            className="rounded-xl border-slate-200 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 bg-white hover:bg-slate-50 transition-all duration-300"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPDF}
            className="rounded-xl border-slate-200 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 bg-white hover:bg-slate-50 transition-all duration-300"
          >
            <FileDown className="h-4 w-4 text-rose-600" /> PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBulkWhatsApp}
            className="rounded-xl border-emerald-200 bg-emerald-50 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 text-emerald-700 hover:bg-emerald-100 transition-all duration-300 shrink-0"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Order Semua via WA
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="p-6 md:p-8 bg-gradient-to-br from-rose-50 to-rose-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-rose-900">
            <AlertTriangle className="h-32 w-32" />
          </div>
          <div className="space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bahan Kritis Total</p>
              <h3 className="text-3xl md:text-4xl font-black text-rose-700 mt-1">{loading ? "..." : totalUniqueCritical}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-indigo-900">
            <Compass className="h-32 w-32" />
          </div>
          <div className="space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-700">
              <Compass className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kritis di Kontainer</p>
              <h3 className="text-3xl md:text-4xl font-black text-indigo-700 mt-1">{loading ? "..." : criticalKontainer.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-6 md:p-8 bg-gradient-to-br from-amber-50 to-amber-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-amber-900">
            <Store className="h-32 w-32" />
          </div>
          <div className="space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-700">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Kritis di Gudang</p>
              <h3 className="text-3xl md:text-4xl font-black text-amber-700 mt-1">{loading ? "..." : criticalGudang.length}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs list with Kontainer first, Gudang second */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white p-1.5 md:p-2 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 h-14 md:h-16 w-full max-w-md grid grid-cols-2 gap-2 mb-6 md:mb-8 mx-auto md:mx-0">
          <TabsTrigger 
            value="kontainer" 
            className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all duration-300"
          >
            Area Kontainer ({criticalKontainer.length})
          </TabsTrigger>
          <TabsTrigger 
            value="gudang" 
            className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all duration-300"
          >
            Gudang Utama ({criticalGudang.length})
          </TabsTrigger>
        </TabsList>

        <Card className="border-none shadow-sm rounded-3xl md:rounded-[3rem] bg-white overflow-hidden">
          {/* Search bar inside container */}
          <div className="p-4 md:p-8 border-b border-slate-50 flex items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari bahan kritis..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] md:text-xs font-bold outline-none placeholder:text-slate-400 focus:bg-slate-100 transition-colors"
              />
            </div>
            
            <div className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl hidden sm:inline-flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5" />
              Menampilkan stok kritis saja
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            {/* Tab 1 Content: Area Kontainer */}
            <TabsContent value="kontainer" className="m-0 min-w-[900px] md:min-w-full">
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-rose-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4">Memuat data kontainer...</p>
                </div>
              ) : filteredKontainer.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Semua Stok Aman</h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Tidak ada bahan baku di area kontainer yang kritis saat ini.</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Bulk</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Besar</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Aktif</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Kecil</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Total Qty (Sat. B)</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Batas Minimum</th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Status</th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Pesan WA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredKontainer.map((item) => {
                      const minStock = getMinStockKontainer(item);
                      const totalStock = getKontainerTotal(item);
                      const waText = `${item.nama || ""} ${Math.ceil(Math.max(0, minStock - totalStock))} ${item.satuanBesar || ""}`;
                      return (
                        <tr key={item.id} className="hover:bg-rose-50/20 transition-colors duration-200">
                          <td className="px-6 md:px-10 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-indigo-600 tabular-nums italic text-xl">{(item.qtyKontainerBesar || 0)}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-indigo-400 tracking-wider">{item.satuanBesar}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-emerald-600 tabular-nums italic text-xl">
                            {Math.round(item.qtyKontainerKecil || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-emerald-400 tracking-wider">{item.satuanKecil}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-rose-600 tabular-nums italic text-xl">{totalStock.toFixed(2)}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-center text-xs font-black text-slate-600">{minStock} {item.satuanBesar}</td>
                          <td className="px-6 md:px-10 py-4 md:py-6 text-center">
                            <span className="inline-flex items-center justify-center rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600">
                              Kritis
                            </span>
                          </td>
                          <td className="px-6 md:px-10 py-4 md:py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(waText)}
                                className="h-8 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider border-slate-200 hover:bg-slate-50 gap-1 bg-white"
                                title="Salin format pesanan"
                              >
                                <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openWhatsApp(waText)}
                                className="h-8 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider border-emerald-200 text-emerald-600 hover:bg-emerald-100 bg-emerald-50/50 gap-1"
                                title="Pesan via WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" /> WA
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TabsContent>

            {/* Tab 2 Content: Gudang Utama */}
            <TabsContent value="gudang" className="m-0 min-w-[700px] md:min-w-full">
              {loading ? (
                <div className="py-20 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-rose-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4">Memuat data gudang...</p>
                </div>
              ) : filteredGudang.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Semua Stok Aman</h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Tidak ada bahan baku di gudang utama yang kritis saat ini.</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Stok Gudang</th>
                      <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Batas Minimum</th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Satuan</th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Status</th>
                      <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Pesan WA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredGudang.map((item) => {
                      const minStock = getMinStockGudang(item);
                      const currentStock = Number(item.qtyBesar || 0);
                      const orderQty = Math.ceil(Math.max(0, minStock - currentStock));
                      const waText = `${item.nama || ""} ${orderQty} ${item.satuanBesar || ""}`;
                      return (
                        <tr key={item.id} className="hover:bg-rose-50/20 transition-colors duration-200">
                          <td className="px-6 md:px-10 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-rose-600 tabular-nums italic text-xl md:text-2xl">{(item.qtyBesar || 0)}</td>
                          <td className="px-4 md:px-8 py-4 md:py-6 text-center text-xs font-black text-slate-600">{minStock}</td>
                          <td className="px-6 md:px-10 py-4 md:py-6 text-center text-[9px] md:text-[10px] font-black uppercase text-primary tracking-widest">{item.satuanBesar}</td>
                          <td className="px-6 md:px-10 py-4 md:py-6 text-center">
                            <span className="inline-flex items-center justify-center rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600">
                              Kritis
                            </span>
                          </td>
                          <td className="px-6 md:px-10 py-4 md:py-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(waText)}
                                className="h-8 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider border-slate-200 hover:bg-slate-50 gap-1 bg-white"
                                title="Salin format pesanan"
                              >
                                <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openWhatsApp(waText)}
                                className="h-8 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider border-emerald-200 text-emerald-600 hover:bg-emerald-100 bg-emerald-50/50 gap-1"
                                title="Pesan via WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" /> WA
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </TabsContent>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
