
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
  Edit2
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

export default function StokBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  const [transferData, setTransferData] = useState({
    materialId: "",
    qty: 0
  });

  const [editingItem, setEditingItem] = useState<any>(null);

  const materialsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("code", "asc")), 
    [db]
  );
  
  const { data: materials, loading } = useCollection(materialsQuery);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const filteredMaterials = (materials as any[])?.filter(item => 
    item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferData.materialId || transferData.qty <= 0) return;

    setTransferring(true);
    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "bahan-baku", transferData.materialId);
      const material = (materials as any[]).find(m => m.id === transferData.materialId);

      if ((material.qtyBesar || 0) < transferData.qty) {
        throw new Error(`Stok gudang (${material.satuanBesar}) tidak mencukupi`);
      }

      batch.update(materialRef, {
        qtyBesar: increment(-transferData.qty),
        qtyKontainerBesar: increment(transferData.qty)
      });

      await batch.commit();
      toast({
        title: "Transfer Berhasil",
        description: `${transferData.qty} ${material.satuanBesar} dipindahkan ke Area Kontainer.`
      });
      setIsTransferOpen(false);
      setTransferData({ materialId: "", qty: 0 });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal Transfer",
        description: err.message || "Terjadi kesalahan sistem."
      });
    } finally {
      setTransferring(false);
    }
  };

  // Auto-kalibrasi: bila Qty Bulk <= 1, konversi ke satuan kecil
  const handleBulkQtyBlur = (rawValue: number) => {
    if (!editingItem) return;
    const bulkVal = Number(rawValue || 0);
    if (bulkVal <= 1 && bulkVal > 0) {
      const konversi = Number(editingItem.qtyKecil || 1);
      const tambahKecil = bulkVal * konversi;
      const newKontainerKecil = Number(editingItem.qtyKontainerKecil || 0) + tambahKecil;
      setEditingItem({
        ...editingItem,
        qtyKontainerBesar: 0,
        qtyKontainerKecil: Math.round(newKontainerKecil * 100) / 100
      });
      toast({
        title: "Auto-Kalibrasi",
        description: `${bulkVal} ${editingItem.satuanBesar} → +${Math.round(tambahKecil * 100) / 100} ${editingItem.satuanKecil} ke Qty Aktif.`
      });
    } else if (bulkVal === 0) {
      setEditingItem({ ...editingItem, qtyKontainerBesar: 0 });
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setUpdating(true);
    try {
      const materialRef = doc(db, "bahan-baku", editingItem.id);
      await updateDoc(materialRef, {
        qtyBesar: Number(editingItem.qtyBesar || 0),
        qtyKontainerBesar: Number(editingItem.qtyKontainerBesar || 0),
        qtyKontainerKecil: Number(editingItem.qtyKontainerKecil || 0)
      });
      
      toast({ title: "Stok Diperbarui", description: "Perubahan data stok telah berhasil disimpan." });
      setIsEditOpen(false);
      setEditingItem(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Gagal Update", description: "Terjadi kesalahan sistem." });
    } finally {
      setUpdating(false);
    }
  };

  const handleExportExcel = () => {
    const wsData = filteredMaterials.map(item => ({
      "Kode": item.code,
      "Nama Bahan": item.nama,
      "Stok Gudang": item.qtyBesar || 0,
      "Satuan Besar": item.satuanBesar,
      "Qty Bulk Kontainer": item.qtyKontainerBesar || 0,
      "Qty Aktif Kontainer": item.qtyKontainerKecil || 0,
      "Satuan Kecil": item.satuanKecil
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
      item.qtyBesar || 0,
      item.satuanBesar,
      item.qtyKontainerBesar || 0,
      item.qtyKontainerKecil || 0,
      item.satuanKecil
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG", "SAT. B", "BULK", "AKTIF", "SAT. K"]],
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
            Gudang Utama & Area Kontainer Operasional
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
                      {materials?.map((m: any) => (
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
                    onChange={(e) => setTransferData({...transferData, qty: Number(e.target.value)})}
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

      <Tabs defaultValue="gudang" className="w-full">
        <TabsList className="bg-white p-1.5 md:p-2 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 h-14 md:h-16 w-full max-w-md grid grid-cols-2 gap-2 mb-6 md:mb-8 mx-auto md:mx-0">
          <TabsTrigger value="gudang" className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            Gudang Utama
          </TabsTrigger>
          <TabsTrigger value="kontainer" className="rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            Area Kontainer
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
            <TabsContent value="gudang" className="m-0 min-w-[700px] md:min-w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Stok Gudang</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Satuan</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></td></tr>
                  ) : filteredMaterials?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-10 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-primary tabular-nums italic text-xl md:text-2xl">{(item.qtyBesar || 0)}</td>
                      <td className="px-6 md:px-10 py-4 md:py-6 text-center text-[9px] md:text-[10px] font-black uppercase text-primary tracking-widest">{item.satuanBesar}</td>
                      <td className="px-6 md:px-10 py-4 md:py-6 text-right">
                         <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsEditOpen(true); }} className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary">
                           <Edit2 className="h-4 w-4" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="kontainer" className="m-0 min-w-[900px] md:min-w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Code</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500">Nama Bahan</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Bulk</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Besar</th>
                    <th className="px-4 md:px-8 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Qty Aktif</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-center">Sat. Kecil</th>
                    <th className="px-6 md:px-10 py-4 md:py-6 text-[9px] md:text-[10px] font-black uppercase text-slate-500 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMaterials?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 md:px-10 py-4 md:py-6 text-[10px] font-black text-slate-900">{item.code}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-black text-slate-900 uppercase italic">{item.nama}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-indigo-600 tabular-nums italic text-xl md:text-2xl">{(item.qtyKontainerBesar || 0)}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-indigo-400">{item.satuanBesar}</td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right font-black text-emerald-600 tabular-nums italic text-xl md:text-2xl">
                        {Math.round(item.qtyKontainerKecil || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 md:px-10 py-4 md:py-6 text-center text-[8px] md:text-[9px] font-black uppercase text-emerald-400">{item.satuanKecil}</td>
                      <td className="px-6 md:px-10 py-4 md:py-6 text-right">
                         <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsEditOpen(true); }} className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary">
                           <Edit2 className="h-4 w-4" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Stok Gudang ({editingItem.satuanBesar})</Label>
                  <Input 
                    type="number" 
                    value={editingItem.qtyBesar || 0}
                    onChange={(e) => setEditingItem({...editingItem, qtyBesar: Number(e.target.value)})}
                    className="rounded-xl h-12 border-slate-100 font-black"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Qty Bulk Kontainer ({editingItem.satuanBesar})</Label>
                    {(editingItem.qtyKontainerBesar || 0) <= 1 && (editingItem.qtyKontainerBesar || 0) > 0 && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                        ⚡ Auto-kalibrasi saat blur
                      </span>
                    )}
                  </div>
                  <Input 
                    type="number" 
                    step="any"
                    value={editingItem.qtyKontainerBesar || 0}
                    onChange={(e) => setEditingItem({...editingItem, qtyKontainerBesar: Number(e.target.value)})}
                    onBlur={(e) => handleBulkQtyBlur(Number(e.target.value))}
                    className={cn(
                      "rounded-xl h-12 border-slate-100 font-black",
                      (editingItem.qtyKontainerBesar || 0) <= 1 && (editingItem.qtyKontainerBesar || 0) > 0
                        ? "border-amber-300 bg-amber-50 focus-visible:ring-amber-300"
                        : ""
                    )}
                  />
                  {(editingItem.qtyKontainerBesar || 0) <= 1 && (editingItem.qtyKontainerBesar || 0) > 0 && (
                    <p className="text-[9px] font-bold text-amber-600 mt-1">
                      → akan dikonversi: {Math.round((editingItem.qtyKontainerBesar || 0) * Number(editingItem.qtyKecil || 1) * 100) / 100} {editingItem.satuanKecil} ke Qty Aktif
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Qty Aktif Kontainer ({editingItem.satuanKecil})</Label>
                  <Input 
                    type="number" 
                    step="any"
                    value={editingItem.qtyKontainerKecil || 0}
                    onChange={(e) => setEditingItem({...editingItem, qtyKontainerKecil: Number(e.target.value)})}
                    className="rounded-xl h-12 border-slate-100 font-black"
                  />
                </div>
              </div>

              <Button 
                disabled={updating}
                className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
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
