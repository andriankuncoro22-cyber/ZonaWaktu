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
  FileText
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
  price: number;
}

export default function InputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [purchaseType, setPurchaseType] = useState<string>("supplier");
  const [nomorNota, setNomorNota] = useState<string>("");
  const [items, setItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch Master Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  // Fetch Histori Input Bahan
  const historyQuery = useMemoFirebase(() => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(10)), [db]);
  const { data: history } = useCollection(historyQuery);

  const handleAddItem = () => {
    setItems([...items, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InputItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
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
        const currentMaterial = material || { qtyBesar: 0, qtyKontainerBesar: 0, qtyKontainerKecil: 0, stockValue: 0 };
        const updated = applyPurchase(currentMaterial, item.qty, item.price);

        // Update stok di master (tambah Qty Besar) dan nilai stok
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyBesar: increment(item.qty),
          stockValue: updated.stockValue,
          avgPrice: updated.avgPrice,
          currentPrice: item.price,
          priceHistory: Array.isArray(material?.priceHistory) ? [...material.priceHistory, { price: item.price, recordedAt: new Date().toISOString(), note: "Pembelian bahan" }].slice(-10) : [{ price: item.price, recordedAt: new Date().toISOString(), note: "Pembelian bahan" }],
        });

        return {
          materialId: item.materialId,
          materialName: material.nama,
          materialCode: material.code,
          qty: item.qty,
          unit: material.satuanBesar,
          purchasePrice: item.price,
          avgPrice: updated.avgPrice,
        };
      });

      // Catat Log Pembelian
      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota: nomorNota,
        type: purchaseType,
        items: logItems,
        totalItems: logItems.length,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Nota Berhasil Disimpan",
        description: `Nota #${nomorNota} dengan ${logItems.length} bahan telah ditambahkan.`,
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

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Input Bahan Baku</h1>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Penerimaan Barang & Update Stok Besar per Nota
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden">
            <div className="p-8 md:p-12">
              <form onSubmit={handleSave} className="space-y-10">
                {/* Header Nota */}
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
                        <Truck className="h-4 w-4" /> Supplier
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setPurchaseType('belanja')}
                        className={cn(
                          "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                          purchaseType === 'belanja' ? "bg-white shadow-sm text-primary" : "text-slate-400"
                        )}
                      >
                        <ShoppingCart className="h-4 w-4" /> Belanja
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
                      return (
                        <div key={index} className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 p-6 rounded-[2rem] border border-slate-100 group transition-all animate-in fade-in slide-in-from-top-2">
                          <div className="flex-1 w-full space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pilih Bahan Baku</Label>
                            <Select 
                              value={item.materialId} 
                              onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                            >
                              <SelectTrigger className="rounded-xl border-none h-12 bg-white shadow-sm font-bold text-slate-900">
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

                          <div className="w-full md:w-24 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Satuan</Label>
                            <div className="h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-[10px] font-black uppercase text-slate-400">
                              {matDetail?.satuanBesar || "-"}
                            </div>
                          </div>

                          <div className="w-full md:w-32 space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Harga Pembelian</Label>
                            <Input
                              type="number"
                              step="any"
                              value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', Number(e.target.value))}
                              className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-center"
                              placeholder="0"
                            />
                          </div>

                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveItem(index)}
                            className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-600 transition-colors bg-white shadow-sm border-none"
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
                        Simpan Nota & Update Stok
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

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
                      log.type === 'supplier' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                    )}>
                      {log.type === 'supplier' ? <Truck className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{log.nomorNota}</h4>
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
                           <span className="font-bold text-slate-400 text-[8px]">{item.materialCode}</span>
                           <span className="font-black text-slate-800 uppercase italic">{item.materialName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="font-black text-primary tabular-nums">+{item.qty}</span>
                           <span className="font-bold text-slate-400 uppercase text-[8px]">{item.unit}</span>
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="ghost" 
                      onClick={async () => {
                         if(confirm("Hapus catatan nota ini?")) {
                           await deleteDoc(doc(db, "log_pembelian_bahan", log.id));
                           toast({ title: "Nota dihapus" });
                         }
                      }}
                      className="w-full mt-2 h-10 rounded-xl text-rose-500 hover:bg-rose-50 font-black uppercase text-[9px] tracking-widest gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hapus Nota
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
