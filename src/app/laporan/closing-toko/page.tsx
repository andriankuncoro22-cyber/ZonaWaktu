"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ClipboardList,
  Eye,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Coins,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  FileText,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { cn } from "@/lib/utils";
import { collection, query, where } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formatCurrency = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function LaporanClosingTokoPage() {
  const db = useFirestore();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedShift, setSelectedShift] = useState<1 | 2>(2);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch sales report (penjualan)
  const penjualanQuery = useMemoFirebase(
    () => query(collection(db, "penjualan"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );
  const { data: penjualanLogs, loading: loadingPenjualan } = useCollection(penjualanQuery);

  // Fetch keuangan kontainer
  const keuanganQuery = useMemoFirebase(
    () => query(collection(db, "keuangan-kontainer"), where("tanggal", "==", selectedDate)),
    [db, selectedDate]
  );
  const { data: keuanganLogs, loading: loadingKeuangan } = useCollection(keuanganQuery);

  const penjualanData = useMemo(() => {
    if (!penjualanLogs || penjualanLogs.length === 0) return null;
    return penjualanLogs[0];
  }, [penjualanLogs]);

  const keuanganData = useMemo(() => {
    if (!keuanganLogs || keuanganLogs.length === 0) return null;
    return keuanganLogs.find((log: any) => (log.shift ?? 2) === selectedShift) || null;
  }, [keuanganLogs, selectedShift]);

  const loading = loadingPenjualan || loadingKeuangan;

  const hasData = useMemo(() => {
    if (selectedShift === 1) {
      return !!keuanganData;
    }
    return !!penjualanData || !!keuanganData;
  }, [penjualanData, keuanganData, selectedShift]);

  const isShift1 = selectedShift === 1;

  // Extract financial variables
  const totalPenjualan = useMemo(() => {
    if (isShift1) return keuanganData?.totalSales || 0;
    return penjualanData?.total || 0;
  }, [isShift1, keuanganData, penjualanData]);

  const totalQris = useMemo(() => {
    if (isShift1) return keuanganData?.qrisSales || 0;
    return penjualanData?.transactionReport?.qrisTotal || 0;
  }, [isShift1, keuanganData, penjualanData]);

  const totalCash = useMemo(() => {
    if (isShift1) return keuanganData?.cashSales || 0;
    return penjualanData?.transactionReport?.cashTotal || 0;
  }, [isShift1, keuanganData, penjualanData]);

  const totalGofood = useMemo(() => {
    if (isShift1) return 0;
    return penjualanData?.transactionReport?.goFoodTotal || 0;
  }, [isShift1, penjualanData]);

  const totalLainnya = useMemo(() => {
    if (isShift1) return 0;
    return penjualanData?.transactionReport?.otherTotal || 0;
  }, [isShift1, penjualanData]);

  const totalOperasional = keuanganData?.operationalTotal || 0;
  const totalBelanja = keuanganData?.purchaseTotal || 0;
  const sisaUangDisetor = keuanganData?.expectedCashToSettle || 0;
  const modalAwal = useMemo(() => {
    if (keuanganData?.modalAwal) return keuanganData.modalAwal;
    const shift1Log = keuanganLogs?.find((log: any) => (log.shift ?? 2) === 1);
    return shift1Log?.modalAwal || 0;
  }, [keuanganData, keuanganLogs]);
  const shift1Difference = useMemo(() => {
    const shift1Log = keuanganLogs?.find((log: any) => (log.shift ?? 2) === 1);
    return shift1Log?.difference || 0;
  }, [keuanganLogs]);
  const modalTambahan = keuanganData?.modalTambahan || 0;
  const uangDiPegang = keuanganData?.cashOnHand || 0;
  const selisihKeuangan = keuanganData?.difference || 0;
  const catatanKaryawan = keuanganData?.note || "";

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Laporan Keuangan & Closing</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none mt-2">
            Laporan Closing Toko
          </h1>
          <p className="text-[10px] md:text-xs text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
            Rekapitulasi penjualan, pengeluaran, dan kas masuk harian
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-start md:self-auto">
          {/* Shift selector pills for owner */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => setSelectedShift(1)}
              className={cn(
                "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                selectedShift === 1
                  ? "bg-primary text-white shadow-md shadow-primary/10"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Shift 1 (Pagi)
            </button>
            <button
              onClick={() => setSelectedShift(2)}
              className={cn(
                "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                selectedShift === 2
                  ? "bg-primary text-white shadow-md shadow-primary/10"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              Shift 2 (Malam)
            </button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white px-5 py-3 shadow-sm">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-none bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="flex flex-col items-center justify-center p-20 min-h-[300px] border-none bg-white shadow-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Memuat Laporan Closing...</p>
        </Card>
      ) : !hasData ? (
        <Card className="flex flex-col items-center justify-center p-12 md:p-20 text-center min-h-[350px] border-none bg-white shadow-sm rounded-3xl">
          <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Belum Ada Laporan</h4>
          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-wider max-w-sm mt-1">
            Karyawan belum melakukan input keuangan kontainer {selectedShift === 1 ? "Shift 1 (Pagi)" : "Shift 2 (Malam)"} untuk tanggal {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </Card>
      ) : (
        <div className="space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2 md:gap-6">
            <Card className="p-3 md:p-8 bg-gradient-to-br from-blue-50 to-blue-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-2 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-blue-900 hidden md:block">
                <TrendingUp className="h-32 w-32" />
              </div>
              <div className="space-y-2 md:space-y-4">
                <div className="inline-flex p-1.5 md:p-3 rounded-lg md:rounded-2xl bg-blue-500/10 text-blue-700">
                  <TrendingUp className="h-3.5 w-3.5 md:h-6 md:w-6" />
                </div>
                <div>
                  <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Penjualan</p>
                  <h3 className="text-xs sm:text-lg md:text-3xl font-black text-blue-900 mt-0.5 tabular-nums">{formatCurrency(totalPenjualan)}</h3>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-8 bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-2 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-indigo-900 hidden md:block">
                <Coins className="h-32 w-32" />
              </div>
              <div className="space-y-2 md:space-y-4">
                <div className="inline-flex p-1.5 md:p-3 rounded-lg md:rounded-2xl bg-indigo-500/10 text-indigo-700">
                  <Coins className="h-3.5 w-3.5 md:h-6 md:w-6" />
                </div>
                <div>
                  <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">QRIS</p>
                  <h3 className="text-xs sm:text-lg md:text-3xl font-black text-indigo-900 mt-0.5 tabular-nums">{formatCurrency(totalQris)}</h3>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-8 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-2 bottom-1 opacity-5 group-hover:scale-110 transition-transform duration-500 text-emerald-900 hidden md:block">
                <Wallet className="h-32 w-32" />
              </div>
              <div className="space-y-2 md:space-y-4">
                <div className="inline-flex p-1.5 md:p-3 rounded-lg md:rounded-2xl bg-emerald-500/10 text-emerald-700">
                  <Wallet className="h-3.5 w-3.5 md:h-6 md:w-6" />
                </div>
                <div>
                  <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Cash</p>
                  <h3 className="text-xs sm:text-lg md:text-3xl font-black text-emerald-900 mt-0.5 tabular-nums">{formatCurrency(totalCash)}</h3>
                </div>
              </div>
            </Card>
          </div>

          {/* Detailed Financial Summary Table Card */}
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between gap-4 bg-slate-50/20">
              <div className="flex items-center gap-3">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h3 className="text-md font-black uppercase italic text-slate-900">Rincian Finansial Closing</h3>
              </div>
              
              {/* Eye Button to open detail modal */}
              <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[9px] gap-2 px-4 h-10 hover:bg-primary/95 transition-all duration-300 shadow-md">
                    <Eye className="h-4 w-4" /> Lihat Rincian Input Karyawan
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-3 sm:p-6 md:p-10 max-w-4xl w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <DialogHeader className="border-b border-slate-100 pb-3 md:pb-4 mb-4">
                    <DialogTitle className="text-base md:text-2xl font-black uppercase italic text-slate-900 flex items-center gap-2 md:gap-3">
                      <Eye className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" /> Detail Input Karyawan
                    </DialogTitle>
                  </DialogHeader>

                  <Tabs defaultValue="produk" className="w-full">
                    <TabsList className="bg-slate-50 p-1 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-1 mb-6 border border-slate-100 w-full">
                      <TabsTrigger value="produk" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                        Produk Terjual
                      </TabsTrigger>
                      <TabsTrigger value="transaksi" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                        Pembayaran
                      </TabsTrigger>
                      <TabsTrigger value="operasional" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                        Operasional & Belanja
                      </TabsTrigger>
                      <TabsTrigger value="catatan" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2 text-center">
                        Catatan
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Produk Terjual */}
                    <TabsContent value="produk" className="m-0 space-y-4">
                      {isShift1 ? (
                        <div className="text-center py-12 border border-dashed border-slate-100 rounded-2xl p-6 text-slate-500 text-xs font-black uppercase">
                          Detail produk terjual tidak tersedia untuk Shift 1 (Pagi) karena hanya mencatat nominal penjualan cash dan QRIS secara manual.
                        </div>
                      ) : penjualanData?.items && penjualanData.items.length > 0 ? (
                        <div>
                          {/* Desktop View: Table */}
                          <div className="hidden md:block overflow-x-auto border border-slate-100 rounded-2xl">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-5 py-3 font-black uppercase text-slate-500">Kode</th>
                                  <th className="px-4 py-3 font-black uppercase text-slate-500">Nama Produk</th>
                                  <th className="px-4 py-3 font-black uppercase text-slate-500 text-center">Jumlah</th>
                                  <th className="px-4 py-3 font-black uppercase text-slate-500 text-right">Pendapatan</th>
                                  <th className="px-5 py-3 font-black uppercase text-slate-500 text-right">Keuntungan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {penjualanData.items.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-50/50">
                                    <td className="px-5 py-3.5 font-bold text-slate-900">{item.code || "-"}</td>
                                    <td className="px-4 py-3.5 font-black text-slate-800 uppercase italic">{item.name || "-"}</td>
                                    <td className="px-4 py-3.5 text-center font-black text-primary tabular-nums">{item.total || 0}</td>
                                    <td className="px-4 py-3.5 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(item.pendapatan || 0)}</td>
                                    <td className="px-5 py-3.5 text-right font-black text-emerald-600 tabular-nums">{formatCurrency(item.keuntungan || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile View: Cards */}
                          <div className="block md:hidden space-y-3">
                            {penjualanData.items.map((item: any, idx: number) => (
                              <div key={idx} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/40 space-y-3">
                                <div className="flex justify-between items-start border-b border-slate-100/60 pb-2">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.code || "-"}</span>
                                    <h4 className="text-xs font-black uppercase text-slate-800 italic leading-snug">{item.name || "-"}</h4>
                                  </div>
                                  <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg shrink-0">
                                    {item.total || 0} Pcs
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Pendapatan</span>
                                    <span className="font-bold text-slate-900 tabular-nums mt-0.5">{formatCurrency(item.pendapatan || 0)}</span>
                                  </div>
                                  <div className="flex flex-col text-right">
                                    <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Keuntungan</span>
                                    <span className="font-black text-emerald-600 tabular-nums mt-0.5">{formatCurrency(item.keuntungan || 0)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400 text-xs font-black uppercase">Tidak ada detail produk terjual (Laporan Excel Kosong).</div>
                      )}
                    </TabsContent>

                    {/* Tab 2: Rincian Pembayaran */}
                     <TabsContent value="transaksi" className="m-0 space-y-4">
                       <div className="grid grid-cols-2 gap-2 md:gap-4">
                         {[
                           { label: "Nominal QRIS", value: totalQris, helper: "QRIS", color: "text-indigo-600" },
                           { label: "Nominal Cash", value: totalCash, helper: "CASH", color: "text-emerald-600" },
                           { label: "Nominal GoFood", value: totalGofood, helper: "GOFOOD", color: "text-red-500" },
                           { label: "Metode Lainnya", value: totalLainnya, helper: "LAINNYA", color: "text-slate-500" },
                         ].map((pay, i) => (
                           <div key={i} className="p-3 md:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                             <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-slate-400">{pay.label}</span>
                             <span className={`text-sm md:text-xl font-black mt-1.5 tabular-nums ${pay.color}`}>{formatCurrency(pay.value)}</span>
                             <span className="text-[7px] md:text-[8px] font-bold text-slate-300 mt-0.5 uppercase tracking-widest">{pay.helper}</span>
                           </div>
                         ))}
                       </div>

                       {/* Modal Awal & Modal Tambahan rekap */}
                       <div className="grid grid-cols-2 gap-2 md:gap-4 border-t border-slate-100 pt-4">
                          <div className="p-3 md:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-slate-400">
                              {selectedShift === 1 ? "Modal Awal (Pagi)" : "Modal Awal (Shift 1)"}
                            </span>
                            <span className="text-sm md:text-xl font-black mt-1.5 tabular-nums text-indigo-700">{formatCurrency(modalAwal)}</span>
                            <span className="text-[7px] md:text-[8px] font-bold text-slate-300 mt-0.5 uppercase tracking-widest">MODAL AWAL</span>
                          </div>
                          <div className="p-3 md:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-slate-400">Modal Tambahan (Opsional)</span>
                            <span className="text-sm md:text-xl font-black mt-1.5 tabular-nums text-amber-700">{formatCurrency(modalTambahan)}</span>
                            <span className="text-[7px] md:text-[8px] font-bold text-slate-300 mt-0.5 uppercase tracking-widest">MODAL TAMBAHAN</span>
                          </div>
                          {selectedShift === 2 && (
                            <div className="p-3 md:p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between col-span-2">
                              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-slate-400">Selisih Shift 1 (Pagi)</span>
                              <span className={`text-sm md:text-xl font-black mt-1.5 tabular-nums ${shift1Difference === 0 ? "text-slate-600" : shift1Difference > 0 ? "text-amber-600" : "text-rose-600"}`}>{formatCurrency(shift1Difference)}</span>
                              <span className="text-[7px] md:text-[8px] font-bold text-slate-300 mt-0.5 uppercase tracking-widest">SELISIH SHIFT 1</span>
                            </div>
                          )}
                       </div>
                     </TabsContent>

                    {/* Tab 3: Operasional & Belanja */}
                    <TabsContent value="operasional" className="m-0 space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <Wallet className="h-4 w-4" /> Pengeluaran Operasional Toko/Kontainer ({keuanganData?.operationalDetails?.length || 0})
                        </h4>
                        {keuanganData?.operationalDetails && keuanganData.operationalDetails.length > 0 ? (
                          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                            {keuanganData.operationalDetails.map((op: any, i: number) => (
                              <div key={i} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/40 flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                  <span className="text-xs font-black uppercase text-slate-700 block">{op.pembayaran}</span>
                                  {(op.shift || op.karyawanNama) && (
                                    <span className="text-[9px] font-bold text-slate-400 uppercase block">
                                      {op.shift ? `Shift ${op.shift}` : 'Shift 2'} {op.karyawanNama ? `• ${op.karyawanNama}` : ''}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-black text-rose-600 tabular-nums shrink-0">{formatCurrency(op.nominal)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase">Tidak ada operasional dicatat.</div>
                        )}
                      </div>

                      <div className="space-y-4 mt-6">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <Layers className="h-4 w-4" /> Belanja Bahan Baku ({keuanganData?.purchaseDetails?.length || 0})
                        </h4>
                         {keuanganData?.purchaseDetails && keuanganData.purchaseDetails.length > 0 ? (
                           <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                             {keuanganData.purchaseDetails.map((pur: any, i: number) => (
                               <div key={i} className="border border-slate-100 rounded-2xl p-3 md:p-4 bg-slate-50/40">
                                <div className="flex justify-between items-start pb-2 border-b border-slate-100 gap-4">
                                  <div className="space-y-1">
                                    <span className="text-xs font-black text-slate-800 uppercase italic block">Nota: {pur.nomorNota || "-"}</span>
                                    {(pur.shift || pur.karyawanNama) && (
                                      <span className="text-[9px] font-bold text-slate-400 uppercase block">
                                        {pur.shift ? `Shift ${pur.shift}` : 'Shift 2'} {pur.karyawanNama ? `• ${pur.karyawanNama}` : ''}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-black text-rose-600 tabular-nums shrink-0">{formatCurrency(pur.total)}</span>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {(pur.items || []).map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-[11px] text-slate-500 font-bold uppercase">
                                      <span>{item.materialName || "-"}</span>
                                      <span className="tabular-nums">{item.qty} x {formatCurrency(item.price)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase">Tidak ada rincian belanja bahan baku.</div>
                        )}
                      </div>
                    </TabsContent>

                    {/* Tab 4: Catatan & Selisih */}
                    <TabsContent value="catatan" className="m-0 space-y-4">
                      <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Catatan/Komentar Penutupan</h4>
                        <p className="text-xs text-slate-700 italic font-bold leading-relaxed whitespace-pre-line">
                          {catatanKaryawan ? `"${catatanKaryawan}"` : "Tidak ada catatan/pesan khusus dari karyawan untuk tanggal ini."}
                        </p>
                      </div>

                      <div className="p-5 rounded-2xl border border-rose-100 bg-rose-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-500">Selisih Kas Terakhir</h4>
                          <p className="text-xs text-slate-500 font-bold mt-1 uppercase">Selisih nominal uang cash di pegang dengan nominal wajib setor.</p>
                        </div>
                        <span className={`text-xl font-black tabular-nums ${selisihKeuangan === 0 ? "text-emerald-600" : selisihKeuangan > 0 ? "text-amber-600" : "text-rose-600"}`}>
                          {formatCurrency(selisihKeuangan)}
                        </span>
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 p-6 md:p-8 gap-6">
                {/* Left Side: Summary of Sales */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ikhtisar Pendapatan & Pembayaran</h4>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-4">
                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">
                        {selectedShift === 1 ? "Penjualan (Input)" : "Penjualan (Excel)"}
                      </span>
                      <span className="text-sm md:text-base font-black text-slate-900 tabular-nums mt-1 md:mt-0">{formatCurrency(totalPenjualan)}</span>
                    </div>

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Total QRIS</span>
                      <span className="text-sm md:text-base font-black text-indigo-600 tabular-nums mt-1 md:mt-0">{formatCurrency(totalQris)}</span>
                    </div>

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Total Cash</span>
                      <span className="text-sm md:text-base font-black text-emerald-600 tabular-nums mt-1 md:mt-0">{formatCurrency(totalCash)}</span>
                    </div>

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">
                        {selectedShift === 1 ? "Modal Awal (Pagi)" : "Modal Awal (Shift 1)"}
                      </span>
                      <span className="text-sm md:text-base font-black text-indigo-700 tabular-nums mt-1 md:mt-0">{formatCurrency(modalAwal)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Summary of Finances / Expenses */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ikhtisar Pengeluaran & Setoran</h4>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-4">
                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Operasional</span>
                      <span className="text-sm md:text-base font-black text-rose-600 tabular-nums mt-1 md:mt-0">{formatCurrency(totalOperasional)}</span>
                    </div>

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Belanja Bahan</span>
                      <span className="text-sm md:text-base font-black text-rose-600 tabular-nums mt-1 md:mt-0">{formatCurrency(totalBelanja)}</span>
                    </div>

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4 col-span-2 md:col-span-1">
                      <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Modal Tambahan</span>
                      <span className="text-sm md:text-base font-black text-amber-700 tabular-nums mt-1 md:mt-0">{formatCurrency(modalTambahan)}</span>
                    </div>

                    {selectedShift === 2 && (
                      <div className="flex flex-col justify-between p-3 rounded-2xl border border-slate-50 bg-slate-50/50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4 col-span-2 md:col-span-1">
                        <span className="text-[9px] md:text-xs font-black uppercase text-slate-600 leading-snug">Selisih Shift 1</span>
                        <span className={`text-sm md:text-base font-black tabular-nums mt-1 md:mt-0 ${shift1Difference === 0 ? "text-slate-600" : shift1Difference > 0 ? "text-amber-600" : "text-rose-600"}`}>
                          {formatCurrency(shift1Difference)}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col justify-between p-3 rounded-2xl border border-emerald-200 bg-emerald-50 h-20 md:h-auto md:flex-row md:items-center md:px-5 md:py-4 col-span-2 md:col-span-1">
                      <span className="text-[9px] md:text-xs font-black uppercase text-emerald-700 leading-snug">Wajib Setor</span>
                      <span className="text-sm md:text-base font-black text-emerald-700 tabular-nums mt-1 md:mt-0">{formatCurrency(sisaUangDisetor)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cash Verification Footer */}
              {keuanganData && (
                <div className="bg-slate-50/30 p-6 md:p-8 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Wajib Setor</span>
                      <span className="text-lg font-black mt-2 text-slate-800 tabular-nums">{formatCurrency(sisaUangDisetor)}</span>
                    </div>
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Uang Fisik Diterima (Cash On Hand)</span>
                      <span className="text-lg font-black mt-2 text-slate-800 tabular-nums">{formatCurrency(uangDiPegang)}</span>
                    </div>
                    <div className={`p-4 bg-white rounded-2xl shadow-sm border flex flex-col justify-between ${selisihKeuangan === 0 ? "border-emerald-200" : "border-rose-200"}`}>
                      <span className={`text-[9px] font-black uppercase tracking-wider ${selisihKeuangan === 0 ? "text-emerald-600" : "text-rose-500"}`}>Selisih Verifikasi</span>
                      <span className={`text-lg font-black mt-2 tabular-nums ${selisihKeuangan === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {formatCurrency(selisihKeuangan)}
                      </span>
                    </div>
                  </div>

                  {/* Catatan / Pesan Karyawan */}
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Catatan dari Karyawan</span>
                    <p className="text-xs text-slate-700 italic font-bold leading-relaxed whitespace-pre-line">
                      {catatanKaryawan ? `"${catatanKaryawan}"` : "Tidak ada catatan khusus dari karyawan."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
