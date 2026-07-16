"use client";

import React, { useState, useMemo } from "react";
import { 
  Truck, 
  ShoppingCart, 
  Plus, 
  Save, 
  History, 
  Trash2,
  Package,
  PlusCircle,
  X,
  ChevronDown,
  ChevronUp,
  Hash,
  FileText,
  AlertCircle,
  Building2,
  Store
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
  updateDoc, 
  increment,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { applyPurchase } from "@/lib/hpp";

interface InputItem {
  materialId: string;
  qty: number;
  qtyKecilPerUnit?: number; // Isi per Pack/Box/Pcs (Satuan Kecil) khusus Beli Sendiri
  price: number;
}

export default function InputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [targetLocation, setTargetLocation] = useState<string>("gudang"); // "gudang" | "kontainer"
  const [purchaseType, setPurchaseType] = useState<string>("supplier");
  const [nomorNota, setNomorNota] = useState<string>("");
  const [items, setItems] = useState<InputItem[]>([{ materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch Master Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  // Fetch Histori Input Bahan
  const historyQuery = useMemoFirebase(() => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(10)), [db]);
  const { data: history } = useCollection(historyQuery);

  const handleAddItem = () => {
    setItems([...items, { materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InputItem, value: any) => {
    const newItems = [...items];
    if (field === 'materialId') {
      const selectedMat = (materials as any[])?.find(m => m.id === value);
      newItems[index] = {
        ...newItems[index],
        materialId: value,
        qtyKecilPerUnit: Number(selectedMat?.qtyKecil || 1),
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi dasar nomor nota & item terisi
    if (!nomorNota) {
      toast({
        variant: "destructive",
        title: "Nomor Nota Wajib Diisi",
        description: "Silakan masukkan nomor nota/invoice penerimaan barang.",
      });
      return;
    }

    const validItems = items.filter(item => item.materialId && item.qty > 0);
    if (validItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Bahan Baku Kosong",
        description: "Pilih minimal satu bahan baku dengan jumlah lebih dari 0.",
      });
      return;
    }

    // Validasi khusus Beli Sendiri: qtyKecilPerUnit wajib > 0
    for (const item of validItems) {
      const mat = (materials as any[])?.find(m => m.id === item.materialId);
      const isBeliSendiri = mat?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";
      
      if (isBeliSendiri && (!item.qtyKecilPerUnit || item.qtyKecilPerUnit <= 0)) {
        toast({
          variant: "destructive",
          title: "Isi Pack/Box Wajib Diisi",
          description: `Bahan "${mat?.nama || 'Terpilih'}" merupakan Beli Sendiri. Anda wajib menginput isi per ${mat?.satuanBesar || 'pack/box/pcs'} (> 0) untuk menyesuaikan beda berat/isi.`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const isTargetGudang = targetLocation === "gudang";
      
      // Siapkan data detail untuk log & update stok
      const logItems = validItems.map(item => {
        const material = (materials as any[])?.find(m => m.id === item.materialId);
        const currentMaterial = material || { qtyBesar: 0, qtyGudangKecil: 0, qtyKontainerBesar: 0, qtyKontainerKecil: 0, stockValue: 0 };
        const isBeliSendiri = material?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";
        
        const standardConversion = Number(material?.qtyKecil || 1);
        const actualConversion = isBeliSendiri 
          ? Number(item.qtyKecilPerUnit || material?.qtyKecil || 1) 
          : standardConversion;

        // Total isi unit kecil aktual yang dibeli dalam transaksi ini
        const totalSmallUnitsPurchased = item.qty * actualConversion;
        
        // Porsi bilangan BULAT untuk Satuan Besar & sisa desimal langsung dipindah ke Satuan Kecil
        const fullBulkUnits = Math.floor(totalSmallUnitsPurchased / (standardConversion || 1));
        const remainderSmallUnits = Math.round((totalSmallUnitsPurchased - (fullBulkUnits * standardConversion)) * 100) / 100;
        
        const pricePerKecil = actualConversion > 0 ? (item.price / actualConversion) : item.price;
        
        // Untuk kalkulasi HPP & nilai total stok
        const totalBulkEquivalent = standardConversion > 0 ? (totalSmallUnitsPurchased / standardConversion) : item.qty;
        const updated = applyPurchase(currentMaterial, totalBulkEquivalent, item.price);

        // Update stok di master (Gudang vs Kontainer) dan nilai stok
        const materialRef = doc(db, "bahan-baku", item.materialId);
        
        const priceHistoryEntry = {
          price: item.price,
          priceKecil: pricePerKecil,
          qtyKecilPerUnit: actualConversion,
          recordedAt: new Date().toISOString(),
          note: isBeliSendiri 
            ? `Beli Sendiri (${actualConversion} ${material?.satuanKecil || 'pcs'}/${material?.satuanBesar || 'pack'}) -> ${isTargetGudang ? 'Gudang Utama' : 'Kontainer'}`
            : `Pembelian Supliyer -> ${isTargetGudang ? 'Gudang Utama' : 'Kontainer'}`
        };

        const updatePayload: Record<string, any> = {
          stockValue: updated.stockValue,
          avgPrice: updated.avgPrice,
          currentPrice: item.price,
          hargaSatuanKecil: pricePerKecil,
          priceHistory: Array.isArray(material?.priceHistory) 
            ? [...material.priceHistory, priceHistoryEntry].slice(-10) 
            : [priceHistoryEntry],
        };

        // Satuan Besar SELALU BULAT! Dan sisa desimal masuk ke Satuan Kecil Gudang / Kontainer masing-masing
        if (isTargetGudang) {
          if (fullBulkUnits > 0) {
            updatePayload.qtyBesar = increment(fullBulkUnits);
          }
          if (remainderSmallUnits > 0) {
            updatePayload.qtyGudangKecil = increment(remainderSmallUnits);
          }
        } else {
          if (fullBulkUnits > 0) {
            updatePayload.qtyKontainerBesar = increment(fullBulkUnits);
          }
          if (remainderSmallUnits > 0) {
            updatePayload.qtyKontainerKecil = increment(remainderSmallUnits);
          }
        }

        batch.update(materialRef, updatePayload);

        return {
          materialId: item.materialId,
          materialName: material?.nama || "-",
          materialCode: material?.code || "-",
          isBeliSendiri: isBeliSendiri,
          qty: item.qty,
          addedBulkQty: fullBulkUnits,
          addedSmallUnits: remainderSmallUnits,
          unit: material?.satuanBesar || "-",
          qtyKecilPerUnit: actualConversion,
          satuanKecil: material?.satuanKecil || "-",
          totalQtyKecil: totalSmallUnitsPurchased,
          price: item.price,
          hargaSatuanKecil: pricePerKecil,
          avgPrice: updated.avgPrice,
          subtotal: item.qty * item.price,
        };
      });

      // Catat Log Pembelian
      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota: nomorNota,
        type: purchaseType,
        targetLocation: targetLocation,
        location: targetLocation,
        items: logItems,
        totalItems: logItems.length,
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      const locText = isTargetGudang ? "Gudang Utama" : "Kontainer";
      toast({
        title: "Nota Berhasil Disimpan",
        description: `Nota #${nomorNota} berhasil disimpan ke ${locText}.`,
      });

      // Reset Form
      setItems([{ materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
      setNomorNota("");
      
    } catch (error) {
      console.error("Gagal simpan nota masuk:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat menyimpan nota penerimaan.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (log: any) => {
    if (!confirm(`Hapus catatan nota #${log.nomorNota}? Stok bahan baku akan otomatis dikurangi sesuai rincian penerimaan nota ini.`)) return;

    try {
      const batch = writeBatch(db);
      const isTargetGudang = (log.targetLocation || log.location) === "gudang";

      if (Array.isArray(log.items)) {
        for (const item of log.items) {
          if (!item.materialId) continue;
          
          const materialRef = doc(db, "bahan-baku", item.materialId);
          
          let bulkToDeduct = 0;
          let smallToDeduct = 0;

          if (typeof item.addedBulkQty === 'number' || typeof item.addedSmallUnits === 'number') {
            bulkToDeduct = Number(item.addedBulkQty || 0);
            smallToDeduct = Number(item.addedSmallUnits || 0);
          } else {
            // Fallback untuk catatan nota lama
            const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
            const standardConversion = Number(matDetail?.qtyKecil || 1);
            const totalSmall = Number(item.totalQtyKecil || (item.qty * (item.qtyKecilPerUnit || standardConversion)));
            bulkToDeduct = Math.floor(totalSmall / (standardConversion || 1));
            smallToDeduct = Math.round((totalSmall - (bulkToDeduct * standardConversion)) * 100) / 100;
          }

          const subtotal = Number(item.subtotal || (item.qty * item.price) || 0);
          const updatePayload: Record<string, any> = {};

          if (subtotal > 0) {
            updatePayload.stockValue = increment(-subtotal);
          }

          if (isTargetGudang) {
            if (bulkToDeduct > 0) {
              updatePayload.qtyBesar = increment(-bulkToDeduct);
            }
            if (smallToDeduct > 0) {
              updatePayload.qtyGudangKecil = increment(-smallToDeduct);
            }
          } else {
            if (bulkToDeduct > 0) {
              updatePayload.qtyKontainerBesar = increment(-bulkToDeduct);
            }
            if (smallToDeduct > 0) {
              updatePayload.qtyKontainerKecil = increment(-smallToDeduct);
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            batch.update(materialRef, updatePayload);
          }
        }
      }

      // Hapus Dokumen Log
      const logRef = doc(db, "log_pembelian_bahan", log.id);
      batch.delete(logRef);

      await batch.commit();

      toast({
        title: "Nota Dihapus & Stok Dikurangi",
        description: `Nota #${log.nomorNota} telah dihapus dan stok bahan baku terkait telah dikurangi otomatis.`,
      });
    } catch (error) {
      console.error("Gagal menghapus nota & mengosongkan stok:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus Nota",
        description: "Terjadi kesalahan sistem saat memproses penghapusan nota.",
      });
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Input Bahan Baku</h1>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Penerimaan Barang ke Gudang / Kontainer • Terpisah Stok Kecil Gudang & Kontainer
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden">
            <div className="p-8 md:p-12">
              <form onSubmit={handleSave} className="space-y-10">
                {/* Selection: Tujuan Stok (Gudang Utama vs Kontainer) */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tujuan Stok (Lokasi Penambahan)</Label>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <Button 
                      type="button"
                      variant="ghost" 
                      onClick={() => setTargetLocation('gudang')}
                      className={cn(
                        "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                        targetLocation === 'gudang' ? "bg-white shadow-sm text-primary font-bold" : "text-slate-400"
                      )}
                    >
                      <Building2 className="h-4 w-4" /> Gudang Utama
                    </Button>
                    <Button 
                      type="button"
                      variant="ghost" 
                      onClick={() => setTargetLocation('kontainer')}
                      className={cn(
                        "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                        targetLocation === 'kontainer' ? "bg-white shadow-sm text-emerald-600 font-bold" : "text-slate-400"
                      )}
                    >
                      <Store className="h-4 w-4" /> Kontainer
                    </Button>
                  </div>
                </div>

                {/* Header Nota: Jenis Pembelian & Nomor Nota */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis Pembelian</Label>
                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setPurchaseType('supplier')}
                        className={cn(
                          "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                          purchaseType === 'supplier' ? "bg-white shadow-sm text-primary" : "text-slate-400"
                        )}
                      >
                        <Truck className="h-4 w-4" /> Supliyer
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setPurchaseType('belanja')}
                        className={cn(
                          "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                          purchaseType === 'belanja' ? "bg-white shadow-sm text-amber-600 font-bold" : "text-slate-400"
                        )}
                      >
                        <ShoppingCart className="h-4 w-4" /> Beli Sendiri
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nomor Nota / Invoice</Label>
                    <div className="relative">
                       <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                       <Input 
                         value={nomorNota}
                         onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                         className="rounded-2xl border-slate-100 h-14 bg-slate-50 pl-12 font-black text-slate-900 placeholder:font-bold"
                         placeholder="CONTOH: INV/2024/001"
                         required
                       />
                    </div>
                  </div>
                </div>

                {/* Banner Penjelasan Beli Sendiri */}
                {purchaseType === "belanja" && (
                  <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-black uppercase tracking-wide text-[10px]">Kategori Pembelian Beli Sendiri Aktif</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed">
                        Untuk Beli Sendiri, inputkan isi pack/box aktual. Satuan besar akan selalu bulat & sisa pecahan desimal akan otomatis dimigrasikan ke Satuan Kecil lokasi yang dipilih (Gudang/Kontainer).
                      </p>
                    </div>
                  </div>
                )}

                {/* Daftar Bahan Baku */}
                <div className="space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Rincian Bahan Baku</h3>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={handleAddItem}
                      className="h-10 text-[10px] font-black text-primary uppercase tracking-widest gap-2 hover:bg-primary/5"
                    >
                      <PlusCircle className="h-4 w-4" /> Tambah Item
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {items.map((item, index) => {
                      const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
                      const isBeliSendiri = matDetail?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";

                      return (
                        <div key={index} className={cn(
                          "flex flex-col md:flex-row gap-4 items-end p-6 rounded-[2rem] border transition-all animate-in fade-in slide-in-from-top-2",
                          isBeliSendiri ? "bg-amber-50/30 border-amber-200/60" : "bg-slate-50 border-slate-100"
                        )}>
                          {/* Choice of Material */}
                          <div className="flex-1 w-full space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pilih Bahan Baku</Label>
                              {matDetail && (
                                <span className={cn(
                                  "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                                  isBeliSendiri ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                                )}>
                                  {isBeliSendiri ? "Beli Sendiri" : "Supliyer"}
                                </span>
                              )}
                            </div>
                            <Select 
                              value={item.materialId} 
                              onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                            >
                              <SelectTrigger className="rounded-xl border-none h-12 bg-white shadow-sm font-bold text-slate-900">
                                <SelectValue placeholder="Pilih bahan baku..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-2xl">
                                {materials?.map((m: any) => (
                                  <SelectItem key={m.id} value={m.id} className="rounded-xl">
                                    {m.code} - {m.nama} {m.metodePembelian === "Beli Sendiri" ? " (Beli Sendiri)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                        {/* Mandatory Isi Pack/Box/Pcs Input for Beli Sendiri */}
                        {isBeliSendiri && (
                          <div className="w-full md:w-36 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-amber-700">
                                Isi per {matDetail?.satuanBesar || 'Kemasan'} <span className="text-rose-500">*</span>
                              </Label>
                            </div>
                            <div className="relative flex items-center">
                              <Input 
                                type="number" 
                                step="any"
                                value={item.qtyKecilPerUnit ?? matDetail?.qtyKecil ?? 1}
                                onChange={(e) => handleItemChange(index, 'qtyKecilPerUnit', Number(e.target.value))}
                                className="rounded-xl border-amber-300 focus:border-amber-500 h-12 bg-amber-50/70 font-black text-center text-amber-900 shadow-sm pr-12"
                                placeholder={String(matDetail?.qtyKecil || 1)}
                                required={isBeliSendiri}
                              />
                              <span className="absolute right-2.5 text-[9px] font-black uppercase text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded-md pointer-events-none">
                                {matDetail?.satuanKecil || 'Pcs'}
                              </span>
                            </div>
                          </div>
                        )}

                          {/* Purchase Quantity */}
                          <div className="w-full md:w-28 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Jumlah</Label>
                            <div className="relative">
                              <Input 
                                type="number" 
                                step="any"
                                value={item.qty}
                                onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))}
                                className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-center"
                              />
                            </div>
                          </div>

                          {/* Unit Display */}
                          <div className="w-full md:w-24 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Satuan</Label>
                            <div className="h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-[10px] font-black uppercase text-slate-400">
                              {matDetail?.satuanBesar || "-"}
                            </div>
                          </div>

                          {/* Harga Satuan per Unit Besar */}
                          <div className="w-full md:w-32 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">
                              Harga / {matDetail?.satuanBesar || 'Unit'}
                            </Label>
                            <Input
                              type="number"
                              step="any"
                              value={item.price || ""}
                              onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                              className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-center"
                              placeholder="0"
                            />
                          </div>

                          {/* Total Pembelian (Harga Satuan x Jumlah) */}
                          <div className="w-full md:w-36 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-emerald-700 truncate">Total Pembelian</Label>
                            <div className="h-12 flex items-center justify-center bg-emerald-50/80 rounded-xl border border-emerald-200/80 shadow-sm font-black text-emerald-900 text-sm px-2">
                              Rp {Number((item.qty || 0) * (item.price || 0)).toLocaleString('id-ID')}
                            </div>
                          </div>

                          {/* Action Button */}
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveItem(index)}
                            className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-600 transition-colors bg-white shadow-sm border-none shrink-0"
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
                    className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-primary/20 gap-3 transition-all active:scale-[0.98]"
                  >
                    {saving ? "Memproses Data..." : (
                      <>
                        <Save className="h-4 w-4" />
                        Simpan Nota & Update Stok ({targetLocation === 'gudang' ? 'Gudang Utama' : 'Kontainer'})
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

        {/* Sidebar Log Pembelian */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center gap-3 px-4">
            <History className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Nota Terakhir</h3>
          </div>

          <div className="space-y-4">
            {history && history.length > 0 ? history.map((log: any) => (
              <Card key={log.id} className="rounded-[2.5rem] bg-white border-none shadow-sm overflow-hidden group">
                <div 
                  className="p-6 cursor-pointer hover:bg-slate-50 transition-all flex items-center justify-between"
                  onClick={() => toggleExpand(log.id)}
                >
                  <div className="flex gap-4">
                    <div className={cn(
                      "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
                      log.type === 'supplier' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {log.type === 'supplier' ? <Truck className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{log.nomorNota}</h4>
                        <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider",
                          (log.targetLocation || log.location) === "gudang"
                            ? "bg-slate-100 text-slate-700 border border-slate-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        )}>
                          {(log.targetLocation || log.location) === "gudang" ? "Gudang Utama" : "Kontainer"}
                        </span>
                      </div>
                      <p className="text-xs font-black text-slate-900 uppercase italic mt-1">
                        {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString('id-ID') : 'Baru saja'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-primary uppercase">{log.totalItems} Bahan</p>
                    </div>
                    {expandedLog === log.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>

                {expandedLog === log.id && (
                  <div className="px-6 pb-6 pt-2 space-y-3 animate-in slide-in-from-top-4">
                    <div className="h-[1px] bg-slate-100 mb-4" />
                    {log.items?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[10px] bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                        <div className="flex flex-col">
                           <div className="flex items-center gap-1.5">
                             <span className="font-bold text-slate-400 text-[8px]">{item.materialCode}</span>
                             {item.isBeliSendiri && (
                               <span className="bg-amber-100 text-amber-800 text-[7px] font-black px-1 rounded uppercase">Beli Sendiri</span>
                             )}
                           </div>
                           <span className="font-black text-slate-800 uppercase italic">{item.materialName}</span>
                           {item.isBeliSendiri && item.qtyKecilPerUnit && (
                             <span className="text-[8px] text-amber-700 font-bold">
                               Isi: {item.qtyKecilPerUnit} {item.satuanKecil || 'pcs'}/{item.unit || 'pack'} (+{item.addedBulkQty || 0} {item.unit} & +{item.addedSmallUnits || 0} {item.satuanKecil})
                             </span>
                           )}
                        </div>
                        <div className="flex flex-col items-end">
                           <div className="flex items-center gap-1">
                             <span className="font-black text-primary tabular-nums">+{item.qty}</span>
                             <span className="font-bold text-slate-400 uppercase text-[8px]">{item.unit}</span>
                           </div>
                           <span className="text-[9px] font-bold text-slate-600">
                             Rp {Number(item.price || 0).toLocaleString('id-ID')}
                           </span>
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="ghost" 
                      onClick={() => handleDeleteLog(log)}
                      className="w-full mt-2 h-10 rounded-xl text-rose-500 hover:bg-rose-50 font-black uppercase text-[9px] tracking-widest gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hapus Nota & Kurangi Stok
                    </Button>
                  </div>
                )}
              </Card>
            )) : (
              <div className="py-32 text-center bg-white rounded-[3rem] opacity-30 flex flex-col items-center">
                <FileText className="h-12 w-12 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Belum ada nota masuk</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
