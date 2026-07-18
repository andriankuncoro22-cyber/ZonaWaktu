"use client";

import React, { useState, useMemo } from "react";
import { 
  Plus, 
  Save, 
  History, 
  Trash2, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Wallet,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  doc, 
  deleteDoc 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeOperasionalKontainerPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseName, setExpenseName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Query pengeluaran hari terpilih
  const selectedDateQuery = useMemoFirebase(() => 
    query(
      collection(db, "operasional-kontainer"), 
      where("tanggal", "==", selectedDate)
    ), 
    [db, selectedDate]
  );
  
  const { data: rawLogs, loading } = useCollection(selectedDateQuery);

  // Sort secara client-side untuk menghindari index error Firestore
  const dailyLogs = useMemo(() => {
    if (!rawLogs) return [];
    return [...rawLogs].sort((a: any, b: any) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA; // Descending
    });
  }, [rawLogs]);

  // Hitung total pengeluaran hari terpilih
  const totalNominal = useMemo(() => {
    return dailyLogs.reduce((sum, item) => sum + (item.nominal || 0), 0);
  }, [dailyLogs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseName || !amount || Number(amount) <= 0) {
      toast({
        variant: "destructive",
        title: "Input Tidak Valid",
        description: "Mohon isi nama pengeluaran dan nominal dengan benar.",
      });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "operasional-kontainer"), {
        pembayaran: expenseName,
        nominal: Number(amount),
        tanggal: selectedDate,
        createdAt: serverTimestamp(),
      });

      toast({ 
        title: "Sukses Menyimpan", 
        description: `Pengeluaran "${expenseName}" sebesar Rp ${Number(amount).toLocaleString('id-ID')} berhasil dicatat.` 
      });
      
      setExpenseName("");
      setAmount("");
    } catch (error) {
      console.error("Error adding document: ", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan data.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus catatan pengeluaran ini?")) return;
    try {
      await deleteDoc(doc(db, "operasional-kontainer", id));
      toast({ title: "Berhasil Dihapus", description: "Catatan pengeluaran telah dihapus." });
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat mencoba menghapus data.",
      });
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Operasional Kontainer</h1>
          <p className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-[0.2em] mt-1">
            Catat Pengeluaran Harian Karyawan di Area Kontainer
          </p>
        </div>
        
        {/* Date Selector */}
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-xl md:rounded-[1.5rem] shadow-sm border border-slate-100 self-start md:self-auto">
          <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-600 bg-transparent border-none outline-none cursor-pointer w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Form Input (Left Column) */}
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden p-8 md:p-12">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="flex items-center gap-2 px-1">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-black uppercase italic text-slate-900">
                  Input Pengeluaran Baru
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider" htmlFor="expenseName">
                    Nama Pembayaran / Pembelian
                  </Label>
                  <Input
                    id="expenseName"
                    placeholder="Contoh: Beli Gas, Bayar Es Batu, Parkir"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    disabled={saving}
                    className="rounded-xl h-12 bg-slate-50 border-none font-bold placeholder:font-normal placeholder:text-slate-400"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider" htmlFor="amount">
                    Nominal (Rp)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                    <Input
                      id="amount"
                      type="text"
                      inputMode="numeric"
                      placeholder="Contoh: 50.000"
                      value={amount === "" ? "" : formatThousand(amount)}
                      onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                      disabled={saving}
                      className="rounded-xl h-12 bg-slate-50 border-none font-black pl-10 placeholder:font-normal placeholder:text-slate-400"
                      required
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={saving || !expenseName || !amount}
                className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-primary/20 gap-3 transition-all active:scale-[0.98]"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Simpan Pengeluaran
              </Button>
            </form>
          </Card>
        </div>

        {/* History & Summary (Right Column) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Summary Box */}
          <Card className="border-none shadow-sm rounded-3xl p-6 bg-slate-900 text-white flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[8px] md:text-[9px] font-black text-white/50 uppercase tracking-widest">Total Pengeluaran Hari Ini</p>
              <h3 className="text-xl md:text-2xl font-black tabular-nums">Rp {totalNominal.toLocaleString('id-ID')}</h3>
            </div>
          </Card>

          {/* History List */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-4">
              <History className="h-5 w-5 text-primary" />
              <h3 className="text-[11px] md:text-sm font-black uppercase tracking-widest text-slate-900">Daftar Pengeluaran</h3>
            </div>

            <div className="grid gap-3">
              {dailyLogs.map((log: any) => (
                <Card key={log.id} className="rounded-3xl p-5 bg-white border-none shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Baru saja'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase italic truncate">{log.pembayaran}</h4>
                        <p className="text-sm font-black text-primary tabular-nums mt-0.5">Rp {log.nominal?.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(log.id)}
                      className="text-slate-300 hover:text-rose-600 h-9 w-9 rounded-xl shrink-0 ml-4 bg-slate-50 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              {dailyLogs.length === 0 && (
                <div className="py-20 text-center bg-white rounded-[2.5rem] opacity-30 italic text-[10px] font-black uppercase tracking-widest">
                  Belum ada pengeluaran hari ini
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
