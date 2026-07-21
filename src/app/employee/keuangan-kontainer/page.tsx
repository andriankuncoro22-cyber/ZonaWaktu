"use client";

import React, { useMemo, useState } from "react";
import {
  Calculator,
  Calendar as CalendarIcon,
  CheckCircle2,
  Coins,
  HandCoins,
  Loader2,
  Wallet,
  AlertCircle,
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
  const [shift, setShift] = useState<1 | 2>(2);
  const [manualCashSales, setManualCashSales] = useState("");
  const [manualQrisSales, setManualQrisSales] = useState("");
  const [modalAwal, setModalAwal] = useState("");
  const [modalTambahan, setModalTambahan] = useState("");
  const [cashOnHand, setCashOnHand] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const resetFormFields = () => {
    setCashOnHand("");
    setNote("");
    setManualCashSales("");
    setManualQrisSales("");
    setModalAwal("");
    setModalTambahan("");
  };

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

  const shift1Log = useMemo(() => {
    if (!keuanganLogs) return null;
    return keuanganLogs.find((log: any) => (log.shift ?? 2) === 1);
  }, [keuanganLogs]);

  const currentShiftLog = useMemo(() => {
    if (!keuanganLogs) return null;
    return keuanganLogs.find((log: any) => (log.shift ?? 2) === shift);
  }, [keuanganLogs, shift]);

  const hasClosedShift = useMemo(() => {
    return !loadingKeuangan && !!currentShiftLog;
  }, [currentShiftLog, loadingKeuangan]);

  const dailyClosing = useMemo(() => {
    if (!closingLogs || closingLogs.length === 0) return null;
    return closingLogs[0];
  }, [closingLogs]);

  const operationalTotal = useMemo(() => {
    return (operationalLogs || [])
      .filter((item: any) => shift === 2 ? true : (item.shift ?? 2) === 1)
      .reduce((sum: number, item: any) => sum + Number(item.nominal || 0), 0);
  }, [operationalLogs, shift]);

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
        const matchesDate = createdAt.toISOString().split("T")[0] === selectedDate;
        const matchesShift = shift === 2 ? true : (log.shift ?? 2) === 1;
        const isKaryawanInput = !!log.karyawanId;
        return matchesDate && matchesShift && isKaryawanInput;
      })
      .reduce((sum: number, log: any) => sum + getPurchaseSubtotal(log), 0);
  }, [purchaseLogs, selectedDate, shift]);

  const currentExpectedCashToSettle = useMemo(() => {
    if (shift === 2) {
      const cashFromSales = Number(dailyClosing?.transactionReport?.cashTotal || 0);
      const totalShift1ModalAwal = shift1Log?.modalAwal || 0;
      const totalShift1ModalTambahan = shift1Log?.modalTambahan || 0;
      const shift1Difference = shift1Log?.difference || 0;
      return cashFromSales - operationalTotal - purchaseTotal + totalShift1ModalAwal + totalShift1ModalTambahan + Number(modalTambahan || 0) + shift1Difference;
    } else {
      const cashFromSales = Number(manualCashSales || 0);
      return cashFromSales - operationalTotal - purchaseTotal + Number(modalAwal || 0) + Number(modalTambahan || 0);
    }
  }, [shift, dailyClosing, operationalTotal, purchaseTotal, manualCashSales, modalAwal, modalTambahan, shift1Log]);

  const difference = useMemo(() => {
    const actual = Number(cashOnHand || 0);
    return actual - currentExpectedCashToSettle;
  }, [cashOnHand, currentExpectedCashToSettle]);

  const summaryRows = useMemo(() => {
    if (shift === 2) {
      const totalShift1ModalAwal = shift1Log?.modalAwal || 0;
      const totalShift1ModalTambahan = shift1Log?.modalTambahan || 0;
      const shift1Difference = shift1Log?.difference || 0;
      return [
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
          label: "Modal awal (Shift 1)", 
          value: totalShift1ModalAwal, 
          bgClass: "bg-indigo-50/50 border-indigo-100", 
          labelClass: "text-indigo-600", 
          valueClass: "text-indigo-900" 
        },
        { 
          label: "Modal tambahan (S1 + S2)", 
          value: totalShift1ModalTambahan + Number(modalTambahan || 0), 
          bgClass: "bg-amber-50/50 border-amber-100", 
          labelClass: "text-amber-600", 
          valueClass: "text-amber-900" 
        },
        { 
          label: "Operasional kontainer (S1 + S2)", 
          value: operationalTotal, 
          bgClass: "bg-rose-50/50 border-rose-100", 
          labelClass: "text-rose-500", 
          valueClass: "text-rose-600" 
        },
        { 
          label: "Belanja bahan baku (S1 + S2)", 
          value: purchaseTotal, 
          bgClass: "bg-red-50/50 border-red-100", 
          labelClass: "text-red-500", 
          valueClass: "text-red-600" 
        },
        { 
          label: "Selisih Shift 1", 
          value: shift1Difference, 
          bgClass: shift1Difference === 0 
            ? "bg-slate-50/50 border-slate-100" 
            : shift1Difference > 0 
              ? "bg-amber-50/50 border-amber-100" 
              : "bg-rose-50/50 border-rose-100", 
          labelClass: shift1Difference === 0 
            ? "text-slate-500" 
            : shift1Difference > 0 
              ? "text-amber-600" 
              : "text-rose-600", 
          valueClass: shift1Difference === 0 
            ? "text-slate-900" 
            : shift1Difference > 0 
              ? "text-amber-900" 
              : "text-rose-900" 
        },
        { 
          label: "Cash Seharusnya di Laci", 
          value: currentExpectedCashToSettle, 
          bgClass: "bg-emerald-50 border-emerald-200 shadow-sm", 
          labelClass: "text-emerald-700 font-bold", 
          valueClass: "text-emerald-700 font-black text-xl" 
        },
      ];
    } else {
      const manualCashSalesVal = Number(manualCashSales || 0);
      const manualQrisSalesVal = Number(manualQrisSales || 0);
      const manualTotalSalesVal = manualCashSalesVal + manualQrisSalesVal;
      return [
        { 
          label: "Total penjualan (Input)", 
          value: manualTotalSalesVal, 
          bgClass: "bg-blue-50/50 border-blue-100", 
          labelClass: "text-blue-500", 
          valueClass: "text-blue-900" 
        },
        { 
          label: "QRIS (Input)", 
          value: manualQrisSalesVal, 
          bgClass: "bg-purple-50/50 border-purple-100", 
          labelClass: "text-purple-500", 
          valueClass: "text-purple-900" 
        },
        { 
          label: "Cash (Input)", 
          value: manualCashSalesVal, 
          bgClass: "bg-sky-50/50 border-sky-100", 
          labelClass: "text-sky-500", 
          valueClass: "text-sky-900" 
        },
        { 
          label: "Modal awal", 
          value: Number(modalAwal || 0), 
          bgClass: "bg-indigo-50/50 border-indigo-100", 
          labelClass: "text-indigo-600", 
          valueClass: "text-indigo-900" 
        },
        { 
          label: "Modal tambahan", 
          value: Number(modalTambahan || 0), 
          bgClass: "bg-amber-50/50 border-amber-100", 
          labelClass: "text-amber-600", 
          valueClass: "text-amber-900" 
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
          label: "Cash Seharusnya di Laci", 
          value: currentExpectedCashToSettle, 
          bgClass: "bg-emerald-50 border-emerald-200 shadow-sm", 
          labelClass: "text-emerald-700 font-bold", 
          valueClass: "text-emerald-700 font-black text-xl" 
        },
      ];
    }
  }, [shift, dailyClosing, operationalTotal, purchaseTotal, manualCashSales, manualQrisSales, modalAwal, modalTambahan, currentExpectedCashToSettle, shift1Log]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dataToSave: any = {
        tanggal: selectedDate,
        shift: shift,
        createdAt: serverTimestamp(),
        operationalTotal,
        purchaseTotal,
        expectedCashToSettle: currentExpectedCashToSettle,
        cashOnHand: Number(cashOnHand || 0),
        difference,
        note: note.trim(),
        operationalDetails: (operationalLogs || [])
          .filter((log: any) => shift === 2 ? true : (log.shift ?? 2) === 1)
          .map((log: any) => ({
            id: log.id,
            pembayaran: log.pembayaran,
            nominal: Number(log.nominal || 0),
            shift: Number(log.shift ?? 2),
            karyawanNama: log.karyawanNama || "-",
          })),
        purchaseDetails: (purchaseLogs || [])
          .filter((log: any) => {
            const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
            const matchesDate = createdAt && createdAt.toISOString().split("T")[0] === selectedDate;
            const matchesShift = shift === 2 ? true : (log.shift ?? 2) === 1;
            const isKaryawanInput = !!log.karyawanId;
            return matchesDate && matchesShift && isKaryawanInput;
          })
          .map((log: any) => ({
            id: log.id,
            nomorNota: log.nomorNota || "-",
            total: getPurchaseSubtotal(log),
            shift: Number(log.shift ?? 2),
            karyawanNama: log.karyawanNama || "-",
            items: (log.items || []).map((item: any) => ({
              materialName: item.materialName || item.materialCode || "-",
              qty: Number(item.qty || 0),
              price: Number(item.price || 0),
            })),
          })),
      };

      if (shift === 2) {
        dataToSave.modalAwal = Number(shift1Log?.modalAwal || 0);
        dataToSave.modalTambahan = Number(modalTambahan || 0) + Number(shift1Log?.modalTambahan || 0);
        dataToSave.shift1Difference = Number(shift1Log?.difference || 0);
        dataToSave.cashFromClosing = Number(dailyClosing?.transactionReport?.cashTotal || 0);
        dataToSave.qrisFromClosing = Number(dailyClosing?.transactionReport?.qrisTotal || 0);
        dataToSave.totalFromClosing = Number(dailyClosing?.total || 0);
      } else {
        dataToSave.modalAwal = Number(modalAwal || 0);
        dataToSave.modalTambahan = Number(modalTambahan || 0);
        dataToSave.cashSales = Number(manualCashSales || 0);
        dataToSave.qrisSales = Number(manualQrisSales || 0);
        dataToSave.totalSales = Number(manualCashSales || 0) + Number(manualQrisSales || 0);
      }

      await addDoc(collection(db, "keuangan-kontainer"), dataToSave);

      toast({
        title: "Histori Tersimpan",
        description: `Data keuangan kontainer Shift ${shift} berhasil disimpan ke histori owner.`,
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Shift Selection Pills */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => {
                setShift(1);
                resetFormFields();
              }}
              className={cn(
                "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                shift === 1
                  ? "bg-primary text-white shadow-md shadow-primary/10"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Shift 1 (Pagi)
            </button>
            <button
              onClick={() => {
                setShift(2);
                resetFormFields();
              }}
              className={cn(
                "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                shift === 2
                  ? "bg-primary text-white shadow-md shadow-primary/10"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Shift 2 (Malam)
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white px-5 py-3 shadow-sm">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                resetFormFields();
              }}
              className="w-full border-none bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
            />
          </div>
        </div>
      </div>

      {hasClosedShift ? (
        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
          <Card className="overflow-hidden rounded-[2.5rem] border-none bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-8 text-center shadow-sm flex flex-col items-center justify-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tight text-slate-800">
                Shift {shift === 1 ? "1 (Pagi)" : "2 (Malam)"} Telah Dicclosing
              </h2>
              <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest">
                Laporan keuangan kontainer tanggal {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} untuk Shift {shift} telah berhasil disimpan.
              </p>
            </div>
          </Card>

          {/* Read Only Summary Card */}
          <Card className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <Calculator className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-black uppercase italic text-slate-900">Rekapitulasi Data Terkirim - Shift {shift}</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Penjualan</span>
                <p className="text-base font-black text-slate-900 mt-1">
                  {formatCurrency(
                    (currentShiftLog?.shift ?? 2) === 2
                      ? currentShiftLog?.totalFromClosing || currentShiftLog?.cashFromClosing || 0
                      : currentShiftLog?.totalSales || 0
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total QRIS</span>
                <p className="text-base font-black text-purple-700 mt-1">
                  {formatCurrency(
                    (currentShiftLog?.shift ?? 2) === 2
                      ? currentShiftLog?.qrisFromClosing || 0
                      : currentShiftLog?.qrisSales || 0
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Cash</span>
                <p className="text-base font-black text-sky-700 mt-1">
                  {formatCurrency(
                    (currentShiftLog?.shift ?? 2) === 2
                      ? currentShiftLog?.cashFromClosing || 0
                      : currentShiftLog?.cashSales || 0
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Wajib Setor</span>
                <p className="text-base font-black text-emerald-700 mt-1">
                  {formatCurrency(currentShiftLog?.expectedCashToSettle || 0)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Uang Fisik di Pegang</span>
                <p className="text-lg font-black text-slate-900 mt-1">{formatCurrency(currentShiftLog?.cashOnHand || 0)}</p>
              </div>
              <div className={cn(
                "rounded-xl border p-4",
                (currentShiftLog?.difference || 0) === 0
                  ? "border-emerald-100 bg-emerald-50/10"
                  : "border-rose-100 bg-rose-50/10"
              )}>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider",
                  (currentShiftLog?.difference || 0) === 0 ? "text-emerald-700" : "text-rose-700"
                )}>
                  Selisih
                </span>
                <p className={cn(
                  "text-lg font-black mt-1",
                  (currentShiftLog?.difference || 0) === 0 ? "text-emerald-700" : "text-rose-700"
                )}>
                  {formatCurrency(currentShiftLog?.difference || 0)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {shift === 1 && (
                <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Modal Awal</span>
                  <p className="text-base font-black text-slate-900 mt-1">{formatCurrency(currentShiftLog?.modalAwal || 0)}</p>
                </div>
              )}
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Modal Tambahan</span>
                <p className="text-base font-black text-slate-900 mt-1">{formatCurrency(currentShiftLog?.modalTambahan || 0)}</p>
              </div>
            </div>

            {currentShiftLog?.note && (
              <div className="rounded-xl border border-slate-100 p-4 bg-slate-50/50">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Catatan Selisih</span>
                <p className="text-xs text-slate-700 mt-1 font-bold italic">&quot;{currentShiftLog.note}&quot;</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <>
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="border-b border-slate-50 bg-slate-50/40 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">
                  Ringkasan Kas Kontainer - Shift {shift === 1 ? "1 (Pagi)" : "2 (Malam)"}
                </h2>
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
                  <h3 className="text-sm font-black uppercase italic text-slate-900">Input Closing Shift {shift}</h3>
                </div>

                {/* Shift 1 (Pagi) Manual Sales & Modal Inputs */}
                {shift === 1 && (
                  <div className="mt-4 space-y-4 border-b border-primary/10 pb-4 mb-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Penjualan Cash (Manual)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={manualCashSales === "" ? "" : formatThousand(manualCashSales)}
                        onChange={(e) => setManualCashSales(e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Penjualan QRIS (Manual)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={manualQrisSales === "" ? "" : formatThousand(manualQrisSales)}
                        onChange={(e) => setManualQrisSales(e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Modal Awal (Pagi)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={modalAwal === "" ? "" : formatThousand(modalAwal)}
                        onChange={(e) => setModalAwal(e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Modal Tambahan (Opsional)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={modalTambahan === "" ? "" : formatThousand(modalTambahan)}
                        onChange={(e) => setModalTambahan(e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-800"
                      />
                    </div>
                  </div>
                )}

                {/* Shift 2 (Malam) Modal Tambahan Input */}
                {shift === 2 && (
                  <div className="mt-4 space-y-2 border-b border-primary/10 pb-4 mb-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Modal Tambahan (Opsional)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={modalTambahan === "" ? "" : formatThousand(modalTambahan)}
                      onChange={(e) => setModalTambahan(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                      className="h-12 rounded-xl border-none bg-white shadow-sm font-black text-slate-800"
                    />
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Nominal Kas (Uang di Pegang)</Label>
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

                {shift === 2 && !dailyClosing && (
                  <div className="mt-5 bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="font-black uppercase tracking-wide text-[9px]">Menunggu Excel Closing Toko</p>
                      <p className="text-[11px] mt-1 leading-relaxed font-bold">
                        Owner belum menyelesaikan laporan / mengunggah Excel penjualan harian. Hubungi Owner untuk mengunggah Excel penjualan hari ini terlebih dahulu agar Anda dapat menyimpan data closing Shift 2.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSave}
                  disabled={saving || (shift === 2 && !dailyClosing)}
                  className="mt-5 h-12 w-full rounded-2xl bg-primary px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                {operationalLogs && operationalLogs.filter((log: any) => shift === 2 ? true : (log.shift ?? 2) === 1).length > 0 ? (
                  operationalLogs
                    .filter((log: any) => shift === 2 ? true : (log.shift ?? 2) === 1)
                    .map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{log.pembayaran}</p>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-relaxed flex flex-wrap gap-1">
                            <span>{log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                            {log.shift && <span>• Shift {log.shift}</span>}
                            {log.karyawanNama && <span>• {log.karyawanNama}</span>}
                          </p>
                        </div>
                        <p className="text-sm font-black text-rose-600">{formatCurrency(log.nominal || 0)}</p>
                      </div>
                    ))
                ) : (
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
                    if (!createdAt) return false;
                    const matchesDate = createdAt.toISOString().split("T")[0] === selectedDate;
                    const matchesShift = shift === 2 ? true : (log.shift ?? 2) === 1;
                    const isKaryawanInput = !!log.karyawanId;
                    return matchesDate && matchesShift && isKaryawanInput;
                  }).length > 0 ? purchaseLogs.filter((log: any) => {
                    const createdAt = log.createdAt?.toDate ? log.createdAt.toDate() : null;
                    if (!createdAt) return false;
                    const matchesDate = createdAt.toISOString().split("T")[0] === selectedDate;
                    const matchesShift = shift === 2 ? true : (log.shift ?? 2) === 1;
                    const isKaryawanInput = !!log.karyawanId;
                    return matchesDate && matchesShift && isKaryawanInput;
                  }).map((log: any) => (
                    <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">Nota {log.nomorNota || "-"}</p>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-relaxed flex flex-wrap gap-1">
                            <span>{log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleString("id-ID") : "-"}</span>
                            {log.shift && <span>• Shift {log.shift}</span>}
                            {log.karyawanNama && <span>• {log.karyawanNama}</span>}
                          </p>
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
