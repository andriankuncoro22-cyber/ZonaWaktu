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
  ClipboardCopy,
  ShoppingBag,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, query, orderBy, doc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  metodePembelian?: string;
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
  const [isWaDialogOpen, setIsWaDialogOpen] = useState(false);

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

  const getBulkOrderText = (metodeFilter: "Semua" | "Supliyer" | "Beli Sendiri" = "Semua") => {
    const activeList = activeTab === "kontainer" ? criticalKontainer : criticalGudang;
    const filteredList = activeList.filter(item => {
      if (metodeFilter === "Supliyer") return item.metodePembelian !== "Beli Sendiri";
      if (metodeFilter === "Beli Sendiri") return item.metodePembelian === "Beli Sendiri";
      return true;
    });

    if (filteredList.length === 0) return "";
    
    const list = filteredList.map(item => {
      const minStock = activeTab === "kontainer" ? getMinStockKontainer(item) : getMinStockGudang(item);
      const currentStock = activeTab === "kontainer" ? getKontainerTotal(item) : Number(item.qtyBesar || 0);
      const orderQty = Math.ceil(Math.max(0, minStock - currentStock));
      return `- ${item.nama} ${orderQty} ${item.satuanBesar || ""}`;
    }).join("\n");

    const sourceName = activeTab === "kontainer" ? "Area Kontainer" : "Gudang Utama";
    const labelMetode = metodeFilter === "Semua" ? "" : ` [Metode: ${metodeFilter}]`;
    return `Halo, saya ingin memesan bahan baku berikut untuk ${sourceName}${labelMetode}:\n${list}\n\nTerima kasih!`;
  };

  const handleBulkOrderSend = (metodeFilter: "Semua" | "Supliyer" | "Beli Sendiri") => {
    const text = getBulkOrderText(metodeFilter);
    if (!text) {
      toast({
        variant: "destructive",
        title: "Tidak Ada Data",
        description: `Tidak ada bahan baku kritis dengan metode ${metodeFilter} pada tab ini.`
      });
      return;
    }
    openWhatsApp(text);
    setIsWaDialogOpen(false);
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
        "Batas Minimum Kontainer": getMinStockKontainer(item),
        "Metode Pembelian": item.metodePembelian === "Beli Sendiri" ? "2. Beli Sendiri" : "1. Supliyer",
      }));
      const wsKontainer = XLSX.utils.json_to_sheet(wsKontainerData);
      XLSX.utils.book_append_sheet(wb, wsKontainer, "Kritis Kontainer");

      // Sheet 2: Gudang
      const wsGudangData = criticalGudang.map(item => ({
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Stok Gudang": item.qtyBesar || 0,
        "Satuan": item.satuanBesar,
        "Batas Minimum Gudang": getMinStockGudang(item),
        "Metode Pembelian": item.metodePembelian === "Beli Sendiri" ? "2. Beli Sendiri" : "1. Supliyer",
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
        getMinStockKontainer(item),
        item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"
      ]);

      autoTable(docPDF, {
        head: [["KODE", "NAMA BAHAN", "BULK", "SAT. B", "AKTIF", "SAT. K", "TOTAL", "MIN", "METODE"]],
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
        getMinStockGudang(item),
        item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"
      ]);

      autoTable(docPDF, {
        head: [["KODE", "NAMA BAHAN", "STOK GUDANG", "SATUAN", "MIN", "METODE"]],
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
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
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
            className="rounded-xl border-slate-200 px-3 h-10 md:h-11 font-black uppercase tracking-wider text-[9px] gap-2 bg-white hover:bg-slate-50 transition-all duration-300"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPDF}
            className="rounded-xl border-slate-200 px-3 h-10 md:h-11 font-black uppercase tracking-wider text-[9px] gap-2 bg-white hover:bg-slate-50 transition-all duration-300"
          >
            <FileDown className="h-4 w-4 text-rose-600" /> PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsWaDialogOpen(true)}
            className="rounded-xl border-emerald-200 bg-emerald-50 px-4 h-10 md:h-11 font-black uppercase tracking-wider text-[9px] gap-2 text-emerald-700 hover:bg-emerald-100 transition-all duration-300 shrink-0"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Order WA
          </Button>
        </div>
      </div>

      {/* WA Order Options Modal */}
      <Dialog open={isWaDialogOpen} onOpenChange={setIsWaDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] border-none p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-emerald-600" />
              Order Pesanan Kritis via WA
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 font-medium">
            Pilih kategori pengadaan bahan baku kritis pada tab <span className="font-bold text-slate-800">{activeTab === "kontainer" ? "Area Kontainer" : "Gudang Utama"}</span> yang ingin dikirimkan via WhatsApp:
          </p>
          
          <div className="grid gap-3 mt-4">
            <button
              onClick={() => handleBulkOrderSend("Supliyer")}
              className="flex items-center justify-between p-4 rounded-2xl border border-blue-100 bg-blue-50/50 hover:bg-blue-100/70 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-600 text-white group-hover:scale-105 transition-transform">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-blue-900">Bahan Supliyer</h4>
                  <p className="text-[10px] text-blue-600 font-bold">Kirim semua item kritis bermetode 1. Supliyer</p>
                </div>
              </div>
              <span className="text-xs font-black text-blue-700 bg-white px-2.5 py-1 rounded-lg shadow-sm">Pilih</span>
            </button>

            <button
              onClick={() => handleBulkOrderSend("Beli Sendiri")}
              className="flex items-center justify-between p-4 rounded-2xl border border-amber-100 bg-amber-50/50 hover:bg-amber-100/70 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-600 text-white group-hover:scale-105 transition-transform">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-amber-900">Bahan Beli Sendiri</h4>
                  <p className="text-[10px] text-amber-600 font-bold">Kirim semua item kritis bermetode 2. Beli Sendiri</p>
                </div>
              </div>
              <span className="text-xs font-black text-amber-700 bg-white px-2.5 py-1 rounded-lg shadow-sm">Pilih</span>
            </button>

            <button
              onClick={() => handleBulkOrderSend("Semua")}
              className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-800 text-white group-hover:scale-105 transition-transform">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-900">Semua Bahan Kritis</h4>
                  <p className="text-[10px] text-slate-500 font-bold">Kirim seluruh item kritis tanpa membedakan metode</p>
                </div>
              </div>
              <span className="text-xs font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg shadow-sm">Pilih</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card className="p-5 md:p-6 bg-gradient-to-br from-rose-50 to-rose-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-3 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-rose-900">
            <AlertTriangle className="h-24 w-24" />
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-700 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Bahan Kritis Total</p>
              <h3 className="text-2xl md:text-3xl font-black text-rose-700 mt-0.5">{loading ? "..." : totalUniqueCritical}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-5 md:p-6 bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-3 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-indigo-900">
            <Compass className="h-24 w-24" />
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-700 shrink-0">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Kritis di Kontainer</p>
              <h3 className="text-2xl md:text-3xl font-black text-indigo-700 mt-0.5">{loading ? "..." : criticalKontainer.length}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-5 md:p-6 bg-gradient-to-br from-amber-50 to-amber-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-3 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-amber-900">
            <Store className="h-24 w-24" />
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-700 shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Kritis di Gudang</p>
              <h3 className="text-2xl md:text-3xl font-black text-amber-700 mt-0.5">{loading ? "..." : criticalGudang.length}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs list */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 h-13 md:h-14 w-full max-w-md grid grid-cols-2 gap-2 mb-4 md:mb-6 mx-auto md:mx-0">
          <TabsTrigger 
            value="kontainer" 
            className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all duration-300"
          >
            Area Kontainer ({criticalKontainer.length})
          </TabsTrigger>
          <TabsTrigger 
            value="gudang" 
            className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all duration-300"
          >
            Gudang Utama ({criticalGudang.length})
          </TabsTrigger>
        </TabsList>

        <Card className="border-none shadow-sm rounded-2xl md:rounded-[2rem] bg-white overflow-hidden">
          {/* Search bar inside container */}
          <div className="p-3 md:p-4 border-b border-slate-50 flex items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari bahan kritis..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none placeholder:text-slate-400 focus:bg-slate-100 transition-colors"
              />
            </div>
            
            <div className="text-[9px] font-black uppercase tracking-wider text-rose-500 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg hidden sm:inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Stok Kritis Saja
            </div>
          </div>

          <div>
            {/* ────────── TAB 1: AREA KONTAINER ────────── */}
            <TabsContent value="kontainer" className="m-0">
              {loading ? (
                <div className="py-16 text-center">
                  <Loader2 className="h-7 w-7 animate-spin mx-auto text-rose-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">Memuat data kontainer...</p>
                </div>
              ) : filteredKontainer.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="h-14 w-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Semua Stok Aman</h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Tidak ada bahan baku di area kontainer yang kritis saat ini.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* DESKTOP TABLE VIEW (FITS 100% WIDTH WITHOUT HORIZONTAL SCROLL) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="pl-4 pr-1 py-3">Code</th>
                          <th className="px-1.5 py-3">Nama Bahan</th>
                          <th className="px-1.5 py-3 text-right">Qty Bulk</th>
                          <th className="px-1 py-3 text-center">Sat.B</th>
                          <th className="px-1.5 py-3 text-right">Qty Aktif</th>
                          <th className="px-1 py-3 text-center">Sat.K</th>
                          <th className="px-1.5 py-3 text-right">Total (Sat.B)</th>
                          <th className="px-1.5 py-3 text-center">Batas Min</th>
                          <th className="px-1 py-3 text-center">Status</th>
                          <th className="px-1 py-3 text-center">Metode Beli</th>
                          <th className="pr-4 pl-1 py-3 text-center">Order WA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredKontainer.map((item) => {
                          const minStock = getMinStockKontainer(item);
                          const totalStock = getKontainerTotal(item);
                          const waText = `${item.nama || ""} ${Math.ceil(Math.max(0, minStock - totalStock))} ${item.satuanBesar || ""}`;
                          return (
                            <tr key={item.id} className="hover:bg-rose-50/20 transition-colors">
                              <td className="pl-4 pr-1 py-2.5 font-bold text-[9px] text-slate-700 whitespace-nowrap">{item.code || "-"}</td>
                              <td className="px-1.5 py-2.5 font-bold text-slate-900 uppercase italic max-w-[140px] truncate" title={item.nama}>
                                {item.nama}
                              </td>
                              <td className="px-1.5 py-2.5 text-right font-black text-indigo-600 tabular-nums">{item.qtyKontainerBesar || 0}</td>
                              <td className="px-1 py-2.5 text-center text-[8px] font-bold text-indigo-400 uppercase whitespace-nowrap">{item.satuanBesar}</td>
                              <td className="px-1.5 py-2.5 text-right font-black text-emerald-600 tabular-nums">
                                {Math.round(item.qtyKontainerKecil || 0).toLocaleString('id-ID')}
                              </td>
                              <td className="px-1 py-2.5 text-center text-[8px] font-bold text-emerald-400 uppercase whitespace-nowrap">{item.satuanKecil}</td>
                              <td className="px-1.5 py-2.5 text-right font-black text-rose-600 tabular-nums">{totalStock.toFixed(2)}</td>
                              <td className="px-1.5 py-2.5 text-center font-bold text-slate-700 text-[10px] whitespace-nowrap">{minStock} {item.satuanBesar}</td>
                              <td className="px-1 py-2.5 text-center whitespace-nowrap">
                                <span className="inline-block rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[8px] font-black text-rose-600 uppercase">
                                  Kritis
                                </span>
                              </td>
                              <td className="px-1 py-2.5 text-center whitespace-nowrap">
                                <span className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[8px] font-bold tracking-tight",
                                  item.metodePembelian === "Beli Sendiri" 
                                    ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                )}>
                                  {item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"}
                                </span>
                              </td>
                              <td className="pr-4 pl-1 py-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(waText)}
                                    className="h-7 px-1.5 text-[8px] font-bold border border-slate-200 hover:bg-slate-50 gap-0.5"
                                    title="Copy format order"
                                  >
                                    <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openWhatsApp(waText)}
                                    className="h-7 px-1.5 text-[8px] font-bold border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 gap-0.5"
                                    title="Order WA"
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
                  </div>

                  {/* MOBILE CARD VIEW */}
                  <div className="block md:hidden divide-y divide-slate-100 p-4">
                    <div className="grid gap-3">
                      {filteredKontainer.map((item) => {
                        const minStock = getMinStockKontainer(item);
                        const totalStock = getKontainerTotal(item);
                        const waText = `${item.nama || ""} ${Math.ceil(Math.max(0, minStock - totalStock))} ${item.satuanBesar || ""}`;
                        return (
                          <div key={item.id} className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[9px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 tracking-wider uppercase">
                                  {item.code || "-"}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase italic mt-1 leading-tight">
                                  {item.nama}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[8px] font-black text-rose-600 uppercase">
                                  Kritis
                                </span>
                                <span className={cn(
                                  "rounded px-1.5 py-0.5 text-[8px] font-bold tracking-tight",
                                  item.metodePembelian === "Beli Sendiri" 
                                    ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                )}>
                                  {item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Qty Bulk</span>
                                <span className="font-black text-indigo-600 text-xs">{item.qtyKontainerBesar || 0} {item.satuanBesar}</span>
                              </div>
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Qty Aktif</span>
                                <span className="font-black text-emerald-600 text-xs">{Math.round(item.qtyKontainerKecil || 0)} {item.satuanKecil}</span>
                              </div>
                              <div className="pt-1.5 border-t border-slate-50">
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Total Qty</span>
                                <span className="font-black text-rose-600 text-xs">{totalStock.toFixed(2)} {item.satuanBesar}</span>
                              </div>
                              <div className="pt-1.5 border-t border-slate-50">
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Batas Min</span>
                                <span className="font-black text-slate-800 text-xs">{minStock} {item.satuanBesar}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(waText)}
                                className="w-1/2 h-8 text-[9px] font-bold border-slate-200 bg-white hover:bg-slate-50 gap-1 rounded-xl"
                              >
                                <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy Format
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openWhatsApp(waText)}
                                className="w-1/2 h-8 text-[9px] font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 gap-1 rounded-xl"
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" /> Order via WA
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ────────── TAB 2: GUDANG UTAMA ────────── */}
            <TabsContent value="gudang" className="m-0">
              {loading ? (
                <div className="py-16 text-center">
                  <Loader2 className="h-7 w-7 animate-spin mx-auto text-rose-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">Memuat data gudang...</p>
                </div>
              ) : filteredGudang.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="h-14 w-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Semua Stok Aman</h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Tidak ada bahan baku di gudang utama yang kritis saat ini.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* DESKTOP TABLE VIEW (FITS 100% WIDTH WITHOUT HORIZONTAL SCROLL) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="pl-4 pr-1 py-3">Code</th>
                          <th className="px-1.5 py-3">Nama Bahan</th>
                          <th className="px-1.5 py-3 text-right">Stok Gudang</th>
                          <th className="px-1.5 py-3 text-center">Batas Min</th>
                          <th className="px-1.5 py-3 text-center">Satuan</th>
                          <th className="px-1 py-3 text-center">Status</th>
                          <th className="px-1 py-3 text-center">Metode Beli</th>
                          <th className="pr-4 pl-1 py-3 text-center">Order WA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredGudang.map((item) => {
                          const minStock = getMinStockGudang(item);
                          const currentStock = Number(item.qtyBesar || 0);
                          const orderQty = Math.ceil(Math.max(0, minStock - currentStock));
                          const waText = `${item.nama || ""} ${orderQty} ${item.satuanBesar || ""}`;
                          return (
                            <tr key={item.id} className="hover:bg-rose-50/20 transition-colors">
                              <td className="pl-4 pr-1 py-2.5 font-bold text-[9px] text-slate-700 whitespace-nowrap">{item.code || "-"}</td>
                              <td className="px-1.5 py-2.5 font-bold text-slate-900 uppercase italic max-w-[160px] truncate" title={item.nama}>
                                {item.nama}
                              </td>
                              <td className="px-1.5 py-2.5 text-right font-black text-rose-600 tabular-nums italic text-sm">{item.qtyBesar || 0}</td>
                              <td className="px-1.5 py-2.5 text-center font-bold text-slate-700 text-[10px] whitespace-nowrap">{minStock}</td>
                              <td className="px-1.5 py-2.5 text-center text-[9px] font-black uppercase text-primary tracking-wider whitespace-nowrap">{item.satuanBesar}</td>
                              <td className="px-1 py-2.5 text-center whitespace-nowrap">
                                <span className="inline-block rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[8px] font-black text-rose-600 uppercase">
                                  Kritis
                                </span>
                              </td>
                              <td className="px-1 py-2.5 text-center whitespace-nowrap">
                                <span className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[8px] font-bold tracking-tight",
                                  item.metodePembelian === "Beli Sendiri" 
                                    ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                )}>
                                  {item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"}
                                </span>
                              </td>
                              <td className="pr-4 pl-1 py-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(waText)}
                                    className="h-7 px-1.5 text-[8px] font-bold border border-slate-200 hover:bg-slate-50 gap-0.5"
                                    title="Copy format order"
                                  >
                                    <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openWhatsApp(waText)}
                                    className="h-7 px-1.5 text-[8px] font-bold border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 gap-0.5"
                                    title="Order WA"
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
                  </div>

                  {/* MOBILE CARD VIEW */}
                  <div className="block md:hidden divide-y divide-slate-100 p-4">
                    <div className="grid gap-3">
                      {filteredGudang.map((item) => {
                        const minStock = getMinStockGudang(item);
                        const currentStock = Number(item.qtyBesar || 0);
                        const orderQty = Math.ceil(Math.max(0, minStock - currentStock));
                        const waText = `${item.nama || ""} ${orderQty} ${item.satuanBesar || ""}`;
                        return (
                          <div key={item.id} className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[9px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 tracking-wider uppercase">
                                  {item.code || "-"}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase italic mt-1 leading-tight">
                                  {item.nama}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[8px] font-black text-rose-600 uppercase">
                                  Kritis
                                </span>
                                <span className={cn(
                                  "rounded px-1.5 py-0.5 text-[8px] font-bold tracking-tight",
                                  item.metodePembelian === "Beli Sendiri" 
                                    ? "bg-amber-50 text-amber-700 border border-amber-200" 
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                )}>
                                  {item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Stok Gudang</span>
                                <span className="font-black text-rose-600 text-sm">{currentStock} {item.satuanBesar}</span>
                              </div>
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Batas Minimum</span>
                                <span className="font-black text-slate-800 text-sm">{minStock} {item.satuanBesar}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(waText)}
                                className="w-1/2 h-8 text-[9px] font-bold border-slate-200 bg-white hover:bg-slate-50 gap-1 rounded-xl"
                              >
                                <ClipboardCopy className="h-3 w-3 text-slate-500" /> Copy Format
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openWhatsApp(waText)}
                                className="w-1/2 h-8 text-[9px] font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 gap-1 rounded-xl"
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" /> Order via WA
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
