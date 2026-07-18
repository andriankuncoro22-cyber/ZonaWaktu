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
  Package,
  AlertCircle
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
  writeBatch,
  where,
  getDocs
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { applyPurchase } from "@/lib/hpp";

interface InputItem {
  materialId: string;
  qty: number;
  qtyKecilPerUnit?: number;
  price: number;
}

type ActiveTab = "pembelian" | "ambil" | "kembali" | "pemakaian";

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeInputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("pembelian");
  const [purchaseType] = useState<string>("belanja"); // Khusus Karyawan: Selalu Beli Sendiri
  const [nomorNota, setNomorNota] = useState<string>("");
  const [items, setItems] = useState<InputItem[]>([{ materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
  const [movementItems, setMovementItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [returnItems, setReturnItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [productionBatch, setProductionBatch] = useState([{ resepId: "", qty: 1 }]);
  const [selectedPemakaianDate, setSelectedPemakaianDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Fetch Master Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  const resepQuery = useMemoFirebase(() =>
    query(collection(db, "resep"), where("type", "==", "pelengkap")),
    [db]
  );
  const { data: listResep } = useCollection(resepQuery);

  // Fetch Histori Input Bahan (limit 100 untuk difilter secara client-side)
  const historyQuery = useMemoFirebase(() => 
    query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(100)), 
    [db]
  );
  const { data: history } = useCollection(historyQuery);

  const pemakaianHistoryQuery = useMemoFirebase(() =>
    query(collection(db, "log_produksi_pelengkap"), orderBy("createdAt", "desc"), limit(50)),
    [db]
  );
  const { data: pemakaianHistory } = useCollection(pemakaianHistoryQuery);

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
      case "pemakaian":
        return {
          key: "pemakaian",
          title: "Histori Input Pemakaian",
          icon: Package,
          accent: "bg-violet-50 text-violet-600",
          logs: pemakaianHistory || [],
        };
      default:
        return {
          key: "pembelian",
          title: "Histori Pembelian",
          icon: ShoppingCart,
          accent: "bg-amber-50 text-amber-600",
          logs: filteredHistory.filter((log: any) => log.type === "belanja" || log.type === "supplier"),
        };
    }
  }, [activeTab, history, pemakaianHistory]);

  const handleAddItem = () => {
    setItems([...items, { materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
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

  const handleAddProductionItem = () => {
    setProductionBatch([...productionBatch, { resepId: "", qty: 1 }]);
  };

  const handleRemoveProductionItem = (index: number) => {
    if (productionBatch.length === 1) return;
    setProductionBatch(productionBatch.filter((_, i) => i !== index));
  };

  const handleProductionItemChange = (index: number, field: "resepId" | "qty", value: any) => {
    const newBatch = [...productionBatch];
    newBatch[index] = { ...newBatch[index], [field]: value } as { resepId: string; qty: number };
    setProductionBatch(newBatch);
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

  const handleSavePemakaian = async (e: React.FormEvent) => {
    e.preventDefault();

    const validBatch = productionBatch.filter((item) => item.resepId && item.qty > 0);
    if (validBatch.length === 0) {
      toast({
        variant: "destructive",
        title: "Input Tidak Lengkap",
        description: "Pilih minimal satu pemakaian bahan dan tentukan jumlahnya.",
      });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const materialsSnap = await getDocs(collection(db, "bahan-baku"));
      const materialMap: { [key: string]: any } = {};
      materialsSnap.forEach((d) => {
        materialMap[d.id] = { id: d.id, ...d.data() };
      });

      const totalDeductions: { [key: string]: number } = {};
      const totalAdditions: { [key: string]: number } = {};

      validBatch.forEach((item) => {
        const resep = listResep?.find((entry: any) => entry.id === item.resepId);
        if (!resep) return;

        resep.komposisi?.forEach((ing: any) => {
          const deduction = ing.jumlah * item.qty;
          totalDeductions[ing.bahanBakuId] = (totalDeductions[ing.bahanBakuId] || 0) + deduction;
        });

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
      });

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

        const addition = totalAdditions[matId] || 0;
        bulkQty += addition;

        const deduction = totalDeductions[matId] || 0;
        activeQty -= deduction;

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
        items: validBatch.map((item) => ({
          resepId: item.resepId,
          namaResep: listResep?.find((entry: any) => entry.id === item.resepId)?.namaPelengkap,
          jumlah: item.qty
        })),
        tanggal: selectedPemakaianDate,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast({
        title: "Pemakaian Dicatat",
        description: `${validBatch.length} jenis bahan telah dicatat & stok terpotong.`,
      });
      setProductionBatch([{ resepId: "", qty: 1 }]);
    } catch (error) {
      console.error("Gagal simpan pemakaian:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat mencatat pemakaian.",
      });
    } finally {
      setSaving(false);
    }
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

    // Validasi Beli Sendiri: qtyKecilPerUnit wajib > 0
    for (const item of validItems) {
      const mat = (materials as any[])?.find(m => m.id === item.materialId);
      if (!item.qtyKecilPerUnit || item.qtyKecilPerUnit <= 0) {
        toast({
          variant: "destructive",
          title: "Isi Pack/Box Wajib Diisi",
          description: `Bahan "${mat?.nama || 'Terpilih'}" wajib menginput isi per ${mat?.satuanBesar || 'pack/box/pcs'} (> 0).`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      // Pada halaman Employee: Selalu Beli Sendiri & masuk ke Area Kontainer
      const logItems = validItems.map(item => {
        const material = (materials as any[])?.find(m => m.id === item.materialId);
        const currentMaterial = material || { qtyBesar: 0, qtyKontainerBesar: 0, qtyKontainerKecil: 0, stockValue: 0 };
        
        const standardConversion = Number(material?.qtyKecil || 1);
        const actualConversion = Number(item.qtyKecilPerUnit || material?.qtyKecil || 1);

        const totalSmallUnitsPurchased = item.qty * actualConversion;
        const fullBulkUnits = Math.floor(totalSmallUnitsPurchased / (standardConversion || 1));
        const remainderSmallUnits = Math.round((totalSmallUnitsPurchased - (fullBulkUnits * standardConversion)) * 100) / 100;
        
        const pricePerKecil = actualConversion > 0 ? (item.price / actualConversion) : item.price;
        const totalBulkEquivalent = standardConversion > 0 ? (totalSmallUnitsPurchased / standardConversion) : item.qty;
        const updated = applyPurchase(currentMaterial, totalBulkEquivalent, item.price);

        const materialRef = doc(db, "bahan-baku", item.materialId);
        
        const priceHistoryEntry = {
          price: item.price,
          priceKecil: pricePerKecil,
          qtyKecilPerUnit: actualConversion,
          recordedAt: new Date().toISOString(),
          note: `Beli Sendiri Karyawan (${actualConversion} ${material?.satuanKecil || 'pcs'}/${material?.satuanBesar || 'pack'}) -> Area Kontainer`
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

        if (fullBulkUnits > 0) {
          updatePayload.qtyKontainerBesar = increment(fullBulkUnits);
        }
        if (remainderSmallUnits > 0) {
          updatePayload.qtyKontainerKecil = increment(remainderSmallUnits);
        }

        batch.update(materialRef, updatePayload);

        return {
          materialId: item.materialId,
          materialName: material?.nama || "-",
          materialCode: material?.code || "-",
          isBeliSendiri: true,
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

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota: nomorNota,
        type: "belanja",
        targetLocation: "kontainer",
        location: "kontainer",
        items: logItems,
        totalItems: logItems.length,
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Nota Beli Sendiri Disimpan",
        description: `Nota #${nomorNota} dengan ${logItems.length} bahan telah ditambahkan ke Stok Area Kontainer.`,
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

  const toggleExpand = (id: string) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  // Revert stok saat menghapus log nota masuk
  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Hapus catatan nota ini dan kembalikan/kurangi stok kontainer?")) return;
    setSaving(true);
    try {
      const logDocRef = doc(db, "log_pembelian_bahan", logId);
      const logSnap = await getDoc(logDocRef);
      if (!logSnap.exists()) return;
      const logData = logSnap.data();

      const batch = writeBatch(db);

      logData.items?.forEach((item: any) => {
        const materialRef = doc(db, "bahan-baku", item.materialId);
        
        let bulkToDeduct = 0;
        let smallToDeduct = 0;

        if (typeof item.addedBulkQty === 'number' || typeof item.addedSmallUnits === 'number') {
          bulkToDeduct = Number(item.addedBulkQty || 0);
          smallToDeduct = Number(item.addedSmallUnits || 0);
        } else {
          const matDetail = (materials as any[])?.find(m => m.id === item.materialId);
          const standardConversion = Number(matDetail?.qtyKecil || 1);
          const totalSmall = Number(item.totalQtyKecil || (item.qty * (item.qtyKecilPerUnit || standardConversion)));
          bulkToDeduct = Math.floor(totalSmall / (standardConversion || 1));
          smallToDeduct = Math.round((totalSmall - (bulkToDeduct * standardConversion)) * 100) / 100;
        }

        const updatePayload: Record<string, any> = {};
        const subtotal = Number(item.subtotal || (item.qty * item.price) || 0);

        if (subtotal > 0) {
          updatePayload.stockValue = increment(-subtotal);
        }
        if (bulkToDeduct > 0) {
          updatePayload.qtyKontainerBesar = increment(-bulkToDeduct);
        }
        if (smallToDeduct > 0) {
          updatePayload.qtyKontainerKecil = increment(-smallToDeduct);
        }

        if (Object.keys(updatePayload).length > 0) {
          batch.update(materialRef, updatePayload);
        }
      });

      batch.delete(logDocRef);
      await batch.commit();

      toast({ 
        title: "Nota Dihapus & Stok Dikurangi", 
        description: "Catatan nota berhasil dihapus dan stok kontainer telah ditarik balik." 
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
          qtyBesar: increment(-item.qty)
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
          qtyBesar: increment(item.qty)
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
          <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Input Bahan Baku</h1>
          <p className="text-[9px] sm:text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Area Kontainer Operasional • Khusus Pembelian Beli Sendiri (Stok Kontainer)
          </p>
        </div>
      </div>

      <div className="space-y-6 sm:space-y-8">
        <Card className="rounded-[1.5rem] sm:rounded-[3rem] border-none shadow-sm bg-white overflow-hidden">
          <div className="p-3 sm:p-8">
            <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-2 sm:flex-row sm:flex-wrap">
              {[
                { key: "pembelian", label: "Pembelian Bahan Baku" },
                { key: "pemakaian", label: "Input Pemakaian" },
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
              {/* Header Nota: Jenis Pembelian (Beli Sendiri) & Nomor Nota */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                <div className="space-y-2">
                  <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Jenis Pembelian & Tujuan Stok</Label>
                  <div className="flex bg-amber-50/70 p-1.5 rounded-2xl border border-amber-200/60 items-center justify-between px-4 h-12">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-amber-600" /> Beli Sendiri
                    </span>
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                      → Stok Kontainer
                    </span>
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

              {/* Banner Penjelasan Beli Sendiri */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black uppercase tracking-wide text-[10px]">Kategori Pembelian Beli Sendiri Aktif</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed">
                    Setiap pembelian bahan baku oleh karyawan diperuntukkan untuk <strong>Beli Sendiri</strong> dan stok otomatis <strong>masuk langsung ke Area Kontainer</strong>. Harap periksa & sesuaikan isi per pack/box jika berbeda dari ukuran standar.
                  </p>
                </div>
              </div>

              {/* Daftar Bahan Baku */}
              <div className="space-y-4 sm:space-y-6 pt-4 border-t border-slate-50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                  <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Rincian Bahan Baku (Beli Sendiri)</h3>
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
                      <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-center bg-amber-50/40 p-4 sm:p-5 rounded-[1.5rem] border border-amber-200/60 transition-all animate-in fade-in slide-in-from-top-2">
                        {/* Pilih Bahan Baku */}
                        <div className="flex-1 w-full space-y-1.5">
                          <div className="flex items-center gap-2 h-5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pilih Bahan Baku</Label>
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200/60">
                              Beli Sendiri
                            </span>
                          </div>
                          <Select 
                            value={item.materialId} 
                            onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                          >
                            <SelectTrigger className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-slate-900 text-xs sm:text-sm">
                              <SelectValue placeholder="Pilih bahan baku..." />
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
                        
                        {/* Isi per Pack/Box/Sak (Unit Suffix Integrated inside Input) */}
                        <div className="w-full md:w-36 space-y-1.5">
                          <div className="flex items-center h-5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-amber-800 truncate">
                              Isi per {matDetail?.satuanBesar || 'Kemasan'} <span className="text-rose-500">*</span>
                            </Label>
                          </div>
                          <div className="relative flex items-center">
                            <Input 
                              type="number" 
                              step="any"
                              value={item.qtyKecilPerUnit ?? matDetail?.qtyKecil ?? 1}
                              onChange={(e) => handleItemChange(index, 'qtyKecilPerUnit', Number(e.target.value))}
                              className="rounded-xl border-amber-300 focus:border-amber-500 h-12 bg-amber-50/80 font-black text-center text-amber-900 text-sm sm:text-base shadow-sm pr-12"
                              placeholder={String(matDetail?.qtyKecil || 1)}
                              required
                            />
                            <span className="absolute right-2.5 text-[9px] font-black uppercase text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded-md pointer-events-none">
                              {matDetail?.satuanKecil || 'Pcs'}
                            </span>
                          </div>
                        </div>

                        {/* Jumlah */}
                        <div className="w-full md:w-28 space-y-1.5">
                          <div className="flex items-center h-5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">Jumlah</Label>
                          </div>
                          <Input 
                            type="number" 
                            step="any"
                            value={item.qty || ""}
                            onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))}
                            className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-center text-sm sm:text-base md:text-lg"
                            placeholder="0"
                          />
                        </div>

                        {/* Satuan Besar */}
                        <div className="w-full md:w-24 space-y-1.5">
                           <div className="flex items-center h-5">
                             <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">Satuan</Label>
                           </div>
                           <div className="h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-[11px] md:text-xs font-black uppercase text-slate-700">
                              {matDetail?.satuanBesar || "-"}
                           </div>
                        </div>

                        {/* Harga Satuan per Unit Besar */}
                        <div className="w-full md:w-32 space-y-1.5">
                          <div className="flex items-center h-5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">
                              Harga / {matDetail?.satuanBesar || 'Unit'}
                            </Label>
                          </div>
                          <Input
                             type="text"
                             inputMode="numeric"
                             value={item.price === 0 ? "" : formatThousand(item.price)}
                             onChange={(e) => handleItemChange(index, 'price', Number(e.target.value.replace(/\D/g, "")) || 0)}
                             className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-center text-sm sm:text-base"
                             placeholder="0"
                           />
                        </div>

                        {/* Total Pembelian (Harga Satuan x Jumlah) */}
                        <div className="w-full md:w-36 space-y-1.5">
                          <div className="flex items-center h-5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-700 truncate">Total Pembelian</Label>
                          </div>
                          <div className="h-12 flex items-center justify-center bg-emerald-50/80 rounded-xl border border-emerald-200/80 shadow-sm font-black text-emerald-900 text-sm sm:text-base px-2">
                            Rp {Number((item.qty || 0) * (item.price || 0)).toLocaleString('id-ID')}
                          </div>
                        </div>

                        {/* Delete Action */}
                        <div className="flex items-end pt-6 md:pt-0">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveItem(index)}
                            className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors bg-white shadow-sm border-none shrink-0"
                            disabled={items.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
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
                      Simpan Nota Beli Sendiri & Masuk Stok Kontainer
                    </>
                  )}
                </Button>
              </div>
            </form>
            )}

            {activeTab === "pemakaian" && (
              <form onSubmit={handleSavePemakaian} className="mt-6 sm:mt-8 space-y-6 sm:space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Tanggal Operasional</Label>
                    <Input
                      type="date"
                      value={selectedPemakaianDate}
                      onChange={(e) => setSelectedPemakaianDate(e.target.value)}
                      className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 font-black text-sm sm:text-base text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Rincian Pemakaian Bahan / Pelengkap</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleAddProductionItem}
                      className="h-10 w-full sm:w-auto text-[10px] font-black text-primary uppercase tracking-widest gap-2 hover:bg-primary/5"
                    >
                      <PlusCircle className="h-4 w-4" /> Tambah Baris
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {productionBatch.map((item, index) => (
                      <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-slate-50 p-4 sm:p-6 rounded-[1.25rem] sm:rounded-[2rem] border border-slate-100">
                        <div className="flex-1 w-full space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Pilih Bahan / Resep Pelengkap</Label>
                          <Select
                            value={item.resepId}
                            onValueChange={(val) => handleProductionItemChange(index, "resepId", val)}
                          >
                            <SelectTrigger className="rounded-xl border-none h-12 bg-white shadow-sm font-black text-slate-900 text-sm md:text-base">
                              <SelectValue placeholder="Pilih..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                              {listResep?.map((r: any) => (
                                <SelectItem key={r.id} value={r.id} className="rounded-xl">
                                  {r.namaPelengkap}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-full md:w-32 space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">Jumlah Bikin/Pakai</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleProductionItemChange(index, "qty", Number(e.target.value))}
                            className="rounded-xl border-none h-11 sm:h-12 bg-white shadow-sm font-black text-center text-sm sm:text-base md:text-lg"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveProductionItem(index)}
                          className="h-11 sm:h-12 w-full sm:w-12 rounded-xl text-slate-300 hover:text-rose-600 transition-colors bg-white shadow-sm border-none"
                          disabled={productionBatch.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <Button
                    disabled={saving || productionBatch.some((i) => !i.resepId)}
                    className="w-full h-14 sm:h-16 rounded-[1.25rem] sm:rounded-[1.5rem] bg-violet-600 hover:bg-violet-700 text-white font-black uppercase tracking-[0.2em] text-[10px] sm:text-[11px] shadow-xl shadow-violet-200 gap-2 sm:gap-3 transition-all active:scale-[0.98]"
                  >
                    {saving ? "Memproses Data..." : (
                      <>
                        <Save className="h-4 w-4" />
                        Simpan & Potong Stok Kontainer
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "ambil" && (
              <form onSubmit={handleTakeFromWarehouse} className="mt-6 sm:mt-8 space-y-6 sm:space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Nomor Referensi / Catatan</Label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        value={nomorNota}
                        onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                        className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 pl-12 font-black text-sm sm:text-base md:text-lg text-slate-900"
                        placeholder="CONTOH: AMBIL-001"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Barang Diambil Dari Gudang</h3>
                    <Button type="button" variant="ghost" onClick={handleAddMovementItem} className="h-10 text-[10px] font-black text-primary uppercase tracking-widest gap-2">
                      <PlusCircle className="h-4 w-4" /> Tambah Item
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {movementItems.map((item, index) => (
                      <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-slate-50 p-4 sm:p-6 rounded-[1.25rem] sm:rounded-[2rem] border border-slate-100">
                        <div className="flex-1 w-full space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase text-slate-500">Pilih Bahan</Label>
                          <Select value={item.materialId} onValueChange={(val) => handleMovementItemChange(index, "materialId", val)}>
                            <SelectTrigger className="rounded-xl border-none h-12 bg-white font-black">
                              <SelectValue placeholder="Pilih..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                              {materials?.map((m: any) => (
                                <SelectItem key={m.id} value={m.id} className="rounded-xl">
                                  {m.code} - {m.nama} (Stok Gudang: {m.qtyBesar || 0} {m.satuanBesar})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-full md:w-32 space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase text-slate-500">Jumlah Dipindah</Label>
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => handleMovementItemChange(index, "qty", Number(e.target.value))}
                            className="rounded-xl border-none h-12 bg-white font-black text-center"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveMovementItem(index)} className="h-12 w-12 rounded-xl text-slate-300" disabled={movementItems.length === 1}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button disabled={saving || movementItems.some((i) => !i.materialId)} className="w-full h-14 bg-amber-600 text-white font-black uppercase text-[10px] tracking-widest">
                  Simpan Pengambilan Gudang
                </Button>
              </form>
            )}

            {activeTab === "kembali" && (
              <form onSubmit={handleReturnToWarehouse} className="mt-6 sm:mt-8 space-y-6 sm:space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                  <div className="space-y-2">
                    <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">Nomor Referensi Pengembalian</Label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        value={nomorNota}
                        onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                        className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 pl-12 font-black text-sm sm:text-base md:text-lg text-slate-900"
                        placeholder="CONTOH: RET-001"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-6 pt-4 border-t border-slate-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
                    <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">Barang Dikembalikan Ke Gudang</h3>
                    <Button type="button" variant="ghost" onClick={handleAddReturnItem} className="h-10 text-[10px] font-black text-primary uppercase tracking-widest gap-2">
                      <PlusCircle className="h-4 w-4" /> Tambah Item
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {returnItems.map((item, index) => (
                      <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-slate-50 p-4 sm:p-6 rounded-[1.25rem] sm:rounded-[2rem] border border-slate-100">
                        <div className="flex-1 w-full space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase text-slate-500">Pilih Bahan</Label>
                          <Select value={item.materialId} onValueChange={(val) => handleReturnItemChange(index, "materialId", val)}>
                            <SelectTrigger className="rounded-xl border-none h-12 bg-white font-black">
                              <SelectValue placeholder="Pilih..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl">
                              {materials?.map((m: any) => (
                                <SelectItem key={m.id} value={m.id} className="rounded-xl">
                                  {m.code} - {m.nama} (Stok Kontainer: {m.qtyKontainerBesar || 0} {m.satuanBesar})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-full md:w-32 space-y-2">
                          <Label className="text-[10px] md:text-[11px] font-black uppercase text-slate-500">Jumlah Dikembalikan</Label>
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => handleReturnItemChange(index, "qty", Number(e.target.value))}
                            className="rounded-xl border-none h-12 bg-white font-black text-center"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveReturnItem(index)} className="h-12 w-12 rounded-xl text-slate-300" disabled={returnItems.length === 1}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button disabled={saving || returnItems.some((i) => !i.materialId)} className="w-full h-14 bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest">
                  Simpan Pengembalian Ke Gudang
                </Button>
              </form>
            )}
          </div>
        </Card>

        {/* Histori Nota */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
              {activeHistorySection.title}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeHistorySection.logs && activeHistorySection.logs.length > 0 ? (
              activeHistorySection.logs.map((log: any) => {
                const IconComponent = activeHistorySection.icon;
                return (
                  <Card key={log.id} className="rounded-3xl bg-white border-none shadow-sm overflow-hidden p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-3 rounded-2xl", activeHistorySection.accent)}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div>
                          {activeTab === "pemakaian" ? (
                            <>
                              <h4 className="text-xs font-black text-slate-900 uppercase">Produksi Pelengkap</h4>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">
                                {log.tanggal ? new Date(log.tanggal).toLocaleDateString('id-ID') : 'Hari ini'}
                              </p>
                            </>
                          ) : (
                            <>
                              <h4 className="text-xs font-black text-slate-900 uppercase">#{log.nomorNota}</h4>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">
                                {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString('id-ID') : 'Baru saja'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      {activeTab === "pembelian" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteLog(log.id)}
                          className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-slate-50 pt-3">
                      {log.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-[10px] bg-slate-50 p-2.5 rounded-xl">
                          {activeTab === "pemakaian" ? (
                            <>
                              <span className="font-bold text-slate-700 uppercase">{item.namaResep || "Pelengkap"}</span>
                              <span className="font-black text-violet-600">{item.jumlah} Resep</span>
                            </>
                          ) : (
                            <>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700 uppercase">{item.materialName}</span>
                                {item.isBeliSendiri && item.qtyKecilPerUnit && (
                                  <span className="text-[8px] text-amber-700 font-bold">
                                    Isi: {item.qtyKecilPerUnit} {item.satuanKecil || 'pcs'}/{item.unit || 'pack'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900">+{item.qty} {item.unit}</span>
                                {item.price > 0 && (
                                  <span className="font-bold text-slate-400">Rp {item.price.toLocaleString("id-ID")}</span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center bg-white rounded-3xl opacity-40">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Belum Ada Histori</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
