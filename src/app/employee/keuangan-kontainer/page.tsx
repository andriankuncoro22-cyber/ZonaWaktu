"use client";

import React, { useMemo, useState } from "react";
import {
  Calculator,
  Calendar as CalendarIcon,
  CheckCircle2,
  Coins,
  HandCoins,
  History,
  Loader2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { addDoc, collection, query, serverTimestamp, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeKeuanganKontainerPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [cashOnHand, setCashOnHand] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const closingQuery = useMemoFirebase(
    () => query(collection(db, "penjualan"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );
  const { data: closingLogs } = useCollection(closingQuery);

  const operationalQuery = useMemoFirebase(
    () => query(collection(db, "operasional-kontainer"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );
  const { data: operationalLogs } = useCollection(operationalQuery);

  const purchaseQuery = useMemoFirebase(
    () => query(collection(db, "log_pembelian_bahan"), where("location", "==", "kontainer")),
    [db]
  );
  const { data: purchaseLogs } = useCollection(purchaseQuery);

  const keuanganQuery = useMemoFirebase(
    () => query(collection(db, "keuangan-kontainer"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );
  const { data: keuanganLogs, loading: loadingKeuangan } = useCollection(keuanganQuery);

  const hasClosedToday = useMemo(() => {
    return !loadingKeuangan && keuanganLogs && keuanganLogs.length > 0;
  }, [keuanganLogs, loadingKeuangan]);

  const dailyClosing = useMemo(() => {
    if (!closingLogs || closingLogs.length === 0) return null;
    return closingLogs[0];
  }, [closingLogs]);

  const operationalTotal = useMemo(() => {
    return (operationalLogs || []).reduce((sum: number, item: any) => sum + Number(item.nominal || 0), 0);
  }, [operationalLogs]);

  const getPurchaseSubtotal = (log: any) => {
    return (log.items || []).reduce((sum: number, item: any) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.price ?? item.purchasePrice ?? 0);
      return sum + qty * price;
    }, 0);
  };

  const purchaseTotal = useMemo(() => {
    return (purchaseLogs || [])
      .filter((log: any) => {
        const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
        if (!createdAt) return false;
        return createdAt.toISOString().split("T")[0] === selectedDate;
      })
      .reduce((sum: number, log: any) => sum + getPurchaseSubtotal(log), 0);
  }, [purchaseLogs, selectedDate]);

  const expectedCashToSettle = useMemo(() => {
    const cashFromSales = Number(dailyClosing?.transactionReport?.cashTotal || 0);
    return cashFromSales - operationalTotal - purchaseTotal;
  }, [dailyClosing, operationalTotal, purchaseTotal]);

  const difference = useMemo(() => {
    const actual = Number(cashOnHand || 0);
    return actual - expectedCashToSettle;
  }, [cashOnHand, expectedCashToSettle]);

  const summaryRows = [
    { 
      label: "Total penjualan dari closing", 
      value: dailyClosing?.total || 0, 
      bgClass: "bg-blue-50/50 border-blue-100", 
      labelClass: "text-blue-500", 
      valueClass: "text-blue-900" 
    },
    { 
      label: "QRIS dari closing", 
      value: dailyClosing?.transactionReport?.qrisTotal || 0, 
      bgClass: "bg-purple-50/50 border-purple-100", 
      labelClass: "text-purple-500", 
      valueClass: "text-purple-900" 
    },
    { 
      label: "Cash dari closing", 
      value: dailyClosing?.transactionReport?.cashTotal || 0, 
      bgClass: "bg-sky-50/50 border-sky-100", 
      labelClass: "text-sky-500", 
      valueClass: "text-sky-900" 
    },
    { 
      label: "Operasional kontainer", 
      value: operationalTotal, 
      bgClass: "bg-rose-50/50 border-rose-100", 
      labelClass: "text-rose-500", 
      valueClass: "text-rose-600" 
    },
    { 
      label: "Belanja bahan baku", 
      value: purchaseTotal, 
      bgClass: "bg-red-50/50 border-red-100", 
      labelClass: "text-red-500", 
      valueClass: "text-red-600" 
    },
    { 
      label: "Cash yang harus disetorkan", 
      value: expectedCashToSettle, 
      bgClass: "bg-emerald-50 border-emerald-200 shadow-sm", 
      labelClass: "text-emerald-700 font-bold", 
      valueClass: "text-emerald-700 font-black text-xl" 
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, "keuangan-kontainer"), {
        tanggal: selectedDate,
        createdAt: serverTimestamp(),
        cashFromClosing: Number(dailyClosing?.transactionReport?.cashTotal || 0),
        operationalTotal,
        purchaseTotal,
        expectedCashToSettle,
        cashOnHand: Number(cashOnHand || 0),
        difference,
        note: note.trim(),
        operationalDetails: (operationalLogs || []).map((log: any) => ({
          id: log.id,
          pembayaran: log.pembayaran,
          nominal: Number(log.nominal || 0),
        })),
        purchaseDetails: (purchaseLogs || [])
          .filter((log: any) => {
            const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
            return createdAt && createdAt.toISOString().split("T")[0] === selectedDate;
          })
          .map((log: any) => ({
            id: log.id,
            nomorNota: log.nomorNota || "-",
            total: getPurchaseSubtotal(log),
            items: (log.items || []).map((item: any) => ({
              materialName: item.materialName || item.materialCode || "-",
              qty: Number(item.qty || 0),
              price: Number(item.price || 0),
            })),
          })),
      });

      toast({
        title: "Histori Tersimpan",
        description: "Data keuangan kontainer berhasil disimpan ke histori owner.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat menyimpan histori keuangan kontainer.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 md:text-4xl">
            Keuangan Kontainer
          </h1>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 md:text-xs">
            Hitung kas yang harus disetorkan dari hasil closing dan pengeluaran hari ini
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white px-5 py-3 shadow-sm">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full border-none bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
          />
        </div>
      </div>

      {hasClosedToday ? (
        <Card className="overflow-hidden rounded-[2.5rem] border-none bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-10 text-center shadow-sm flex flex-col items-center justify-center space-y-6 min-h-[350px] animate-in fade-in zoom-in duration-500">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 animate-bounce">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-slate-800">
              Anda sudah closing hari ini
            </h2>
            <p className="text-xs md:text-sm text-slate-500 font-bold uppercase tracking-widest">
              Laporan keuangan kontainer untuk tanggal {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} telah berhasil disimpan.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="border-b border-slate-50 bg-slate-50/40 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">Ringkasan Kas Kontainer</h2>
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {summaryRows.map((row) => (
                  <div 
                    key={row.label} 
                    className={cn(
                      "rounded-2xl p-3 sm:p-5 border flex flex-col justify-between min-h-[90px] sm:min-h-[115px] shadow-sm/5 transition-all hover:scale-[1.01] duration-300", 
                      row.bgClass
                    )}
                  >
                    <span className={cn("text-[8px] sm:text-[9px] font-black uppercase tracking-wider leading-relaxed", row.labelClass)}>
                      {row.label}
                    </span>
                    <span className={cn("text-sm sm:text-lg font-black mt-2 sm:mt-3 tabular-nums", row.valueClass)}>
                      {formatCurrency(row.value)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-primary/10 bg-primary/5 p-5">
                <div className="flex items-center gap-3">
                  <HandCoins className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-black uppercase italic text-slate-900">Input Uang di Pegang</h3>
                </div>
                <div className="mt-4 space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Nominal Kas</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cashOnHand === "" ? "" : formatThousand(cashOnHand)}
                    onChange={(e) => setCashOnHand(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                    className="h-12 rounded-xl border-none bg-white shadow-sm"
                  />
                </div>
                <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selisih</p>
                  <p className={`mt-2 text-2xl font-black ${difference === 0 ? "text-emerald-600" : difference > 0 ? "text-amber-600" : "text-rose-600"}`}>
                    {formatCurrency(difference)}
                  </p>
                </div>
                <div className="mt-5 space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Catatan Bila Ada Selisih</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Opsional, contoh: ada tambahan uang jajan, ada kurang dari belanja..."
                    className="h-12 rounded-xl border-none bg-white shadow-sm"
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-5 h-12 w-full rounded-2xl bg-primary px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Simpan Histori
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-black uppercase italic text-slate-900">Rincian Operasional</h3>
              </div>
              <div className="mt-4 space-y-3">
                {operationalLogs && operationalLogs.length > 0 ? operationalLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{log.pembayaran}</p>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</p>
                    </div>
                    <p className="text-sm font-black text-rose-600">{formatCurrency(log.nominal || 0)}</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    Belum ada operasional kontainer hari ini.
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Coins className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-black uppercase italic text-slate-900">Rincian Belanja Bahan Baku</h3>
              </div>
              <div className="mt-4 space-y-3">
                {purchaseLogs && purchaseLogs.filter((log: any) => {
                    const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
                    return createdAt && createdAt.toISOString().split("T")[0] === selectedDate;
                  }).length > 0 ? purchaseLogs.filter((log: any) => {
                    const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
                    return createdAt && createdAt.toISOString().split("T")[0] === selectedDate;
                  }).map((log: any) => (
                    <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">Nota {log.nomorNota || "-"}</p>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleString("id-ID") : "-"}</p>
                        </div>
                        <p className="text-sm font-black text-rose-600">{formatCurrency(getPurchaseSubtotal(log))}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(log.items || []).map((item: any, idx: number) => (
                          <div key={`${log.id}-${idx}`} className="flex items-center justify-between text-xs text-slate-600">
                            <span>{item.materialName || item.materialCode || "-"}</span>
                            <span>{item.qty} x {formatCurrency(item.price || 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    Belum ada belanja bahan baku kontainer hari ini.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
