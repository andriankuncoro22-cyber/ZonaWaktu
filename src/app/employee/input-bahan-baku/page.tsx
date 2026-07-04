"use client";

import React, { useState, useMemo } from "react";
import { 
  Truck, 
  ShoppingCart, 
  PlusCircle, 
  Save, 
  History, 
  Trash2, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Hash, 
  FileText,
  Loader2,
  Package
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  doc, 
  getDoc,
  updateDoc, 
  increment,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InputItem {
  materialId: string;
  qty: number;
  price: number;
}

type ActiveTab = "pembelian" | "ambil" | "kembali";

export default function EmployeeInputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  

  const [activeTab, setActiveTab] = useState<ActiveTab>("pembelian");
  const [purchaseType] = useState<string>("belanja");
  const [nomorNota, setNomorNota] = useState<string>("");
  const [items, setItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [movementItems, setMovementItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [returnItems, setReturnItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch Master Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  // Fetch Histori Input Bahan (limit 100 untuk difilter secara client-side)
  const historyQuery = useMemoFirebase(() => 
    query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(100)), 
    [db]
  );
  const { data: history } = useCollection(historyQuery);

  const activeHistorySection = useMemo(() => {
    const filteredHistory = history?.filter((log: any) => log.location === "kontainer") || [];

    switch (activeTab) {
      case "ambil":
        return {
          key: "ambil",
          title: "Histori Pengambilan Gudang",
          icon: Package,
          accent: "bg-amber-50 text-amber-600",
          logs: filteredHistory.filter((log: any) => log.type === "ambil-gudang"),
        };
      case "kembali":
        return {
          key: "kembali",
          title: "Histori Pengembalian Barang",
          icon: Truck,
          accent: "bg-emerald-50 text-emerald-600",
          logs: filteredHistory.filter((log: any) => log.type === "kembali-gudang"),
        };
      default:
        return {
          key: "pembelian",
          title: "Histori Pembelian",
          icon: ShoppingCart,
          accent: "bg-orange-50 text-orange-600",
          logs: filteredHistory.filter((log: any) => log.type === "belanja" || log.type === "supplier"),
        };
    }
  }, [activeTab, history]);

  const handleAddItem = () => {
    setItems([...items, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleAddMovementItem = () => {
    setMovementItems([...movementItems, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleAddReturnItem = () => {
    setReturnItems([...returnItems, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleRemoveMovementItem = (index: number) => {
    if (movementItems.length === 1) return;
    setMovementItems(movementItems.filter((_, i) => i !== index));
  };

  const handleRemoveReturnItem = (index: number) => {
    if (returnItems.length === 1) return;
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InputItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleMovementItemChange = (index: number, field: keyof InputItem, value: any) => {
    const newItems = [...movementItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMovementItems(newItems);
  };

  const handleReturnItemChange = (index: number, field: keyof InputItem, value: any) => {
    const newItems = [...returnItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setReturnItems(newItems);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi
    const validItems = items.filter(item => item.materialId && item.qty > 0);
    if (!nomorNota || validItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Input Tidak Lengkap",
        description: "Silakan isi nomor nota dan setidaknya satu bahan dengan jumlah yang benar.",
      });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      // Siapkan data detail untuk log
      const logItems = validItems.map(item => {
        const material = (materials as any[])?.find(m => m.id === item.materialId);
        
        // Update stok di Area Kontainer (tambah qtyKontainerBesar)
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(item.qty),
          currentPrice: item.price,
          avgPrice: item.price,
          priceHistory: Array.isArray(material?.priceHistory) ? [...material.priceHistory, { price: item.price, recordedAt: new Date().toISOString(), note: "Input belanja karyawan" }].slice(-10) : [{ price: item.price, recordedAt: new Date().toISOString(), note: "Input belanja karyawan" }],
        });

        return {
          materialId: item.materialId,
          materialName: material.nama,
          materialCode: material.code,
          qty: item.qty,
          unit: material.satuanBesar
        };
      });

      // Catat Log Pembelian dengan location: "kontainer"
      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota: nomorNota,
        type: purchaseType,
        items: logItems,
        totalItems: logItems.length,
        location: "kontainer",
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Nota Berhasil Disimpan",
        description: `Nota #${nomorNota} dengan ${logItems.length} bahan telah ditambahkan ke Area Kontainer.`,
      });

      // Reset Form
      setItems([{ materialId: "", qty: 0, price: 0 }]);
      setNomorNota("");
      
    } catch (error) {
      console.error("Gagal simpan nota masuk:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  // Revert stok saat menghapus log nota masuk
  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Hapus catatan nota ini dan kembalikan stok?")) return;
    setSaving(true);
    try {
      const logDocRef = doc(db, "log_pembelian_bahan", logId);
      const logSnap = await getDoc(logDocRef);
      if (!logSnap.exists()) return;
      const logData = logSnap.data();

      const batch = writeBatch(db);

      // Kurangi stok qtyKontainerBesar sesuai data nota
      logData.items?.forEach((item: any) => {
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(-item.qty)
        });
      });

      batch.delete(logDocRef);
      await batch.commit();

      toast({ 
        title: "Nota Dihapus", 
        description: "Catatan nota berhasil dihapus dan stok kontainer dikembalikan." 
      });
    } catch (e: any) {
      console.error(e);
      toast({ 
        variant: "destructive", 
        title: "Gagal Menghapus", 
        description: "Terjadi kesalahan sistem saat mencoba menghapus nota." 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTakeFromWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = movementItems.filter(item => item.materialId && item.qty > 0);
    if (!nomorNota || validItems.length === 0) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Isi nomor referensi dan pilih minimal satu bahan." });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const logItems = validItems.map(item => {
        const material = (materials as any[])?.find(m => m.id === item.materialId);
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(item.qty),
          qtyGudang: increment(-item.qty)
        });
        return { materialId: item.materialId, materialName: material.nama, materialCode: material.code, qty: item.qty, unit: material.satuanBesar };
      });

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota,
        type: "ambil-gudang",
        items: logItems,
        totalItems: logItems.length,
        location: "kontainer",
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast({ title: "Stok Diambil", description: `Barang berhasil dipindahkan dari gudang ke kontainer.` });
      setMovementItems([{ materialId: "", qty: 0, price: 0 }]);
      setNomorNota("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan sistem." });
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = returnItems.filter(item => item.materialId && item.qty > 0);
    if (!nomorNota || validItems.length === 0) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Isi nomor referensi dan pilih minimal satu bahan." });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const logItems = validItems.map(item => {
        const material = (materials as any[])?.find(m => m.id === item.materialId);
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(-item.qty),
          qtyGudang: increment(item.qty)
        });
        return { materialId: item.materialId, materialName: material.nama, materialCode: material.code, qty: item.qty, unit: material.satuanBesar };
      });

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota,
        type: "kembali-gudang",
        items: logItems,
        totalItems: logItems.length,
        location: "kontainer",
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast({ title: "Pengembalian Disimpan", description: `Barang berhasil dikembalikan ke gudang.` });
      setReturnItems([{ materialId: "", qty: 0, price: 0 }]);
      setNomorNota("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan sistem." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Pembelian Bahan Baku</h1>
          <p className="text-[9px] sm:text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Area Kontainer (Update Stok Kontainer per Nota)
          </p>
        </div>
      </div>

      <div className="space-y-6 sm:space-y-8">
        <Card className="rounded-[1.5rem] sm:rounded-[3rem] border-none shadow-sm bg-white overflow-hidden">
          <div className="p-3 sm:p-8">
            <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-2 sm:flex-row sm:flex-wrap">
              {[
                { key: "pembelian", label: "Pembelian Bahan Baku" },
                { key: "ambil", label: "Ambil Stock Gudang" },
                { key: "kembali", label: "Pengembalian Barang" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as ActiveTab)}
                  className={cn(
                    "rounded-xl px-3 py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all text-center",
                    activeTab === tab.key ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-white"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "pembelian" && (
              <form onSubmit={handleSave} className="mt-6 sm:mt-8 space-y-6 sm:space-y-10">
              {/* Header Nota */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                <div className="space-y-2">
                  <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Jenis Pembelian</Label>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 rounded-xl h-11 sm:h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all bg-white shadow-sm text-primary"
                      disabled
                    >
                      <ShoppingCart className="h-4 w-4" /> Belanja
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Nomor Nota / Invoice</Label>
                  <div className="relative">
                     <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                     <Input 
                       value={nomorNota}
                       onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                       className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 pl-12 font-black text-sm sm:text-base md:text-lg text-slate-900 placeholder:font-bold"
                       placeholder="CONTOH: INV/2024/001"
                       required
                     />
                  </div>
                </div>
              </div>

              {/* Daftar Bahan Baku */}
              <div className="space-y-4 sm:space-y-6 pt-4 border-t border-slate-50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                  <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Rincian Bahan Baku</h3>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={handleAddItem}
                    className="h-10 w-full sm:w-auto text-[10px] font-black text-primary uppercase tracking-widest gap-2 hover:bg-primary/5"
                  >
                    <PlusCircle className="h-4 w-4" /> Tambah Item
                  </Button>
                </div>

                <div className="space-y-4">
                  {items.map((item, index) => {
                    const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
                    return (
                      <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-slate-50 p-4 sm:p-6 rounded-[1.25rem] sm:rounded-[2rem] border border-slate-100 group transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1 w-full space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Pilih Bahan Baku</Label>
                          <Select 
                            value={item.materialId} 
                            onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                          >
                            <SelectTrigger className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-slate-900 text-sm md:text-base">
                              <SelectValue placeholder="Pilih..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                              {materials?.map((m: any) => (
                                <SelectItem key={m.id} value={m.id} className="rounded-xl">
                                  {m.code} - {m.nama}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="w-full md:w-32 space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Jumlah</Label>
                          <div className="relative">
                            <Input 
                              type="number" 
                              step="any"
                              value={item.qty}
                              onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))}
                              className="rounded-xl border-none h-11 sm:h-12 bg-white shadow-sm font-black text-center text-sm sm:text-base md:text-lg"
                            />
                          </div>
                        </div>

                        <div className="w-full md:w-24 space-y-2">
                           <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Satuan</Label>
                           <div className="h-11 sm:h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-[11px] md:text-[12px] font-black uppercase text-slate-600">
                              {matDetail?.satuanBesar || "-"}
                           </div>
                        </div>

                        <div className="w-full md:w-36 space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Nominal</Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={item.price}
                            onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                            className="rounded-xl border-none h-11 sm:h-12 bg-white shadow-sm font-black text-center text-sm sm:text-base md:text-lg"
                            placeholder="0"
                          />
                        </div>

                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveItem(index)}
                          className="h-11 sm:h-12 w-full sm:w-12 rounded-xl text-slate-300 hover:text-rose-600 transition-colors bg-white shadow-sm border-none"
                          disabled={items.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-6">
                <Button 
                  disabled={saving || items.some(i => !i.materialId)}
                  className="w-full h-14 sm:h-16 rounded-[1.25rem] sm:rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] text-[10px] sm:text-[11px] shadow-xl shadow-primary/20 gap-2 sm:gap-3 transition-all active:scale-[0.98]"
                >
                  {saving ? "Memproses Data..." : (
                    <>
                      <Save className="h-4 w-4" />
                      Simpan Pembelian & Tambah Stok Kontainer
                    </>
                  )}
                </Button>
              </div>
              </form>
            )}

            {activeTab === "ambil" && (
              <form onSubmit={handleTakeFromWarehouse} className="mt-8 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Nomor Referensi</Label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input value={nomorNota} onChange={(e) => setNomorNota(e.target.value.toUpperCase())} className="rounded-2xl border-slate-100 h-14 bg-slate-50 pl-12 font-black text-base text-slate-900" placeholder="CONTOH: AMBIL/001" required />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Informasi</p>
                    <p className="mt-2 font-semibold">Barang yang diambil dari gudang akan otomatis masuk ke stock kontainer.</p>
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Daftar Barang yang Diambil</h3>
                    <Button type="button" variant="ghost" onClick={handleAddMovementItem} className="h-10 text-[10px] font-black text-primary uppercase tracking-widest gap-2 hover:bg-primary/5">
                      <PlusCircle className="h-4 w-4" /> Tambah Item
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {movementItems.map((item, index) => {
                      const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
                      return (
                        <div key={index} className="flex flex-col md:flex-row gap-4 items-end rounded-[2rem] border border-slate-100 bg-slate-50 p-6">
                          <div className="flex-1 w-full space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pilih Barang</Label>
                            <Select value={item.materialId} onValueChange={(val) => handleMovementItemChange(index, "materialId", val)}>
                              <SelectTrigger className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-900">
                                <SelectValue placeholder="Pilih barang..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-2xl">
                                {materials?.map((m: any) => (
                                  <SelectItem key={m.id} value={m.id} className="rounded-xl">{m.code} - {m.nama}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {matDetail && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                                  Sisa Gudang: {Number(matDetail.qtyGudang || 0)} {matDetail.satuanBesar || "pcs"}
                                </div>
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                  Sisa Kontainer: {Number(matDetail.qtyKontainerBesar || 0)} {matDetail.satuanBesar || "pcs"}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="w-full md:w-32 space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jumlah</Label>
                            <Input type="number" step="any" value={item.qty} onChange={(e) => handleMovementItemChange(index, "qty", Number(e.target.value))} className="h-12 rounded-xl border-none bg-white text-center font-black shadow-sm" />
                          </div>
                          <div className="w-full md:w-24 space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Satuan</Label>
                            <div className="flex h-12 items-center justify-center rounded-xl bg-white text-[11px] font-black uppercase text-slate-600 shadow-sm">{matDetail?.satuanBesar || "-"}</div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveMovementItem(index)} className="h-12 w-12 rounded-xl border-none bg-white text-slate-300 shadow-sm hover:text-rose-600" disabled={movementItems.length === 1}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button disabled={saving} className="h-16 w-full rounded-[1.5rem] bg-primary text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-primary/20">
                  {saving ? "Memproses..." : "Simpan Ambil Stok Gudang"}
                </Button>
              </form>
            )}

            {activeTab === "kembali" && (
              <form onSubmit={handleReturnToWarehouse} className="mt-8 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Nomor Referensi</Label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input value={nomorNota} onChange={(e) => setNomorNota(e.target.value.toUpperCase())} className="rounded-2xl border-slate-100 h-14 bg-slate-50 pl-12 font-black text-base text-slate-900" placeholder="CONTOH: KEMBALI/001" required />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Informasi</p>
                    <p className="mt-2 font-semibold">Barang yang dikembalikan akan otomatis berkurang di stock kontainer dan masuk ke gudang.</p>
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Daftar Barang yang Dikembalikan</h3>
                    <Button type="button" variant="ghost" onClick={handleAddReturnItem} className="h-10 text-[10px] font-black text-primary uppercase tracking-widest gap-2 hover:bg-primary/5">
                      <PlusCircle className="h-4 w-4" /> Tambah Item
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {returnItems.map((item, index) => {
                      const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
                      return (
                        <div key={index} className="flex flex-col md:flex-row gap-4 items-end rounded-[2rem] border border-slate-100 bg-slate-50 p-6">
                          <div className="flex-1 w-full space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pilih Barang</Label>
                            <Select value={item.materialId} onValueChange={(val) => handleReturnItemChange(index, "materialId", val)}>
                              <SelectTrigger className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-900">
                                <SelectValue placeholder="Pilih barang..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-2xl">
                                {materials?.map((m: any) => (
                                  <SelectItem key={m.id} value={m.id} className="rounded-xl">{m.code} - {m.nama}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {matDetail && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                  Sisa Kontainer: {Number(matDetail.qtyKontainerBesar || 0)} {matDetail.satuanBesar || "pcs"}
                                </div>
                                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">
                                  Sisa Gudang: {Number(matDetail.qtyGudang || 0)} {matDetail.satuanBesar || "pcs"}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="w-full md:w-32 space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jumlah</Label>
                            <Input type="number" step="any" value={item.qty} onChange={(e) => handleReturnItemChange(index, "qty", Number(e.target.value))} className="h-12 rounded-xl border-none bg-white text-center font-black shadow-sm" />
                          </div>
                          <div className="w-full md:w-24 space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Satuan</Label>
                            <div className="flex h-12 items-center justify-center rounded-xl bg-white text-[11px] font-black uppercase text-slate-600 shadow-sm">{matDetail?.satuanBesar || "-"}</div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveReturnItem(index)} className="h-12 w-12 rounded-xl border-none bg-white text-slate-300 shadow-sm hover:text-rose-600" disabled={returnItems.length === 1}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button disabled={saving} className="h-16 w-full rounded-[1.5rem] bg-primary text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-primary/20">
                  {saving ? "Memproses..." : "Simpan Pengembalian Barang"}
                </Button>
              </form>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center gap-3 px-4">
            <History className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Nota Terakhir</h3>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="rounded-[2.5rem] bg-white border-none shadow-sm overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stok Kontainer</h4>
                    <p className="text-sm font-black text-slate-900 uppercase italic">Harga Beli / Satuan Besar</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {materials?.length ? materials.slice(0, 6).map((material: any) => (
                    <div key={material.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{material.code}</p>
                        <p className="text-xs font-black text-slate-800 uppercase italic">{material.nama}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary tabular-nums">{Number(material.qtyKontainerBesar || 0)}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{material.satuanBesar || "pcs"}</p>
                        <p className="text-[9px] font-bold text-slate-500">Rp {Number(material.hargaBeliSatuanBesar || 0).toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Belum ada data stok</div>
                  )}
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              {(() => {
                const Icon = activeHistorySection.icon;
                return (
                  <Card className="rounded-[2rem] bg-white border-none shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", activeHistorySection.accent)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeHistorySection.title}</h4>
                          <p className="text-xs font-black text-slate-900 uppercase italic">{activeHistorySection.logs.length} riwayat</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {activeHistorySection.logs.length > 0 ? activeHistorySection.logs.slice(0, 4).map((log: any) => (
                          <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{log.nomorNota}</p>
                                <p className="mt-1 text-xs font-black text-slate-900 uppercase italic">
                                  {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString('id-ID') : 'Baru saja'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-primary uppercase">{log.totalItems} bahan</p>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {log.items?.slice(0, 2).map((item: any, i: number) => (
                                <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-400 text-[8px]">{item.materialCode}</span>
                                    <span className="font-black text-slate-800 uppercase italic">{item.materialName}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-primary tabular-nums">{activeHistorySection.key === 'kembali' ? '-' : activeHistorySection.key === 'ambil' ? '+' : '+'}{item.qty}</span>
                                    <span className="font-bold text-slate-400 uppercase text-[8px]">{item.unit}</span>
                                  </div>
                                </div>
                              ))}
                              {log.items?.length > 2 && (
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">+{log.items.length - 2} item lain</p>
                              )}
                            </div>
                          </div>
                        )) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Belum ada riwayat
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
