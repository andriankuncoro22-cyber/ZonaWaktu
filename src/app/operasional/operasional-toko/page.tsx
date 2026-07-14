"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { CalendarDays, Coins, Loader2, Save, Trash2, Wallet2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface OperasionalEntry {
  id: string;
  tanggal?: string;
  paymentType?: string;
  paymentTypeLabel?: string;
  nominal?: number;
  catatan?: string;
  total?: number;
  createdAt?: { seconds?: number };
}

export default function OperasionalTokoPage() {
  const db = useFirestore();
  const { toast } = useToast();

  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [paymentType, setPaymentType] = useState("gaji");
  const [customPaymentType, setCustomPaymentType] = useState("");
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedDateQuery = useMemoFirebase(
    () => query(collection(db, "operasional-toko"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );

  const { data: rawEntries, loading } = useCollection(selectedDateQuery);

  const dailyEntries = useMemo(() => {
    if (!rawEntries) return [];
    return [...(rawEntries as unknown as OperasionalEntry[])].sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [rawEntries]);

  const totalOperasional = useMemo(() => {
    return dailyEntries.reduce((sum: number, item) => sum + Number(item.total || 0), 0);
  }, [dailyEntries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amount = Number(nominal || 0);

    if (amount <= 0) {
      toast({
        variant: "destructive",
        title: "Input Tidak Valid",
        description: "Nominal harus lebih dari 0.",
      });
      return;
    }

    const resolvedPaymentType = paymentType === "lainnya" ? customPaymentType.trim() : paymentType;
    const paymentTypeLabel = paymentType === "lainnya"
      ? customPaymentType.trim()
      : paymentType === "gaji"
        ? "Gaji Karyawan"
        : paymentType === "sewa"
          ? "Sewa Tempat"
          : paymentType === "owner"
            ? "Operasional Owner"
            : "Lainnya";
    if (!resolvedPaymentType) {
      toast({
        variant: "destructive",
        title: "Input Tidak Valid",
        description: "Silakan pilih jenis pembayaran atau isi jenis manual.",
      });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "operasional-toko"), {
        tanggal: selectedDate,
        paymentType: resolvedPaymentType,
        paymentTypeLabel,
        nominal: amount,
        catatan: catatan.trim(),
        total: amount,
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Sukses Menyimpan",
        description: `Data ${resolvedPaymentType} berhasil dicatat.`,
      });

      setNominal("");
      setCatatan("");
      setCustomPaymentType("");
      setPaymentType("gaji");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan data operasional toko.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus catatan operasional ini?")) return;

    try {
      await deleteDoc(doc(db, "operasional-toko", id));
      toast({ title: "Berhasil Dihapus", description: "Catatan operasional toko telah dihapus." });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus data.",
      });
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Operasional Toko</h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">Catat gaji karyawan, sewa tempat, dan operasional owner per tanggal</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-2xl px-5 py-3">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Tanggal Operasional</span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <Card className="rounded-[2.5rem] border-none bg-white p-6 md:p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col gap-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500" htmlFor="tanggal">
                Pilih Tanggal Input Operasional
              </Label>
              <Input
                id="tanggal"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-12 rounded-xl bg-slate-50 border-none text-sm font-black"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500" htmlFor="paymentType">
                  Pilih Pembayaran
                </Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger id="paymentType" className="h-12 rounded-xl bg-slate-50 border-none text-sm font-black">
                    <SelectValue placeholder="Pilih pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaji">Gaji Karyawan</SelectItem>
                    <SelectItem value="sewa">Sewa Tempat</SelectItem>
                    <SelectItem value="owner">Operasional Owner</SelectItem>
                    <SelectItem value="lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500" htmlFor="nominal">
                  Nominal (Rp)
                </Label>
                <Input
                  id="nominal"
                  type="number"
                  placeholder="0"
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value)}
                  className="h-12 rounded-xl bg-slate-50 border-none"
                />
              </div>
            </div>

            {paymentType === "lainnya" && (
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500" htmlFor="customPaymentType">
                  Jenis Pembayaran Manual
                </Label>
                <Input
                  id="customPaymentType"
                  placeholder="Contoh: listrik, kebersihan, transport"
                  value={customPaymentType}
                  onChange={(e) => setCustomPaymentType(e.target.value)}
                  className="h-12 rounded-xl bg-slate-50 border-none"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500" htmlFor="catatan">
                Catatan / Keterangan
              </Label>
              <Input
                id="catatan"
                placeholder="Contoh: biaya listrik, kebersihan, dll"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className="h-12 rounded-xl bg-slate-50 border-none"
              />
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-[0.2em] text-[10px] gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Operasional Toko
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2.5rem] border-none bg-slate-900 text-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <Wallet2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Total Operasional Tanggal Ini</p>
                <h3 className="text-2xl font-black">Rp {totalOperasional.toLocaleString("id-ID")}</h3>
              </div>
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border-none bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Coins className="h-4 w-4 text-primary" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Riwayat Input</h3>
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}

            {!loading && dailyEntries.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Belum ada input operasional untuk tanggal ini.</div>
            )}

            <div className="space-y-3">
              {dailyEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{entry.paymentType || entry.catatan || "Operasional toko"}</p>
                      <p className="text-sm font-black text-slate-900">Nominal: Rp {Number(entry.nominal || entry.total || 0).toLocaleString("id-ID")}</p>
                      <p className="text-xs text-slate-500">{entry.catatan || "Tidak ada catatan"}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)} className="h-8 w-8 rounded-xl text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
