"use client";

import React, { useState, useMemo } from "react";
import { 
  Gift, 
  PlusCircle, 
  Save, 
  History, 
  Trash2, 
  Coffee, 
  Users,
  Search,
  AlertCircle,
  AlertTriangle,
  Sparkles
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  doc, 
  deleteDoc, 
  updateDoc, 
  getDocs, 
  where 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FreeItemInput {
  productId: string;
  qty: number;
}

const formatCurrency = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function EmployeeInputFreePage() {
  const db = useFirestore();
  const { toast } = useToast();

  // Active Tab: "input" | "riwayat"
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("input");

  // Form State
  const [shift, setShift] = useState<1 | 2>(1);
  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<FreeItemInput[]>([{ productId: "", qty: 1 }]);
  const [saving, setSaving] = useState(false);

  // History Tab Filter
  const currentMonthStr = new Date().toISOString().substring(0, 7);
  const [historyMonth, setHistoryMonth] = useState<string>(currentMonthStr);
  const [historySearch, setHistorySearch] = useState<string>("");
  const [selectedDetailKaryawan, setSelectedDetailKaryawan] = useState<any | null>(null);

  // Fetch Katalog Produk
  const productsQuery = useMemoFirebase(() => query(collection(db, "produk"), orderBy("nama", "asc")), [db]);
  const { data: listProduk } = useCollection(productsQuery);

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: listKaryawan } = useCollection(karyawanQuery);

  // Fetch All Input Free Logs (for quota calculation & history)
  const allFreeLogsQuery = useMemoFirebase(() => 
    query(collection(db, "input-free"), orderBy("createdAt", "desc")), 
    [db]
  );
  const { data: rawAllLogs } = useCollection(allFreeLogsQuery);

  // Parse and sort all logs
  const allFreeLogs = useMemo(() => {
    if (!rawAllLogs) return [];
    return [...rawAllLogs].sort((a: any, b: any) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [rawAllLogs]);

  // Calculate Monthly Usage per Employee for Selected Date's Month (Form Validation)
  const selectedFormMonth = selectedDate.substring(0, 7);
  const formMonthUsageMap = useMemo(() => {
    const map: Record<string, { totalQty: number; totalNominal: number; items: any[] }> = {};
    allFreeLogs.forEach((log: any) => {
      const tgl = log.tanggal || "";
      if (tgl.startsWith(selectedFormMonth)) {
        const kId = log.karyawanId;
        if (!map[kId]) map[kId] = { totalQty: 0, totalNominal: 0, items: [] };
        (log.items || []).forEach((it: any) => {
          const q = Number(it.qty || 0);
          map[kId].totalQty += q;
          map[kId].totalNominal += Number(it.subtotal || (Number(it.harga || 0) * q));
          map[kId].items.push({
            ...it,
            tanggal: tgl,
            shift: log.shift,
            logId: log.id
          });
        });
      }
    });
    return map;
  }, [allFreeLogs, selectedFormMonth]);

  // Selected Employee in Form
  const selectedKaryawanObj = useMemo(() => {
    return (listKaryawan as any[])?.find((k: any) => k.id === selectedKaryawanId) || null;
  }, [listKaryawan, selectedKaryawanId]);

  const selectedKaryawanQuota = Number(selectedKaryawanObj?.freeQuota ?? selectedKaryawanObj?.quotaFreeBulanan ?? 0);
  const selectedKaryawanUsed = formMonthUsageMap[selectedKaryawanId]?.totalQty || 0;
  const currentFormTotalQty = items.reduce((sum, i) => sum + (i.productId && i.qty > 0 ? Number(i.qty) : 0), 0);
  
  // Quota validation booleans
  const isQuotaConfigured = selectedKaryawanQuota > 0;
  const isQuotaAlreadyFull = isQuotaConfigured && (selectedKaryawanUsed >= selectedKaryawanQuota);
  const isExceedingQuota = isQuotaConfigured && (selectedKaryawanUsed + currentFormTotalQty > selectedKaryawanQuota);

  // Monthly Usage Map for History Tab
  const historyMonthUsageMap = useMemo(() => {
    const map: Record<string, { totalQty: number; totalNominal: number; items: any[] }> = {};
    allFreeLogs.forEach((log: any) => {
      const tgl = log.tanggal || "";
      if (tgl.startsWith(historyMonth)) {
        const kId = log.karyawanId;
        if (!map[kId]) map[kId] = { totalQty: 0, totalNominal: 0, items: [] };
        (log.items || []).forEach((it: any) => {
          const q = Number(it.qty || 0);
          map[kId].totalQty += q;
          map[kId].totalNominal += Number(it.subtotal || (Number(it.harga || 0) * q));
          map[kId].items.push({
            ...it,
            tanggal: tgl,
            shift: log.shift,
            logId: log.id,
            createdAt: log.createdAt
          });
        });
      }
    });
    return map;
  }, [allFreeLogs, historyMonth]);

  // Logs filtered by history month
  const historyMonthLogs = useMemo(() => {
    return allFreeLogs.filter((log: any) => {
      const tgl = log.tanggal || "";
      const matchesMonth = tgl.startsWith(historyMonth);
      if (!matchesMonth) return false;
      if (!historySearch) return true;
      const term = historySearch.toLowerCase();
      const matchKaryawan = log.karyawanNama?.toLowerCase().includes(term);
      const matchProduct = (log.items || []).some((it: any) => it.productName?.toLowerCase().includes(term));
      return matchKaryawan || matchProduct;
    });
  }, [allFreeLogs, historyMonth, historySearch]);

  // Summary statistics for History tab
  const historyStats = useMemo(() => {
    let totalQty = 0;
    let totalNominal = 0;
    let activeEmployees = 0;
    let fullQuotaEmployees = 0;

    (listKaryawan as any[])?.forEach((k: any) => {
      const usage = historyMonthUsageMap[k.id];
      const q = usage?.totalQty || 0;
      const nom = usage?.totalNominal || 0;
      const quota = Number(k.freeQuota ?? k.quotaFreeBulanan ?? 0);

      if (q > 0) activeEmployees++;
      if (quota > 0 && q >= quota) fullQuotaEmployees++;

      totalQty += q;
      totalNominal += nom;
    });

    return { totalQty, totalNominal, activeEmployees, fullQuotaEmployees };
  }, [listKaryawan, historyMonthUsageMap]);

  // Today's Logs for bottom list on Input tab
  const todayLogs = useMemo(() => {
    return allFreeLogs.filter((log: any) => log.tanggal === selectedDate);
  }, [allFreeLogs, selectedDate]);

  const totalFreeToday = useMemo(() => {
    return todayLogs.reduce((sum, log: any) => sum + Number(log.totalNominal || 0), 0);
  }, [todayLogs]);

  const handleAddItem = () => {
    setItems([...items, { productId: "", qty: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof FreeItemInput, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const batchTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      if (!item.productId || item.qty <= 0) return sum;
      const prod = (listProduk as any[])?.find((p: any) => p.id === item.productId);
      const price = Number(prod?.hargaJual ?? prod?.harga ?? 0);
      return sum + (price * item.qty);
    }, 0);
  }, [items, listProduk]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Karyawan Belum Dipilih",
        description: "Silakan pilih nama karyawan yang mengambil produk free.",
      });
      return;
    }

    if (isQuotaAlreadyFull) {
      toast({
        variant: "destructive",
        title: "Kuota Free Habis",
        description: `Karyawan ${selectedKaryawanObj?.nama || ""} telah mencapai batas maksimal kuota Free bulan ini (${selectedKaryawanUsed}/${selectedKaryawanQuota} produk).`,
      });
      return;
    }

    if (isExceedingQuota) {
      toast({
        variant: "destructive",
        title: "Melebihi Kuota",
        description: `Sisa kuota hanya ${selectedKaryawanQuota - selectedKaryawanUsed} produk, formulir saat ini memilih ${currentFormTotalQty} produk.`,
      });
      return;
    }

    const validItems = items.filter(i => i.productId && i.qty > 0);
    if (validItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Produk Kosong",
        description: "Pilih minimal satu produk dengan jumlah lebih dari 0.",
      });
      return;
    }

    setSaving(true);
    try {
      const karyawanNama = (listKaryawan as any[])?.find((k: any) => k.id === selectedKaryawanId)?.nama || "-";

      const formattedItems = validItems.map(item => {
        const prod = (listProduk as any[])?.find((p: any) => p.id === item.productId);
        const harga = Number(prod?.hargaJual ?? prod?.harga ?? 0);
        return {
          productId: item.productId,
          productCode: prod?.code || "-",
          productName: prod?.nama || "Produk",
          kategori: prod?.kategori || "-",
          harga: harga,
          qty: Number(item.qty),
          subtotal: harga * Number(item.qty),
        };
      });

      const totalNominal = formattedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const totalQty = formattedItems.reduce((sum, item) => sum + item.qty, 0);

      const freeDocRef = await addDoc(collection(db, "input-free"), {
        shift: Number(shift),
        karyawanId: selectedKaryawanId,
        karyawanNama: karyawanNama,
        tanggal: selectedDate,
        items: formattedItems,
        totalItems: formattedItems.length,
        totalQty: totalQty,
        totalNominal: totalNominal,
        notes: notes.trim() || "-",
        createdAt: serverTimestamp(),
      });

      // Ringkasan item untuk nama pengeluaran di Laporan Operasional Owner
      const itemSummaries = formattedItems.map(i => `${i.qty}x ${i.productName}`).join(", ");
      const pembayaranLabel = `Input Free: ${itemSummaries}`;

      // Otomatis masukkan ke operasional-kontainer agar tampil di Operasional Owner & /laporan?tab=operasional
      const opDocRef = await addDoc(collection(db, "operasional-kontainer"), {
        inputFreeId: freeDocRef.id,
        pembayaran: pembayaranLabel,
        nominal: totalNominal,
        tanggal: selectedDate,
        shift: Number(shift),
        karyawanId: selectedKaryawanId,
        karyawanNama: karyawanNama,
        type: "input-free",
        notes: notes.trim() || "-",
        createdAt: serverTimestamp(),
      });

      // Simpan operasionalDocId pada dokumen input-free
      await updateDoc(doc(db, "input-free", freeDocRef.id), {
        operasionalDocId: opDocRef.id,
      });

      toast({
        title: "Input Free Berhasil Dicatat",
        description: `Total ${formatCurrency(totalNominal)} (${totalQty} produk) berhasil disimpan untuk ${karyawanNama}.`,
      });

      // Reset Form
      setItems([{ productId: "", qty: 1 }]);
      setNotes("");

    } catch (error) {
      console.error("Gagal simpan input free:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat menyimpan data Input Free.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (log: any) => {
    if (!confirm("Hapus catatan Input Free ini? Catatan ini juga akan dihapus dari Laporan Operasional.")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "input-free", log.id));

      if (log.operasionalDocId) {
        await deleteDoc(doc(db, "operasional-kontainer", log.operasionalDocId)).catch(() => {});
      } else {
        const opSnap = await getDocs(query(collection(db, "operasional-kontainer"), where("inputFreeId", "==", log.id)));
        opSnap.forEach(async (d) => {
          await deleteDoc(doc(db, "operasional-kontainer", d.id)).catch(() => {});
        });
      }

      toast({
        title: "Input Free Dihapus",
        description: "Catatan Input Free telah dihapus dari sistem dan Laporan Operasional.",
      });
    } catch (error) {
      console.error("Error deleting log:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus catatan.",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
              Operasional Karyawan • Zona Waktu
            </p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-3">
            <Gift className="h-8 w-8 text-primary" />
            Input Free Produk
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
            Pencatatan & Riwayat Kuota Klaim Produk Gratis Karyawan
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 border border-slate-200/60 shadow-inner">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab("input")}
            className={cn(
              "rounded-xl px-5 font-black text-xs uppercase tracking-wider h-10 transition-all",
              activeTab === "input"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <PlusCircle className="mr-2 h-4 w-4 text-primary" />
            Form Input Free
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab("riwayat")}
            className={cn(
              "rounded-xl px-5 font-black text-xs uppercase tracking-wider h-10 transition-all",
              activeTab === "riwayat"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <History className="mr-2 h-4 w-4 text-indigo-600" />
            Riwayat & Kuota Free
          </Button>
        </div>
      </div>

      {/* TAB 1: FORM INPUT FREE */}
      {activeTab === "input" && (
        <div className="space-y-8">
          <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Shift, Date, & Karyawan Selector */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {/* Tanggal */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Tanggal
                  </Label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-sm"
                    required
                  />
                </div>

                {/* Shift */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Shift Kerja
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShift(1)}
                      className={cn(
                        "h-12 rounded-2xl font-black uppercase tracking-wider text-xs border-2 transition-all",
                        shift === 1
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-slate-100 bg-slate-50 text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Shift 1 (Pagi)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShift(2)}
                      className={cn(
                        "h-12 rounded-2xl font-black uppercase tracking-wider text-xs border-2 transition-all",
                        shift === 2
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-slate-100 bg-slate-50 text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Shift 2 (Sore)
                    </Button>
                  </div>
                </div>

                {/* Nama Karyawan */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Nama Karyawan
                    </Label>
                    {selectedKaryawanObj && (
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider",
                        isQuotaAlreadyFull 
                          ? "text-rose-600" 
                          : isQuotaConfigured 
                            ? "text-emerald-600" 
                            : "text-slate-400"
                      )}>
                        {isQuotaConfigured 
                          ? `Kuota: ${selectedKaryawanUsed}/${selectedKaryawanQuota} prod`
                          : "Kuota: Bebas"}
                      </span>
                    )}
                  </div>
                  <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId}>
                    <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-sm">
                      <SelectValue placeholder="Pilih Nama Karyawan..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-72">
                      {(listKaryawan as any[])?.map((k: any) => {
                        const used = formMonthUsageMap[k.id]?.totalQty || 0;
                        const quota = Number(k.freeQuota ?? k.quotaFreeBulanan ?? 0);
                        const isFull = quota > 0 && used >= quota;
                        return (
                          <SelectItem 
                            key={k.id} 
                            value={k.id}
                            disabled={isFull}
                            className="text-xs font-bold py-2.5"
                          >
                            <div className="flex items-center justify-between w-full gap-3">
                              <span>{k.nama}</span>
                              <span className={cn(
                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                                isFull 
                                  ? "bg-rose-100 text-rose-700 font-black" 
                                  : quota > 0 
                                    ? "bg-slate-100 text-slate-600" 
                                    : "bg-slate-50 text-slate-400"
                              )}>
                                {isFull 
                                  ? `⛔ KUOTA PENUH (${used}/${quota})` 
                                  : quota > 0 
                                    ? `${used}/${quota} prod`
                                    : "Tanpa Kuota"}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quota Warning Banners */}
              {selectedKaryawanObj && isQuotaAlreadyFull && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3 text-rose-800 animate-in fade-in">
                  <AlertCircle className="h-6 w-6 text-rose-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider">
                      Kuota Free Bulan Ini Sudah Habis!
                    </h4>
                    <p className="text-[11px] font-medium text-rose-700 mt-0.5">
                      Karyawan <strong className="font-bold">{selectedKaryawanObj.nama}</strong> telah mengklaim {selectedKaryawanUsed} dari batas maksimal {selectedKaryawanQuota} produk pada bulan ini. Form input free tidak dapat digunakan untuk karyawan ini.
                    </p>
                  </div>
                </div>
              )}

              {selectedKaryawanObj && !isQuotaAlreadyFull && isExceedingQuota && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3 text-amber-800 animate-in fade-in">
                  <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider">
                      Kuantitas Melebihi Sisa Kuota!
                    </h4>
                    <p className="text-[11px] font-medium text-amber-700 mt-0.5">
                      Sisa kuota karyawan adalah {selectedKaryawanQuota - selectedKaryawanUsed} produk, namun formulir saat ini memilih {currentFormTotalQty} produk. Kurangi jumlah produk agar sesuai dengan sisa kuota.
                    </p>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase italic tracking-wider text-slate-900">
                      Rincian Produk Free
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Pilih produk yang diklaim dan kuantitasnya
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddItem}
                    disabled={isQuotaAlreadyFull}
                    className="rounded-xl border-dashed border-slate-300 text-xs font-bold hover:border-primary hover:text-primary h-9 px-3"
                  >
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Tambah Produk
                  </Button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => {
                    const selectedProd = (listProduk as any[])?.find((p: any) => p.id === item.productId);
                    const prodPrice = Number(selectedProd?.hargaJual ?? selectedProd?.harga ?? 0);
                    const itemSubtotal = prodPrice * Number(item.qty || 0);

                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100"
                      >
                        {/* Select Produk */}
                        <div className="w-full sm:flex-1">
                          <Select
                            value={item.productId}
                            onValueChange={(val) => handleItemChange(idx, "productId", val)}
                            disabled={isQuotaAlreadyFull}
                          >
                            <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200 text-xs font-bold">
                              <SelectValue placeholder="Pilih Produk..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl max-h-60">
                              {(listProduk as any[])?.map((prod: any) => (
                                <SelectItem key={prod.id} value={prod.id} className="text-xs font-bold py-2">
                                  {prod.nama} • {formatCurrency(prod.hargaJual ?? prod.harga ?? 0)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Qty Input */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <div className="relative w-28">
                            <Input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => handleItemChange(idx, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                              disabled={isQuotaAlreadyFull}
                              className="h-11 rounded-xl bg-white border-slate-200 text-center font-black text-sm pr-10"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-slate-400">
                              Pcs
                            </span>
                          </div>

                          {/* Subtotal Display */}
                          <div className="min-w-[120px] text-right font-black text-xs text-slate-700 bg-white px-3 py-2.5 rounded-xl border border-slate-200">
                            {formatCurrency(itemSubtotal)}
                          </div>

                          {/* Remove Button */}
                          {items.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(idx)}
                              className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes & Summary Footer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t border-slate-100 items-end">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Catatan / Alasan (Opsional)
                  </Label>
                  <Input
                    placeholder="Contoh: Tes rasa menu baru / jatah bulanan"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isQuotaAlreadyFull}
                    className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                      Estimasi Biaya Free
                    </span>
                    <span className="text-xl font-black text-slate-900 tabular-nums">
                      {formatCurrency(batchTotal)}
                    </span>
                  </div>

                  <Button
                    type="submit"
                    disabled={saving || isQuotaAlreadyFull || isExceedingQuota || !selectedKaryawanId}
                    className={cn(
                      "h-14 rounded-2xl px-8 font-black uppercase tracking-widest text-xs shadow-xl transition-all w-full sm:w-auto text-white",
                      isQuotaAlreadyFull || isExceedingQuota
                        ? "bg-slate-300 cursor-not-allowed text-slate-500"
                        : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                    )}
                  >
                    {saving ? (
                      "Menyimpan..."
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Input Free
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Log Hari Ini */}
          <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Coffee className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                    Catatan Free Hari Ini ({selectedDate})
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Riwayat klaim produk gratis pada tanggal terpilih
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Nominal:</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900">
                  {formatCurrency(totalFreeToday)}
                </span>
              </div>
            </div>

            {todayLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Gift className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-black uppercase tracking-wider">Belum ada input free pada tanggal ini</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {todayLogs.map((log: any) => (
                  <div key={log.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-slate-900">{log.karyawanNama}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">
                          Shift {log.shift}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(log.items || []).map((it: any, i: number) => (
                          <span key={i} className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-100">
                            {it.qty}x {it.productName}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <span className="text-sm font-black text-slate-900 tabular-nums">
                        {formatCurrency(log.totalNominal || 0)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLog(log)}
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      {/* TAB 2: RIWAYAT & KUOTA FREE */}
      {activeTab === "riwayat" && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
          {/* Controls Bar */}
          <Card className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                    Pilih Bulan Laporan
                  </Label>
                  <Input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="h-11 rounded-xl bg-slate-50 border-none font-black text-sm w-44"
                  />
                </div>

                <div className="space-y-1 flex-1 sm:w-72">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                    Cari Karyawan / Produk
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Ketik nama karyawan atau menu..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="pl-10 h-11 rounded-xl bg-slate-50 border-none text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Periode:</span>
                <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-black text-indigo-900">
                  {historyMonth}
                </span>
              </div>
            </div>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Total Produk Free
              </span>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
                {historyStats.totalQty} <span className="text-xs font-bold text-slate-400 uppercase">Pcs</span>
              </p>
            </Card>

            <Card className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Total Nominal Biaya
              </span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 tabular-nums">
                {formatCurrency(historyStats.totalNominal)}
              </p>
            </Card>

            <Card className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Karyawan Mengklaim
              </span>
              <p className="text-2xl sm:text-3xl font-black text-indigo-600 tabular-nums">
                {historyStats.activeEmployees} <span className="text-xs font-bold text-slate-400 uppercase">Orang</span>
              </p>
            </Card>

            <Card className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Capai Batas Kuota
              </span>
              <p className="text-2xl sm:text-3xl font-black text-rose-600 tabular-nums">
                {historyStats.fullQuotaEmployees} <span className="text-xs font-bold text-slate-400 uppercase">Orang</span>
              </p>
            </Card>
          </div>

          {/* Status Kuota per Karyawan */}
          <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-base font-black uppercase italic tracking-tight text-slate-900">
                  Status Penggunaan Kuota Karyawan ({historyMonth})
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Daftar kuota maksimal, jumlah produk yang sudah diambil, dan rincian produk
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(listKaryawan as any[])?.filter((k: any) => {
                if (!historySearch) return true;
                return k.nama?.toLowerCase().includes(historySearch.toLowerCase());
              }).map((karyawan: any) => {
                const usage = historyMonthUsageMap[karyawan.id] || { totalQty: 0, totalNominal: 0, items: [] };
                const quota = Number(karyawan.freeQuota ?? karyawan.quotaFreeBulanan ?? 0);
                const sisa = quota > 0 ? Math.max(0, quota - usage.totalQty) : "∞";
                const isFull = quota > 0 && usage.totalQty >= quota;
                const percentage = quota > 0 ? Math.min(100, Math.round((usage.totalQty / quota) * 100)) : 0;

                return (
                  <div
                    key={karyawan.id}
                    className={cn(
                      "rounded-2xl border p-5 transition-all flex flex-col justify-between space-y-4",
                      isFull 
                        ? "border-rose-200 bg-rose-50/40" 
                        : usage.totalQty > 0 
                          ? "border-slate-200 bg-slate-50/50" 
                          : "border-slate-100 bg-white"
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black uppercase italic text-slate-900">
                            {karyawan.nama}
                          </h4>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                            {karyawan.jabatan || karyawan.kode || "Staff Karyawan"}
                          </span>
                        </div>
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                          isFull 
                            ? "bg-rose-100 text-rose-700" 
                            : quota > 0 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-slate-100 text-slate-600"
                        )}>
                          {isFull 
                            ? "Kuota Habis" 
                            : quota > 0 
                              ? `Sisa: ${sisa} Pcs` 
                              : "Tanpa Kuota"}
                        </span>
                      </div>

                      {/* Progress Bar if quota exists */}
                      {quota > 0 && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-[9px] font-black uppercase text-slate-500">
                            <span>Terpakai: {usage.totalQty} / {quota} Pcs</span>
                            <span>{percentage}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                isFull ? "bg-rose-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Financial info */}
                      <div className="mt-3 flex items-center justify-between text-[10px] font-black text-slate-700 pt-2 border-t border-slate-200/60">
                        <span className="text-slate-400 font-bold uppercase">Total Biaya:</span>
                        <span className="tabular-nums">{formatCurrency(usage.totalNominal)}</span>
                      </div>
                    </div>

                    {/* Action Button: Rincian Produk */}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedDetailKaryawan({
                        ...karyawan,
                        usage: usage,
                        quota: quota
                      })}
                      className="w-full h-10 rounded-xl bg-white border-slate-200 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 hover:border-slate-300"
                    >
                      <Gift className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Lihat Rincian Produk ({usage.items.length})
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Full Transaction History Table */}
          <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-black uppercase italic tracking-tight text-slate-900">
                  Daftar Transaksi Input Free ({historyMonth})
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total {historyMonthLogs.length} transaksi tercatat pada bulan ini
                </p>
              </div>
            </div>

            {historyMonthLogs.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-black uppercase tracking-wider">Tidak ada transaksi pada bulan ini</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-3">Tanggal</th>
                      <th className="py-3 px-3">Shift</th>
                      <th className="py-3 px-3">Karyawan</th>
                      <th className="py-3 px-3">Rincian Menu / Produk</th>
                      <th className="py-3 px-3 text-right">Total Qty</th>
                      <th className="py-3 px-3 text-right">Nominal</th>
                      <th className="py-3 px-3 text-center">Catatan</th>
                      <th className="py-3 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyMonthLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors font-medium">
                        <td className="py-3 px-3 whitespace-nowrap font-bold text-slate-900">
                          {log.tanggal}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">
                            Shift {log.shift}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-black uppercase text-slate-900">
                          {log.karyawanNama}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(log.items || []).map((it: any, idx: number) => (
                              <span key={idx} className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-100 whitespace-nowrap">
                                {it.qty}x {it.productName}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 tabular-nums">
                          {log.totalQty || (log.items || []).reduce((s: number, i: any) => s + Number(i.qty || 0), 0)} Pcs
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-600 tabular-nums whitespace-nowrap">
                          {formatCurrency(log.totalNominal || 0)}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-400 text-[10px]">
                          {log.notes || "-"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLog(log)}
                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* DETAIL MODAL: RINCIAN PRODUK KARYAWAN */}
      <Dialog open={!!selectedDetailKaryawan} onOpenChange={(open) => !open && setSelectedDetailKaryawan(null)}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] p-6 sm:p-8 bg-white border-none shadow-2xl">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-black text-lg">
                {selectedDetailKaryawan?.nama ? selectedDetailKaryawan.nama.substring(0, 2).toUpperCase() : "KW"}
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tight text-slate-900">
                  Rincian Free • {selectedDetailKaryawan?.nama}
                </DialogTitle>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Periode {historyMonth} • Kuota: {selectedDetailKaryawan?.quota > 0 ? `${selectedDetailKaryawan.quota} Pcs` : "Bebas"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-4 max-h-[60vh] overflow-y-auto pr-1">
            {selectedDetailKaryawan?.usage?.items?.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-black uppercase">Belum ada produk free yang diklaim bulan ini</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedDetailKaryawan?.usage?.items?.map((it: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                    <div>
                      <h5 className="font-black uppercase text-slate-900">{it.productName}</h5>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">
                        {it.tanggal} • Shift {it.shift}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 text-[10px] block mb-0.5">
                        {it.qty} Pcs
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                        {formatCurrency(it.subtotal || (Number(it.harga || 0) * it.qty))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
            <div>
              <span className="text-[9px] font-black uppercase text-slate-400 block">Total Produk Diklaim:</span>
              <span className="text-base font-black text-slate-900">
                {selectedDetailKaryawan?.usage?.totalQty || 0} Pcs
              </span>
            </div>
            <Button
              onClick={() => setSelectedDetailKaryawan(null)}
              className="rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-wider px-6 h-10"
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
