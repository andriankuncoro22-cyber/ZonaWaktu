"use client";

import React, { useState, useMemo } from "react";
import { 
  AlertTriangle, 
  Save, 
  History, 
  Trash2, 
  Calendar as CalendarIcon, 
  PackageX,
  User,
  Clock,
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
  increment,
  where
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  satuanKecil?: string;
  qtyKontainerKecil?: number;
}

interface Karyawan {
  id: string;
  nama?: string;
}

export default function EmployeeInputBahanRusakPage() {
  const db = useFirestore();
  const { toast } = useToast();

  const [shift, setShift] = useState<1 | 2>(1);
  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [jumlah, setJumlah] = useState<string>("");
  const [keterangan, setKeterangan] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  // Fetch Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: rawMaterials, loading: loadingMaterials } = useCollection(materialsQuery);

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: listKaryawan } = useCollection(karyawanQuery);

  // Fetch Today's Input Bahan Rusak Logs
  const rusakLogsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-rusak"), where("tanggal", "==", selectedDate)), 
    [db, selectedDate]
  );
  const { data: rawLogs } = useCollection(rusakLogsQuery);

  const dailyLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a: any, b: any) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [rawLogs]);

  const selectedMaterial = useMemo(() => {
    return (rawMaterials as BahanBaku[] || []).find(m => m.id === selectedMaterialId);
  }, [rawMaterials, selectedMaterialId]);

  const selectedKaryawan = useMemo(() => {
    return (listKaryawan as Karyawan[] || []).find(k => k.id === selectedKaryawanId);
  }, [listKaryawan, selectedKaryawanId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Pilih Karyawan",
        description: "Silakan pilih nama karyawan penginput terlebih dahulu.",
      });
      return;
    }

    if (!selectedMaterialId || !selectedMaterial) {
      toast({
        variant: "destructive",
        title: "Pilih Bahan Baku",
        description: "Silakan pilih bahan baku yang rusak terlebih dahulu.",
      });
      return;
    }

    const numJumlah = Number(jumlah);
    if (isNaN(numJumlah) || numJumlah <= 0) {
      toast({
        variant: "destructive",
        title: "Jumlah Tidak Valid",
        description: "Jumlah bahan rusak harus berupa angka lebih besar dari 0.",
      });
      return;
    }

    if (!keterangan.trim()) {
      toast({
        variant: "destructive",
        title: "Keterangan Wajib Diisi",
        description: "Silakan berikan keterangan penyebab kerusakan bahan.",
      });
      return;
    }

    setSaving(true);

    try {
      // 1. Record damaged material entry
      await addDoc(collection(db, "bahan-rusak"), {
        tanggal: selectedDate,
        createdAt: serverTimestamp(),
        shift: Number(shift),
        karyawanId: selectedKaryawanId,
        karyawanNama: selectedKaryawan?.nama || "Karyawan",
        materialId: selectedMaterial.id,
        materialCode: selectedMaterial.code || "-",
        materialName: selectedMaterial.nama || "-",
        satuanKecil: selectedMaterial.satuanKecil || "pcs",
        jumlah: numJumlah,
        keterangan: keterangan.trim()
      });

      // 2. Deduct stock from container
      const matRef = doc(db, "bahan-baku", selectedMaterial.id);
      await updateDoc(matRef, {
        qtyKontainerKecil: increment(-numJumlah)
      });

      toast({
        title: "Bahan Rusak Berhasil Dicatat",
        description: `${numJumlah} ${selectedMaterial.satuanKecil || "pcs"} ${selectedMaterial.nama} berhasil dipotong dari stok kontainer.`,
      });

      // Reset input form
      setSelectedMaterialId("");
      setJumlah("");
      setKeterangan("");
    } catch (err) {
      console.error("Error saving bahan rusak:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan data bahan rusak.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (log: any) => {
    if (!confirm(`Hapus catatan bahan rusak "${log.materialName}" (${log.jumlah} ${log.satuanKecil})? Stok kontainer akan dikembalikan.`)) return;

    try {
      // 1. Revert container stock
      if (log.materialId) {
        const matRef = doc(db, "bahan-baku", log.materialId);
        await updateDoc(matRef, {
          qtyKontainerKecil: increment(Number(log.jumlah || 0))
        });
      }

      // 2. Delete log
      await deleteDoc(doc(db, "bahan-rusak", log.id));

      toast({
        title: "Catatan Dihapus",
        description: `Stok kontainer sebanyak ${log.jumlah} ${log.satuanKecil} telah dikembalikan.`,
      });
    } catch (err) {
      console.error("Error deleting log:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus data.",
      });
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Pencatatan Logistik Kontainer</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-2">
            Input Bahan Rusak
          </h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Pengurangan Stok Kontainer Akibat Rusak / Afkir • Zona Waktu
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Form Column */}
        <Card className="lg:col-span-6 rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="h-10 w-10 rounded-2xl bg-rose-50 flex items-center justify-center border border-rose-100">
                <PackageX className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase italic text-slate-900 leading-none">Form Bahan Rusak</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Lengkapi rincian pengafkiran bahan baku</p>
              </div>
            </div>

            {/* Date & Shift */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-rose-500" /> Shift
                </Label>
                <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-bold text-slate-900">
                    <SelectValue placeholder="Pilih Shift" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="1" className="font-bold">Shift 1 (Pagi)</SelectItem>
                    <SelectItem value="2" className="font-bold">Shift 2 (Malam)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                  <CalendarIcon className="h-3 w-3 text-slate-400" /> Tanggal
                </Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Select Karyawan */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <User className="h-3 w-3 text-slate-400" /> Karyawan Penginput
              </Label>
              <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-bold text-slate-900">
                  <SelectValue placeholder="Pilih Karyawan..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-56">
                  {listKaryawan && listKaryawan.length > 0 ? (
                    listKaryawan.map((k: any) => (
                      <SelectItem key={k.id} value={k.id} className="font-bold">
                        {k.nama}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>Belum ada data karyawan</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Select Material */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <PackageX className="h-3 w-3 text-rose-500" /> Nama Bahan Baku
              </Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-bold text-slate-900">
                  <SelectValue placeholder="Pilih Bahan Baku..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-60">
                  {rawMaterials && rawMaterials.length > 0 ? (
                    rawMaterials.map((m: any) => (
                      <SelectItem key={m.id} value={m.id} className="font-bold">
                        {m.nama} ({m.code || "-"}) — Stok: {Number(m.qtyKontainerKecil || 0)} {m.satuanKecil || "pcs"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {loadingMaterials ? "Memuat Bahan..." : "Belum Ada Bahan Baku"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Jumlah Satuan Kecil
                </Label>
                {selectedMaterial && (
                  <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                    Satuan: {selectedMaterial.satuanKecil || "pcs"}
                  </span>
                )}
              </div>
              <Input
                type="number"
                min="0.01"
                step="any"
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                placeholder={selectedMaterial ? `Contoh: 100 (${selectedMaterial.satuanKecil})` : "Pilih bahan baku terlebih dahulu"}
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-black text-slate-900 text-base"
                required
              />
            </div>

            {/* Description / Reason */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Keterangan Penyebab Kerusakan
              </Label>
              <Input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Contoh: Susu basi, Kemasan bocor, Tumpah saat pembuatan..."
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 font-bold text-slate-900 text-xs"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 font-black uppercase tracking-[0.2em] text-white text-[11px] shadow-lg shadow-rose-600/20"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Memproses..." : "Simpan & Potong Stok Kontainer"}
            </Button>
          </form>
        </Card>

        {/* History Column */}
        <Card className="lg:col-span-6 rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
                <History className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase italic text-slate-900 leading-none">Histori Input Hari Ini</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Tanggal: {selectedDate}</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100">
              {dailyLogs.length} Catatan
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[500px] custom-scrollbar">
            {dailyLogs.length > 0 ? (
              dailyLogs.map((log: any) => (
                <div 
                  key={log.id} 
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 hover:border-slate-200 transition-all flex items-start justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                        Shift {log.shift || 1}
                      </span>
                      <span className="text-xs font-black text-slate-900 uppercase truncate">
                        {log.materialName} ({log.materialCode || "-"})
                      </span>
                    </div>
                    <p className="text-xs font-black text-rose-600">
                      Jumlah Rusak: {log.jumlah} {log.satuanKecil}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 italic">
                      &quot;{log.keterangan || "-"}&quot;
                    </p>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      Penginput: {log.karyawanNama || "-"} • {log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "-"}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteLog(log)}
                    className="h-8 w-8 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 shrink-0 border border-slate-200 hover:border-rose-200 transition-colors"
                    title="Hapus & kembalikan stok"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-slate-300" />
                <p className="text-xs font-black uppercase tracking-wider">Belum Ada Catatan Bahan Rusak Hari Ini</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
