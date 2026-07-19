"use client";

import React, { useState } from "react";
import { 
  Boxes, 
  Search, 
  RefreshCcw,
  ArrowRightLeft,
  Loader2,
  Save,
  FileDown,
  FileSpreadsheet,
  Edit2,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, query, orderBy, doc, writeBatch, increment, updateDoc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  qtyBesar?: number;
  qtyGudangKecil?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  qtyKecil?: number;
  satuanBesar?: string;
  satuanKecil?: string;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  qtyMinGudang?: number;
  qtyMinKontainer?: number;
  qtyMin?: number;
  [key: string]: unknown;
}

export default function StokBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  const [transferData, setTransferData] = useState({
    materialId: "",
    qty: 0
  });

  const [editingItem, setEditingItem] = useState<BahanBaku | null>(null);

  const materialsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("code", "asc")), 
    [db]
  );
  
  const { data: materials, loading } = useCollection(materialsQuery);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const filteredMaterials = (materials as BahanBaku[])?.filter(item => 
    item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMinStockGudang = (item: BahanBaku) => Number(item.qtyMinGudang ?? item.qtyMin ?? 5);
  const getMinStockKontainer = (item: BahanBaku) => Number(item.qtyMinKontainer ?? item.qtyMin ?? 5);
  
  const getGudangTotal = (item: BahanBaku) => {
    const qtyBulk = Math.floor(Number(item.qtyBesar || 0));
    const qtyKecil = Number(item.qtyGudangKecil || 0);
    const konversi = Number(item.qtyKecil || 1);
    return qtyBulk + (qtyKecil / (konversi || 1));
  };

  const getKontainerTotal = (item: BahanBaku) => {
    const qtyBulk = Math.floor(Number(item.qtyKontainerBesar || 0));
    const qtyAktif = Number(item.qtyKontainerKecil || 0);
    const konversi = Number(item.qtyKecil || 1);
    return qtyBulk + (qtyAktif / (konversi || 1));
  };

  const getStatusLabel = (value: number, threshold: number) => {
    const isCritical = value <= threshold;
    return {
      label: isCritical ? "Kritis" : "Aman",
      color: isCritical ? "text-rose-600 bg-rose-50 border-rose-100" : "text-emerald-700 bg-emerald-50 border-emerald-100"
    };
  };

  const handleResetAllStock = async () => {
    if (!confirm("Semua stok bahan baku akan diatur menjadi 0. Lanjutkan?")) return;

    setResetting(true);
    try {
      const batch = writeBatch(db);
      (materials as BahanBaku[] || []).forEach((item) => {
        const ref = doc(db, "bahan-baku", item.id);
        batch.update(ref, {
          qtyBesar: 0,
          qtyGudangKecil: 0,
          qtyKontainerBesar: 0,
          qtyKontainerKecil: 0,
        });
      });

      await batch.commit();
      toast({
        title: "Semua Stok Dikosongkan",
        description: "Seluruh stok gudang dan kontainer telah diatur menjadi 0.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal Mengosongkan Stok",
        description: "Terjadi kesalahan sistem.",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const transferQty = Math.floor(Number(transferData.qty || 0));
    if (!transferData.materialId || transferQty <= 0) return;

    setTransferring(true);
    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "bahan-baku", transferData.materialId);
      const material = (materials as BahanBaku[]).find(m => m.id === transferData.materialId);

      if (!material || Math.floor(Number(material.qtyBesar || 0)) < transferQty) {
        throw new Error(`Stok gudang (${material?.satuanBesar || ""}) tidak mencukupi`);
      }

      batch.update(materialRef, {
        qtyBesar: increment(-transferQty),
        qtyKontainerBesar: increment(transferQty)
      });

      await batch.commit();
      toast({
        title: "Transfer Berhasil",
        description: `${transferQty} ${material.satuanBesar} dipindahkan ke Area Kontainer.`
      });
      setIsTransferOpen(false);
      setTransferData({ materialId: "", qty: 0 });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Terjadi kesalahan sistem.";
      toast({
        variant: "destructive",
        title: "Gagal Transfer",
        description: errorMsg
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setUpdating(true);
    try {
      const materialRef = doc(db, "bahan-baku", editingItem.id);
      const conversionRate = Number(editingItem.qtyKecil || 1);
      
      // Pastikan qtyBesar & qtyKontainerBesar selalu bulat, sisa desimal dipindahkan ke qtyGudangKecil / qtyKontainerKecil
      const rawGudangBesar = Number(editingItem.qtyBesar || 0);
      const intGudangBesar = Math.floor(rawGudangBesar);
      const gudangDecimalRemainder = (rawGudangBesar - intGudangBesar) * conversionRate;

      const rawKontainerBesar = Number(editingItem.qtyKontainerBesar || 0);
      const intKontainerBesar = Math.floor(rawKontainerBesar);
      const kontainerDecimalRemainder = (rawKontainerBesar - intKontainerBesar) * conversionRate;

      const currentGudangSmall = Number(editingItem.qtyGudangKecil || 0);
      const finalGudangSmall = Math.round((currentGudangSmall + gudangDecimalRemainder) * 100) / 100;

      const currentKontainerSmall = Number(editingItem.qtyKontainerKecil || 0);
      const finalKontainerSmall = Math.round((currentKontainerSmall + kontainerDecimalRemainder) * 100) / 100;

      await updateDoc(materialRef, {
        qtyBesar: intGudangBesar,
        qtyGudangKecil: finalGudangSmall,
        qtyKontainerBesar: intKontainerBesar,
        qtyKontainerKecil: finalKontainerSmall,
        qtyMin: Number(editingItem.qtyMinGudang ?? editingItem.qtyMin ?? 5),
        qtyMinGudang: Number(editingItem.qtyMinGudang ?? editingItem.qtyMin ?? 5),
        qtyMinKontainer: Number(editingItem.qtyMinKontainer ?? editingItem.qtyMin ?? 5)
      });
      
      toast({ 
        title: "Stok Diperbarui", 
        description: "Satuan besar dibulatkan & sisa desimal otomatis dimigrasikan ke Satuan Kecil Gudang/Kontainer." 
      });
      setIsEditOpen(false);
      setEditingItem(null);
    } catch {
      toast({ variant: "destructive", title: "Gagal Update", description: "Terjadi kesalahan sistem." });
    } finally {
      setUpdating(false);
    }
  };

  const handleExportExcel = () => {
    const wsData = filteredMaterials.map(item => ({
      "Kode": item.code,
      "Nama Bahan": item.nama,
      "Stok Gudang (Besar)": Math.floor(Number(item.qtyBesar || 0)),
      "Satuan Besar": item.satuanBesar,
      "Stok Gudang (Kecil)": Math.round(Number(item.qtyGudangKecil || 0)),
      "Satuan Kecil": item.satuanKecil,
      "Min Stok Gudang": getMinStockGudang(item),
      "Qty Bulk Kontainer": Math.floor(Number(item.qtyKontainerBesar || 0)),
      "Qty Aktif Kontainer": Math.round(Number(item.qtyKontainerKecil || 0)),
      "Min Stok Kontainer": getMinStockKontainer(item),
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Bahan Baku");
    XLSX.writeFile(wb, "Monitoring_Stok_Zona_Waktu.xlsx");
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF();
    
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
    
    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text("LAPORAN MONITORING STOK", 105, 40, { align: 'center' });
    
    const tableData = filteredMaterials.map(item => [
      item.code,
      item.nama,
      Math.floor(Number(item.qtyBesar || 0)),
      item.satuanBesar,
      Math.round(Number(item.qtyGudangKecil || 0)),
      item.satuanKecil,
      Math.floor(Number(item.qtyKontainerBesar || 0)),
      Math.round(Number(item.qtyKontainerKecil || 0)),
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG (B)", "SAT B", "GUDANG (K)", "SAT K", "BULK KONTAINER", "AKTIF KONTAINER"]],
      body: tableData,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [139, 26, 26] },
      styles: { fontSize: 8 }
    });

    docPDF.save("Monitoring_Stok_Zona_Waktu.pdf");
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Monitoring Stok</h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Gudang Utama & Area Kontainer (Satuan Besar & Satuan Kecil)
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            className="rounded-xl border-slate-200 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPDF}
            className="rounded-xl border-slate-200 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
          >
            <FileDown className="h-4 w-4 text-primary" /> PDF
          </Button>
          <Button
            variant="outline"
            onClick={handleResetAllStock}
            disabled={resetting}
            className="rounded-xl border-rose-200 bg-rose-50 px-4 h-12 font-black uppercase tracking-widest text-[9px] gap-2 text-rose-600 hover:bg-rose-100"
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Hapus Semua Stok
          </Button>
          <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
            <DialogTrigger asChild>
              <Button className="flex-1 md:flex-initial rounded-xl md:rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 font-black uppercase tracking-widest text-[10px] gap-2 shadow-xl shrink-0">
                <ArrowRightLeft className="h-4 w-4 shrink-0" />
                <span>Pindahkan ke Kontainer</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-6 md:p-10 max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-black uppercase italic text-slate-900">
                  Keluarkan Stok Gudang
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleTransfer} className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Pilih Bahan Baku</Label>
                  <Select 
                    value={transferData.materialId} 
                    onValueChange={(val) => setTransferData({...transferData, materialId: val})}
                  >
                    <SelectTrigger className="rounded-xl h-12 font-bold bg-slate-50 border-none">
                      <SelectValue placeholder="Pilih bahan..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-xl">
                      {materials?.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="rounded-lg">
                          {m.code} - {m.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Jumlah (Satuan Besar)</Label>
                  <Input 
                    type="number" 
                    value={transferData.qty}
                    onChange={(e) => setTransferData({...transferData, qty: Math.floor(Number(e.target.value))})}
                    className="rounded-xl h-12 bg-slate-50 border-none font-black"
                  />
                </div>

                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 text-center">
                   <p className="text-[8px] md:text-[9px] font-bold text-primary uppercase tracking-widest">
                     Stok akan dipindahkan ke Area Kontainer sebagai Qty Bulk.
                   </p>
                </div>

                <Button 
                  disabled={transferring || !transferData.materialId}
                  className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px]"
                >
                  {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Proses Transfer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="kontainer" className="w-full">
        <TabsList className="bg-white p-1.5 md:p-2 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 h-14 md:h-16 w-full max-w-md grid grid-cols-2 gap-2 mb-6 md:mb-8 mx-auto md:mx-0">
          <TabsTrigger value="kontainer" className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            Area Kontainer
          </TabsTrigger>
          <TabsTrigger value="gudang" className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            Gudang Utama
          </TabsTrigger>
        </TabsList>

        <Card className="border-none shadow-sm rounded-3xl md:rounded-[3rem] bg-white overflow-hidden">
          <div className="p-4 md:p-8 border-b border-slate-50">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari bahan..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] md:text-xs font-bold outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            {/* TAB GUDANG UTAMA */}
            <TabsContent value="gudang" className="m-0 min-w-0 lg:min-w-[850px] md:min-w-full">
              {/* Desktop Table View */}
              <table className="hidden lg:table w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Stok Gudang (Besar)</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Besar</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-amber-600 text-right">Stok Kecil Gudang</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-amber-600 text-center">Sat. Kecil</th>
                    <th className="px-4 md:px-6 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Estimasi Kritis</th>
                    <th className="px-6 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={8} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></td></tr>
                  ) : filteredMaterials?.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-8 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                      <td className="px-4 md:px-6 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                      
                      {/* Stok Gudang Satuan Besar */}
                      <td className="px-4 md:px-6 py-4 md:py-6 text-right font-black text-primary tabular-nums italic text-xl md:text-2xl">
                        {Math.floor(Number(item.qtyBesar || 0))}
                      </td>
                      <td className="px-4 md:px-6 py-4 md:py-6 text-center text-[9px] md:text-[10px] font-black uppercase text-primary tracking-widest">
                        {item.satuanBesar}
                      </td>

                      {/* Stok Gudang Satuan Kecil (Hasil sisa belanja Beli Sendiri) */}
                      <td className="px-4 md:px-6 py-4 md:py-6 text-right font-black text-amber-600 tabular-nums italic text-xl md:text-2xl">
                        {Math.round(Number(item.qtyGudangKecil || 0)).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 md:px-6 py-4 md:py-6 text-center text-[9px] md:text-[10px] font-black uppercase text-amber-600 tracking-widest">
                        {item.satuanKecil}
                      </td>

                      {/* Estimasi Kritis Gudang */}
                      {(() => {
                        const minStock = getMinStockGudang(item);
                        const totalGudang = getGudangTotal(item);
                        const status = getStatusLabel(totalGudang, minStock);
                        return (
                          <td className="px-4 md:px-6 py-4 md:py-6 text-center">
                            <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${status.color}`}>
                              {status.label} ({minStock})
                            </span>
                          </td>
                        );
                      })()}
                      <td className="px-6 md:px-8 py-4 md:py-6 text-right">
                         <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsEditOpen(true); }} className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary">
                           <Edit2 className="h-4 w-4" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Cards View */}
              <div className="lg:hidden p-3 grid grid-cols-2 gap-2 sm:gap-3 bg-slate-50/20">
                {loading ? (
                  <div className="col-span-2 py-20 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  </div>
                ) : filteredMaterials?.map((item) => {
                  const minStock = getMinStockGudang(item);
                  const totalGudang = getGudangTotal(item);
                  const status = getStatusLabel(totalGudang, minStock);

                  return (
                    <Card key={item.id} className="relative rounded-2xl bg-white border border-slate-100 p-3 sm:p-4 flex flex-col justify-between space-y-3 shadow-sm overflow-hidden min-h-[145px]">
                      {/* Edit Button absolute top-2 right-2 */}
                      <button 
                        type="button"
                        onClick={() => { setEditingItem(item); setIsEditOpen(true); }} 
                        className="absolute top-2 right-2 h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>

                      <div className="space-y-1">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">
                          {item.code || "-"}
                        </span>
                        <h4 className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase italic line-clamp-2 leading-tight pr-6">
                          {item.nama}
                        </h4>
                      </div>

                      <div className="space-y-1 pt-1.5 border-t border-slate-100/60">
                        {/* Stok Besar */}
                        <div className="flex items-center justify-between text-[9px] sm:text-[10px] leading-none">
                          <span className="text-slate-400 font-bold">Besar</span>
                          <span className="font-black text-primary italic">
                            {Math.floor(Number(item.qtyBesar || 0))} <span className="text-[7px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-widest">{item.satuanBesar}</span>
                          </span>
                        </div>

                        {/* Stok Kecil */}
                        <div className="flex items-center justify-between text-[9px] sm:text-[10px] leading-none">
                          <span className="text-slate-400 font-bold">Kecil</span>
                          <span className="font-black text-amber-600 italic">
                            {Math.round(Number(item.qtyGudangKecil || 0)).toLocaleString('id-ID')} <span className="text-[7px] sm:text-[8px] font-bold text-amber-500 uppercase tracking-widest">{item.satuanKecil}</span>
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="pt-0.5 flex">
                        <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${status.color} w-full text-center`}>
                          {status.label} ({minStock})
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* TAB AREA KONTAINER */}
            <TabsContent value="kontainer" className="m-0 min-w-0 lg:min-w-[900px] md:min-w-full">
              {/* Desktop Table View */}
              <table className="hidden lg:table w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Bulk</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Besar</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Aktif</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Kecil</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Estimasi Kritis</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMaterials?.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-10 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-indigo-600 tabular-nums italic text-xl md:text-2xl">{Math.floor(Number(item.qtyKontainerBesar || 0))}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-indigo-400">{item.satuanBesar}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-emerald-600 tabular-nums italic text-xl md:text-2xl">
                        {Math.round(item.qtyKontainerKecil || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 md:px-10 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-emerald-400">{item.satuanKecil}</td>
                      {(() => {
                        const minStock = getMinStockKontainer(item);
                        const totals = getKontainerTotal(item);
                        const status = getStatusLabel(totals, minStock);
                        return (
                          <td className="px-4 md:px-8 py-4 md:py-6 text-center">
                            <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${status.color}`}>
                              {status.label} ({minStock})
                            </span>
                          </td>
                        );
                      })()}
                      <td className="px-6 md:px-10 py-4 md:py-6 text-right">
                         <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsEditOpen(true); }} className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary">
                           <Edit2 className="h-4 w-4" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Cards View */}
              <div className="lg:hidden p-3 grid grid-cols-2 gap-2 sm:gap-3 bg-slate-50/20">
                {loading ? (
                  <div className="col-span-2 py-20 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  </div>
                ) : filteredMaterials?.map((item) => {
                  const minStock = getMinStockKontainer(item);
                  const totals = getKontainerTotal(item);
                  const status = getStatusLabel(totals, minStock);

                  return (
                    <Card key={item.id} className="relative rounded-2xl bg-white border border-slate-100 p-3 sm:p-4 flex flex-col justify-between space-y-3 shadow-sm overflow-hidden min-h-[145px]">
                      {/* Edit Button absolute top-2 right-2 */}
                      <button 
                        type="button"
                        onClick={() => { setEditingItem(item); setIsEditOpen(true); }} 
                        className="absolute top-2 right-2 h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>

                      <div className="space-y-1">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">
                          {item.code || "-"}
                        </span>
                        <h4 className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase italic line-clamp-2 leading-tight pr-6">
                          {item.nama}
                        </h4>
                      </div>

                      <div className="space-y-1 pt-1.5 border-t border-slate-100/60">
                        {/* Qty Bulk */}
                        <div className="flex items-center justify-between text-[9px] sm:text-[10px] leading-none">
                          <span className="text-slate-400 font-bold">Bulk</span>
                          <span className="font-black text-indigo-600 italic">
                            {Math.floor(Number(item.qtyKontainerBesar || 0))} <span className="text-[7px] sm:text-[8px] font-bold text-indigo-400 uppercase tracking-widest">{item.satuanBesar}</span>
                          </span>
                        </div>

                        {/* Qty Aktif */}
                        <div className="flex items-center justify-between text-[9px] sm:text-[10px] leading-none">
                          <span className="text-slate-400 font-bold">Aktif</span>
                          <span className="font-black text-emerald-600 italic">
                            {Math.round(item.qtyKontainerKecil || 0).toLocaleString('id-ID')} <span className="text-[7px] sm:text-[8px] font-bold text-emerald-500 uppercase tracking-widest">{item.satuanKecil}</span>
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="pt-0.5 flex">
                        <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${status.color} w-full text-center`}>
                          {status.label} ({minStock})
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </div>
        </Card>
      </Tabs>

      {/* DIALOG EDIT STOK */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-6 md:p-10 max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-black uppercase italic text-slate-900">
              Edit Rincian Stok
            </DialogTitle>
          </DialogHeader>
          {editingItem && (
            <form onSubmit={handleUpdateStock} className="space-y-6 mt-6">
              <div className="p-4 bg-slate-50 rounded-2xl mb-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{editingItem.code}</p>
                 <h4 className="text-lg font-black text-slate-900 uppercase italic leading-none mt-1">{editingItem.nama}</h4>
              </div>

              <div className="space-y-4">
                {/* Gudang Utama */}
                <div className="space-y-2 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] font-black uppercase text-primary tracking-widest">Gudang Utama</p>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-black uppercase text-slate-500">Stok Besar ({editingItem.satuanBesar})</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={editingItem.qtyBesar || 0}
                        onChange={(e) => setEditingItem({...editingItem, qtyBesar: Number(e.target.value)})}
                        className="rounded-xl h-11 border-slate-200 font-black bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-black uppercase text-amber-700">Stok Kecil ({editingItem.satuanKecil})</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={editingItem.qtyGudangKecil || 0}
                        onChange={(e) => setEditingItem({...editingItem, qtyGudangKecil: Number(e.target.value)})}
                        className="rounded-xl h-11 border-amber-200 font-black bg-amber-50/50 text-amber-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Area Kontainer */}
                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest">Area Kontainer Operasional</p>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-black uppercase text-slate-500">Qty Bulk ({editingItem.satuanBesar})</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={editingItem.qtyKontainerBesar || 0}
                        onChange={(e) => setEditingItem({...editingItem, qtyKontainerBesar: Number(e.target.value)})}
                        className="rounded-xl h-11 border-slate-200 font-black bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-black uppercase text-emerald-700">Qty Aktif ({editingItem.satuanKecil})</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={editingItem.qtyKontainerKecil || 0}
                        onChange={(e) => setEditingItem({...editingItem, qtyKontainerKecil: Number(e.target.value)})}
                        className="rounded-xl h-11 border-emerald-200 font-black bg-emerald-50/50 text-emerald-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Minimum Stock */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Min Stok Gudang</Label>
                    <Input 
                      type="number" 
                      value={editingItem.qtyMinGudang ?? editingItem.qtyMin ?? 5}
                      onChange={(e) => setEditingItem({...editingItem, qtyMinGudang: Number(e.target.value)})}
                      className="rounded-xl h-12 border-slate-100 font-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Min Stok Kontainer</Label>
                    <Input 
                      type="number" 
                      value={editingItem.qtyMinKontainer ?? editingItem.qtyMin ?? 5}
                      onChange={(e) => setEditingItem({...editingItem, qtyMinKontainer: Number(e.target.value)})}
                      className="rounded-xl h-12 border-slate-100 font-black"
                    />
                  </div>
                </div>
              </div>

              <Button 
                disabled={updating}
                className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] mt-6"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Simpan Perubahan Stok
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
