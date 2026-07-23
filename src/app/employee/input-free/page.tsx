"use client";

import React, { useState, useMemo } from "react";
import { 
  Gift, 
  PlusCircle, 
  Save, 
  History, 
  Trash2, 
  X, 
  Calendar as CalendarIcon, 
  AlertCircle,
  Tag,
  Coffee,
  CheckCircle2
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

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeInputFreePage() {
  const db = useFirestore();
  const { toast } = useToast();

  const [shift, setShift] = useState<1 | 2>(1);
  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<FreeItemInput[]>([{ productId: "", qty: 1 }]);
  const [saving, setSaving] = useState(false);

  // Fetch Katalog Produk (Owner Product Catalog)
  const productsQuery = useMemoFirebase(() => query(collection(db, "produk"), orderBy("nama", "asc")), [db]);
  const { data: listProduk } = useCollection(productsQuery);

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: listKaryawan } = useCollection(karyawanQuery);

  // Fetch Today's Input Free Logs
  const freeLogsQuery = useMemoFirebase(() => 
    query(collection(db, "input-free"), where("tanggal", "==", selectedDate)), 
    [db, selectedDate]
  );
  const { data: rawLogs } = useCollection(freeLogsQuery);

  // Client-side sort by createdAt desc
  const dailyFreeLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a: any, b: any) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [rawLogs]);

  // Total Nominal Free Today
  const totalFreeToday = useMemo(() => {
    return dailyFreeLogs.reduce((sum, log: any) => sum + Number(log.totalNominal || 0), 0);
  }, [dailyFreeLogs]);

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
      const prod = (listProduk as any[])?.find(p => p.id === item.productId);
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
        description: "Silakan pilih nama karyawan yang mencatat Input Free.",
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
      const karyawanNama = (listKaryawan as any[])?.find(k => k.id === selectedKaryawanId)?.nama || "-";

      const formattedItems = validItems.map(item => {
        const prod = (listProduk as any[])?.find(p => p.id === item.productId);
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

      const freeDocRef = await addDoc(collection(db, "input-free"), {
        shift: Number(shift),
        karyawanId: selectedKaryawanId,
        karyawanNama: karyawanNama,
        tanggal: selectedDate,
        items: formattedItems,
        totalItems: formattedItems.length,
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
        description: `Total ${formatCurrency(totalNominal)} (${formattedItems.length} produk) telah ditambahkan ke laporan Shift ${shift} dan Laporan Operasional Owner.`,
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
    <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none flex items-center gap-3">
            <Gift className="h-8 w-8 text-pink-600 shrink-0" />
            Input Free Produk
          </h1>
          <p className="text-[9px] sm:text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Area Operasional Kontainer • Pencatatan Complimentary / Produk Free Karyawan
          </p>
        </div>
        <div className="bg-pink-50 border border-pink-200/80 rounded-2xl px-5 py-3 text-pink-900 flex items-center gap-3 shrink-0 shadow-sm">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-pink-500 block">Total Free Hari Ini</span>
            <span className="text-lg font-black text-pink-900">{formatCurrency(totalFreeToday)}</span>
          </div>
        </div>
      </div>

      <Card className="rounded-[1.5rem] sm:rounded-[3rem] border-none shadow-sm bg-white overflow-hidden p-4 sm:p-8">
        {/* Banner Penjelasan Function Isolation */}
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs mb-8">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-wide text-[10px]">Independensi Menu Input Free</p>
            <p className="text-[11px] mt-0.5 leading-relaxed">
              Menu ini <strong>murni berdiri sendiri</strong>. Pencatatan produk free tidak akan memotong stok bahan baku/produk dan tidak mengubah laporan POS. Total nilai nominal produk akan <strong>tercatat otomatis di Keuangan Kontainer</strong> untuk Shift 1 & Shift 2.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          {/* Header Input: Shift, Karyawan, Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">
                Pilih Shift <span className="text-rose-500">*</span>
              </Label>
              <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                <SelectTrigger className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 font-black text-slate-900 text-xs sm:text-sm">
                  <SelectValue placeholder="Pilih shift..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  <SelectItem value="1" className="rounded-xl">Shift 1 (Pagi)</SelectItem>
                  <SelectItem value="2" className="rounded-xl">Shift 2 (Malam)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">
                Nama Karyawan <span className="text-rose-500">*</span>
              </Label>
              <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId} required>
                <SelectTrigger className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 font-black text-slate-900 text-xs sm:text-sm">
                  <SelectValue placeholder="Pilih karyawan..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  {listKaryawan?.map((k: any) => (
                    <SelectItem key={k.id} value={k.id} className="rounded-xl">
                      {k.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-slate-600">
                Tanggal Operasional
              </Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 font-black text-xs sm:text-sm text-slate-900"
              />
            </div>
          </div>

          {/* List Item Produk Free */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black uppercase italic tracking-tighter text-slate-900">
                Pilih Produk Katalog Owner
              </h3>
              <Button
                type="button"
                variant="ghost"
                onClick={handleAddItem}
                className="h-10 text-[10px] font-black text-pink-600 uppercase tracking-widest gap-2 hover:bg-pink-50"
              >
                <PlusCircle className="h-4 w-4" /> Tambah Baris
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const prodDetail = (listProduk as any[])?.find(p => p.id === item.productId);
                const harga = Number(prodDetail?.hargaJual ?? prodDetail?.harga ?? 0);
                const subtotal = harga * (item.qty || 0);

                return (
                  <div key={index} className="relative flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-pink-50/40 p-4 sm:p-5 rounded-2xl border border-pink-100">
                    {/* Select Product */}
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Produk</Label>
                      <Select
                        value={item.productId}
                        onValueChange={(val) => handleItemChange(index, "productId", val)}
                      >
                        <SelectTrigger className="rounded-xl border-none h-12 bg-white font-black text-slate-900 text-xs sm:text-sm">
                          <SelectValue placeholder="Pilih produk dari katalog..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl">
                          {listProduk?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id} className="rounded-xl">
                              {p.code ? `[${p.code}] ` : ""}{p.nama} — {formatCurrency(p.hargaJual ?? p.harga ?? 0)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Harga Satuan */}
                    <div className="w-full md:w-36 space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Harga Satuan</Label>
                      <div className="h-12 flex items-center justify-center bg-white rounded-xl text-xs font-black text-slate-800 border border-slate-100">
                        {formatCurrency(harga)}
                      </div>
                    </div>

                    {/* Qty */}
                    <div className="w-full md:w-28 space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Jumlah (Qty)</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.qty || ""}
                        onChange={(e) => handleItemChange(index, "qty", Number(e.target.value))}
                        className="rounded-xl border-none h-12 bg-white font-black text-center text-xs sm:text-sm"
                        placeholder="1"
                      />
                    </div>

                    {/* Subtotal */}
                    <div className="w-full md:w-40 space-y-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-pink-700 block">Subtotal</Label>
                      <div className="h-12 flex items-center justify-center bg-pink-100/70 rounded-xl font-black text-pink-900 text-xs sm:text-sm border border-pink-200/80">
                        {formatCurrency(subtotal)}
                      </div>
                    </div>

                    {/* Remove item */}
                    <div className="flex justify-end md:self-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length === 1}
                        className="h-12 w-12 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 bg-white"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes Input & Total Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t border-slate-100">
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase tracking-widest text-slate-600">Catatan / Alasan (Opsional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Complimentary Pelanggan / Tester Menu Baru"
                className="rounded-2xl border-slate-100 h-12 sm:h-14 bg-slate-50 font-bold text-xs sm:text-sm text-slate-900"
              />
            </div>

            <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl p-4 sm:p-5 text-white flex items-center justify-between shadow-lg shadow-pink-500/20">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-pink-100 block">Total Nominal Entry Ini</span>
                <span className="text-2xl font-black">{formatCurrency(batchTotal)}</span>
              </div>
              <Gift className="h-8 w-8 text-pink-200 opacity-80" />
            </div>
          </div>

          <Button
            disabled={saving || items.some(i => !i.productId || i.qty <= 0)}
            className="w-full h-14 sm:h-16 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white font-black uppercase tracking-[0.2em] text-[10px] sm:text-[11px] shadow-xl shadow-pink-200 gap-3 transition-all active:scale-[0.98]"
          >
            {saving ? "Memproses..." : (
              <>
                <Save className="h-4 w-4" />
                Simpan Input Free & Catat ke Keuangan Kontainer
              </>
            )}
          </Button>
        </form>
      </Card>

      {/* Histori Input Free */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
              Histori Input Free (Hari Ini)
            </h3>
          </div>
          <span className="text-[10px] font-black uppercase text-pink-600 bg-pink-50 px-3 py-1 rounded-full">
            {dailyFreeLogs.length} Catatan
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dailyFreeLogs.length > 0 ? (
            dailyFreeLogs.map((log: any) => (
              <Card key={log.id} className="rounded-3xl bg-white border-none shadow-sm overflow-hidden p-6 space-y-4 border border-pink-100/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-pink-50 text-pink-600">
                      <Gift className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase">
                        Shift {log.shift} • {log.karyawanNama}
                      </h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed">
                        {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Baru saja'}
                        {log.notes && log.notes !== "-" && ` • ${log.notes}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteLog(log)}
                    className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 border-t border-slate-50 pt-3">
                  {log.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-[10px] bg-slate-50 p-2.5 rounded-xl">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 uppercase">{item.productName}</span>
                        <span className="text-[8px] text-slate-400 font-bold">{formatCurrency(item.harga)} x {item.qty}</span>
                      </div>
                      <span className="font-black text-pink-700">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-black">
                  <span className="text-slate-500 uppercase tracking-widest text-[9px]">Total Nominal</span>
                  <span className="text-pink-900">{formatCurrency(log.totalNominal)}</span>
                </div>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-12 text-center bg-white rounded-3xl opacity-40 border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Belum Ada Catatan Input Free Hari Ini</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
