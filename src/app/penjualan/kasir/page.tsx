"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  FileUp, 
  Calendar as CalendarIcon,
  CheckCircle2,
  FileSpreadsheet,
  Trash2,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Loader2,
  Plus,
  Save,
  Layers,
  ChevronDown,
  History,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  deleteDoc, 
  doc, 
  where, 
  getDocs, 
  writeBatch,
  increment 
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import { applyUsage } from "@/lib/hpp";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SaleItem {
  name: string;
  code: string;
  total: number;
  pendapatan: number;
  keuntungan: number;
}

interface ProductionBatchItem {
  resepId: string;
  qty: number;
}

export default function ClosingTokoPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProduksiOpen, setIsProduksiOpen] = useState(false);
  const [productionBatch, setProductionBatch] = useState<ProductionBatchItem[]>([
    { resepId: "", qty: 1 }
  ]);

  const resepQuery = useMemoFirebase(() => 
    query(collection(db, "resep"), where("type", "==", "pelengkap")), 
    [db]
  );
  const { data: listResep } = useCollection(resepQuery);

  const selectedDateQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), where("tanggal", "==", selectedDate)), 
    [db, selectedDate]
  );
  const { data: currentDayData, loading: loadingCurrentDay } = useCollection(selectedDateQuery);

  const historyQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), orderBy("createdAt", "desc"), limit(10)), 
    [db]
  );
  const { data: historyList } = useCollection(historyQuery);

  const stats = useMemo(() => {
    if (!currentDayData || currentDayData.length === 0) {
      return { totalPendapatan: 0, totalKeuntungan: 0, totalQty: 0 };
    }
    return currentDayData.reduce((acc, closing) => ({
      totalPendapatan: acc.totalPendapatan + (closing.total || 0),
      totalKeuntungan: acc.totalKeuntungan + (closing.keuntunganTotal || 0),
      totalQty: acc.totalQty + (closing.totalQty || 0)
    }), { totalPendapatan: 0, totalKeuntungan: 0, totalQty: 0 });
  }, [currentDayData]);

  const parseNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/,/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const handleAddProductionItem = () => {
    setProductionBatch([...productionBatch, { resepId: "", qty: 1 }]);
  };

  const handleRemoveProductionItem = (index: number) => {
    if (productionBatch.length === 1) return;
    setProductionBatch(productionBatch.filter((_, i) => i !== index));
  };

  const handleProductionItemChange = (index: number, field: keyof ProductionBatchItem, value: any) => {
    const newBatch = [...productionBatch];
    newBatch[index] = { ...newBatch[index], [field]: value } as ProductionBatchItem;
    setProductionBatch(newBatch);
  };

  const handleSaveProduksi = async () => {
    const validBatch = productionBatch.filter(item => item.resepId && item.qty > 0);
    if (validBatch.length === 0) return;
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const materialsSnap = await getDocs(collection(db, "bahan-baku"));
      const materialMap: { [key: string]: any } = {};
      materialsSnap.forEach(d => {
        materialMap[d.id] = { id: d.id, ...d.data() };
      });

      const totalDeductions: { [key: string]: number } = {};
      const totalAdditions: { [key: string]: number } = {};

      for (const item of validBatch) {
        const resep = listResep?.find(r => r.id === item.resepId);
        if (!resep) continue;

        // Deduct raw material ingredients
        resep.komposisi.forEach((ing: any) => {
          const deduction = ing.jumlah * item.qty;
          totalDeductions[ing.bahanBakuId] = (totalDeductions[ing.bahanBakuId] || 0) + deduction;
        });

        // Add produced mixtures/pelengkap to the container stock
        const nameNormalized = resep.namaPelengkap?.trim().toLowerCase();
        if (nameNormalized === "creamy foam") {
          const creamyFoamMat = Object.values(materialMap).find((m: any) => m.code?.trim().toUpperCase() === "BB065");
          if (creamyFoamMat) {
            totalAdditions[creamyFoamMat.id] = (totalAdditions[creamyFoamMat.id] || 0) + item.qty;
          }
        } else if (nameNormalized === "teh tarik") {
          const tehTarikMat = Object.values(materialMap).find((m: any) => m.code?.trim().toUpperCase() === "BB064");
          if (tehTarikMat) {
            totalAdditions[tehTarikMat.id] = (totalAdditions[tehTarikMat.id] || 0) + item.qty;
          }
        }
      }

      const modifiedIds = new Set<string>([
        ...Object.keys(totalDeductions),
        ...Object.keys(totalAdditions)
      ]);

      modifiedIds.forEach((matId) => {
        const material = materialMap[matId];
        if (!material) return;

        let bulkQty = Number(material.qtyKontainerBesar || 0);
        let activeQty = Number(material.qtyKontainerKecil || 0);
        const conversionRate = Number(material.qtyKecil || 1);

        // Add produced amount to bulk kontainer
        const addition = totalAdditions[matId] || 0;
        bulkQty += addition;

        // Deduct consumed ingredients from active kontainer
        const deduction = totalDeductions[matId] || 0;
        activeQty -= deduction;

        // Convert/borrow from bulk if active quantity goes negative
        while (activeQty < 0 && bulkQty > 0) {
          bulkQty -= 1;
          activeQty += conversionRate;
        }

        const materialRef = doc(db, "bahan-baku", matId);
        batch.update(materialRef, {
          qtyKontainerBesar: bulkQty,
          qtyKontainerKecil: activeQty
        });
      });

      const logRef = doc(collection(db, "log_produksi_pelengkap"));
      batch.set(logRef, {
        items: validBatch.map(item => ({
          resepId: item.resepId,
          namaResep: listResep?.find(r => r.id === item.resepId)?.namaPelengkap,
          jumlah: item.qty
        })),
        tanggal: selectedDate,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      
      toast({
        title: "Pemakaian Dicatat",
        description: `${validBatch.length} jenis bahan telah dicatat & stok terpotong.`,
      });
      setIsProduksiOpen(false);
      setProductionBatch([{ resepId: "", qty: 1 }]);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal Mencatat Pemakaian",
        description: e.message || "Terjadi kesalahan sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveToFirestore = async (items: SaleItem[], date: string) => {
    if (items.length === 0) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const [productsSnap, recipesSnap, materialsSnap] = await Promise.all([
        getDocs(collection(db, "produk")),
        getDocs(collection(db, "resep")),
        getDocs(collection(db, "bahan-baku"))
      ]);

      const productCodeMap: { [key: string]: string } = {};
      productsSnap.forEach(d => {
        const p = d.data();
        if (p.code) productCodeMap[p.code] = d.id;
      });

      const recipeMap: { [key: string]: any } = {};
      recipesSnap.forEach(d => {
        const r = d.data();
        if (r.produkId) recipeMap[r.produkId] = r.komposisi;
      });

      const materialMap: { [key: string]: any } = {};
      materialsSnap.forEach(d => {
        materialMap[d.id] = { id: d.id, ...d.data() };
      });

      const totalPendapatan = items.reduce((sum, item) => sum + item.pendapatan, 0);
      const totalKeuntungan = items.reduce((sum, item) => sum + item.keuntungan, 0);
      const totalQty = items.reduce((sum, item) => sum + item.total, 0);

      const totalDeductions: { [key: string]: number } = {};
      items.forEach((item) => {
        const productId = productCodeMap[item.code];
        if (productId && recipeMap[productId]) {
          recipeMap[productId].forEach((ing: any) => {
            const deduction = ing.jumlah * item.total;
            totalDeductions[ing.bahanBakuId] = (totalDeductions[ing.bahanBakuId] || 0) + deduction;
          });
        }
      });

      const hppDetails: any[] = [];

      Object.entries(totalDeductions).forEach(([matId, deduction]) => {
        const material = materialMap[matId];
        if (!material) return;

        const usageResult = applyUsage(material, deduction);
        const hppValue = usageResult.cost;
        hppDetails.push({
          materialId: matId,
          materialName: material.nama,
          qty: deduction,
          unitCost: usageResult.avgPrice,
          hppValue,
        });

        let bulkQty = Number(material.qtyKontainerBesar || 0);
        let activeQty = Number(material.qtyKontainerKecil || 0);
        const conversionRate = Number(material.qtyKecil || 1);

        activeQty -= deduction;

        while (activeQty < 0 && bulkQty > 0) {
          bulkQty -= 1;
          activeQty += conversionRate;
        }

        const materialRef = doc(db, "bahan-baku", matId);
        batch.update(materialRef, {
          qtyKontainerBesar: bulkQty,
          qtyKontainerKecil: activeQty,
          stockValue: usageResult.stockValue,
          avgPrice: usageResult.avgPrice,
        });
      });

      const saleRef = doc(collection(db, "penjualan"));
      const hppTotal = hppDetails.reduce((sum, item) => sum + item.hppValue, 0);
      batch.set(saleRef, {
        tanggal: date,
        createdAt: serverTimestamp(),
        total: totalPendapatan,
        keuntunganTotal: totalKeuntungan,
        totalQty: totalQty,
        items: items,
        hpp: hppTotal,
        hppDetails,
        status: "completed"
      });

      await batch.commit();
      
      toast({
        title: "Berhasil Disimpan",
        description: `Laporan ${date} tersimpan & stok kontainer otomatis terpotong.`,
      });
      
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat memproses data.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Hapus data closing ini?")) return;
    try {
      await deleteDoc(doc(db, "penjualan", id));
      toast({ title: "Dihapus" });
    } catch (e) { console.error(e); }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const items: SaleItem[] = data.map((row: any) => ({
          name: String(row["Name"] || row["Nama"] || ""),
          code: String(row["Code"] || row["Kode"] || ""),
          total: parseNumber(row["Total"] || row["Jumlah"] || 0),
          pendapatan: parseNumber(row["Pendapatan"] || 0),
          keuntungan: parseNumber(row["Keuntungan"] || 0)
        })).filter(item => item.name || item.code);

        if (items.length > 0) {
          await saveToFirestore(items, selectedDate);
        } else {
          toast({
            variant: "destructive",
            title: "Data Kosong",
            description: "Format file tidak sesuai atau tidak ada data produk.",
          });
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Gagal Impor",
          description: "Format file tidak didukung atau rusak.",
        });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Closing Toko</h1>
          <p className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-[0.2em] mt-1">
            Impor laporan Excel & Input Pemakaian Bahan
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <Dialog open={isProduksiOpen} onOpenChange={setIsProduksiOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto rounded-xl md:rounded-2xl bg-primary hover:bg-primary/90 text-white px-6 h-12 font-black uppercase tracking-widest text-[10px] gap-2 shadow-xl shadow-primary/20">
                <Layers className="h-4 w-4" />
                Input Pemakaian
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-6 md:p-10 max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-black uppercase italic text-slate-900">
                  Input Pemakaian Bahan
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 mt-6 max-h-[60vh] overflow-y-auto px-1">
                {productionBatch.map((item, index) => (
                  <div key={index} className="p-4 bg-slate-50 rounded-2xl relative border border-slate-100 space-y-4">
                    {productionBatch.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveProductionItem(index)}
                        className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-white shadow-sm text-slate-400 hover:text-rose-500 border border-slate-100"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Pilih Pemakaian</Label>
                      <Select 
                        value={item.resepId} 
                        onValueChange={(val) => handleProductionItemChange(index, 'resepId', val)}
                      >
                        <SelectTrigger className="rounded-xl h-12 font-bold bg-white border-none shadow-sm">
                          <SelectValue placeholder="Pilih pemakaian..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-xl">
                          {listResep?.map((r: any) => (
                            <SelectItem key={r.id} value={r.id} className="rounded-lg">
                              {r.namaPelengkap}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Jumlah Pemakaian</Label>
                      <Input 
                        type="number" 
                        min={1}
                        value={item.qty}
                        onChange={(e) => handleProductionItemChange(index, 'qty', Number(e.target.value))}
                        className="rounded-xl h-12 bg-white border-none font-black text-center text-lg shadow-sm"
                      />
                    </div>
                  </div>
                ))}

                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleAddProductionItem}
                  className="w-full h-12 rounded-xl border-2 border-dashed border-slate-200 text-[10px] font-black uppercase text-slate-400 hover:border-primary/20 hover:text-primary transition-all"
                >
                  <Plus className="h-4 w-4 mr-2" /> Tambah Jenis Bahan
                </Button>
              </div>

              <div className="mt-6 space-y-4">
                <div className="bg-primary/5 p-4 md:p-5 rounded-2xl border border-primary/10">
                   <p className="text-[8px] md:text-[9px] font-bold text-primary uppercase tracking-widest leading-relaxed text-center">
                     Stok kontainer akan terpotong secara otomatis sesuai takaran resep.
                   </p>
                </div>

                <Button 
                  disabled={saving || productionBatch.some(i => !i.resepId)}
                  onClick={handleSaveProduksi}
                  className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Simpan & Potong Stok
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-xl md:rounded-[1.5rem] shadow-sm border border-slate-100 flex-1 sm:flex-initial">
            <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-600 bg-transparent border-none outline-none cursor-pointer w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          <Card className={cn(
            "shadow-sm rounded-3xl md:rounded-[3rem] p-8 md:p-12 bg-white flex flex-col items-center justify-center text-center group border-2 border-dashed border-slate-100 transition-all",
            saving ? "opacity-50 pointer-events-none" : "hover:border-primary/20"
          )}>
            <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
            <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl md:rounded-[2.5rem] bg-primary/5 flex items-center justify-center mb-6">
              {saving ? <Loader2 className="h-8 w-8 md:h-10 md:w-10 text-primary animate-spin" /> : <FileSpreadsheet className="h-8 w-8 md:h-10 md:w-10 text-primary" />}
            </div>
            <h3 className="text-lg md:text-xl font-black uppercase italic text-slate-900">
              {saving ? "Memproses Data..." : "Unggah Laporan Excel"}
            </h3>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-xs mx-auto leading-relaxed">
              Sistem akan otomatis memotong stok aktif kontainer & meminjam stok bulk jika eceran habis.
            </p>
            <Button disabled={saving} onClick={() => fileInputRef.current?.click()} className="mt-6 md:mt-8 rounded-xl md:rounded-2xl bg-slate-900 px-8 font-black uppercase tracking-widest text-[10px] h-12 shadow-xl">
              Pilih File & Simpan
            </Button>
          </Card>

          <div className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-3 px-4">
              <History className="h-5 w-5 text-primary" />
              <h3 className="text-[11px] md:text-sm font-black uppercase tracking-widest text-slate-900">Histori Closing Terbaru</h3>
            </div>
            <div className="grid gap-3 md:gap-4">
              {historyList?.map((hist: any) => (
                <Card key={hist.id} className="rounded-2xl md:rounded-3xl p-4 md:p-6 bg-white border-none shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                  <div className="flex items-center gap-4 md:gap-6">
                    <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-slate-400 group-hover:text-primary" />
                    <div>
                      <p className="text-[12px] md:text-sm font-black text-slate-900 uppercase italic leading-tight">{hist.tanggal}</p>
                      <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{hist.items?.length || 0} Produk</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 md:gap-8">
                    <div className="text-right hidden xs:block">
                      <p className="text-[12px] md:text-sm font-black text-primary tabular-nums">Rp {hist.total?.toLocaleString('id-ID')}</p>
                      <span className="text-[7px] md:text-[8px] font-black uppercase text-slate-300">Total</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteHistory(hist.id)} className="text-slate-300 hover:text-rose-600 h-9 w-9 md:h-10 md:w-10 rounded-xl">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              {(!historyList || historyList.length === 0) && (
                <div className="py-16 md:py-20 text-center opacity-30 italic text-[10px] font-black uppercase tracking-widest">
                  Belum ada riwayat closing
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <Card className="lg:sticky lg:top-8 border-none shadow-xl rounded-3xl md:rounded-[2.5rem] bg-white overflow-hidden">
            <div className="bg-slate-900 p-6 md:p-8 text-white">
              <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tighter">Ringkasan Sesi</h3>
            </div>
            <div className="p-6 md:p-10 space-y-6 md:space-y-8">
              <div className="flex items-center gap-4 md:gap-5">
                <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner shrink-0"><ShoppingBag className="h-6 w-6 md:h-7 md:w-7" /></div>
                <div>
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Produk Terjual</p>
                  <p className="text-2xl md:text-3xl font-black text-slate-900 tabular-nums">{stats.totalQty}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 md:gap-5">
                <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner shrink-0"><Wallet className="h-6 w-6 md:h-7 md:w-7" /></div>
                <div>
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Pendapatan</p>
                  <p className="text-2xl md:text-3xl font-black text-primary tabular-nums">Rp {stats.totalPendapatan.toLocaleString('id-ID')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 md:gap-5">
                <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-inner shrink-0"><TrendingUp className="h-6 w-6 md:h-7 md:w-7" /></div>
                <div>
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Keuntungan</p>
                  <p className="text-2xl md:text-3xl font-black text-emerald-600 tabular-nums">Rp {stats.totalKeuntungan.toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
