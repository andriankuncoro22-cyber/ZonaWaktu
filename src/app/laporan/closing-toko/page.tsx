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
    return keuanganLogs[0];
  }, [keuanganLogs]);

  const loading = loadingPenjualan || loadingKeuangan;

  const hasData = useMemo(() => {
    return !!penjualanData || !!keuanganData;
  }, [penjualanData, keuanganData]);

  // Extract financial variables
  const totalPenjualan = penjualanData?.total || 0;
  const totalQris = penjualanData?.transactionReport?.qrisTotal || 0;
  const totalCash = penjualanData?.transactionReport?.cashTotal || 0;
  const totalGofood = penjualanData?.transactionReport?.goFoodTotal || 0;
  const totalLainnya = penjualanData?.transactionReport?.otherTotal || 0;

  const totalOperasional = keuanganData?.operationalTotal || 0;
  const totalBelanja = keuanganData?.purchaseTotal || 0;
  const sisaUangDisetor = keuanganData?.expectedCashToSettle || 0;
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

        {/* Date Picker */}
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white px-5 py-3 shadow-sm self-start md:self-auto">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-none bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none"
          />
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
            Karyawan belum melakukan input closing toko atau keuangan kontainer untuk tanggal {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </Card>
      ) : (
        <div className="space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <Card className="p-6 md:p-8 bg-gradient-to-br from-blue-50 to-blue-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-blue-900">
                <TrendingUp className="h-32 w-32" />
              </div>
              <div className="space-y-4">
                <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 text-blue-700">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Penjualan</p>
                  <h3 className="text-2xl md:text-3xl font-black text-blue-900 mt-1">{formatCurrency(totalPenjualan)}</h3>
                </div>
              </div>
            </Card>

            <Card className="p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-indigo-900">
                <Coins className="h-32 w-32" />
              </div>
              <div className="space-y-4">
                <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-700">
                  <Coins className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total QRIS</p>
                  <h3 className="text-2xl md:text-3xl font-black text-indigo-900 mt-1">{formatCurrency(totalQris)}</h3>
                </div>
              </div>
            </Card>

            <Card className="p-6 md:p-8 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-none shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="absolute right-4 bottom-2 opacity-5 group-hover:scale-110 transition-transform duration-500 text-emerald-900">
                <Wallet className="h-32 w-32" />
              </div>
              <div className="space-y-4">
                <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-700">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Cash</p>
                  <h3 className="text-2xl md:text-3xl font-black text-emerald-900 mt-1">{formatCurrency(totalCash)}</h3>
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
                <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-6 md:p-10 max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <DialogHeader className="border-b border-slate-100 pb-4 mb-4">
                    <DialogTitle className="text-xl md:text-2xl font-black uppercase italic text-slate-900 flex items-center gap-3">
                      <Eye className="h-6 w-6 text-primary" /> Detail Input Karyawan - {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </DialogTitle>
                  </DialogHeader>

                  <Tabs defaultValue="produk" className="w-full">
                    <TabsList className="bg-slate-50 p-1 rounded-xl grid grid-cols-4 gap-1 mb-6 border border-slate-100">
                      <TabsTrigger value="produk" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2">
                        Produk Terjual
                      </TabsTrigger>
                      <TabsTrigger value="transaksi" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2">
                        Pembayaran
                      </TabsTrigger>
                      <TabsTrigger value="operasional" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2">
                        Operasional & Belanja
                      </TabsTrigger>
                      <TabsTrigger value="catatan" className="rounded-lg font-black uppercase text-[8px] md:text-[9px] tracking-wider py-2">
                        Catatan
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Produk Terjual */}
                    <TabsContent value="produk" className="m-0 space-y-4">
                      {penjualanData?.items && penjualanData.items.length > 0 ? (
                        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
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
                      ) : (
                        <div className="text-center py-10 text-slate-400 text-xs font-black uppercase">Tidak ada detail produk terjual (Laporan Excel Kosong).</div>
                      )}
                    </TabsContent>

                    {/* Tab 2: Rincian Pembayaran */}
                    <TabsContent value="transaksi" className="m-0 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {[
                          { label: "Nominal QRIS", value: totalQris, helper: "QRIS", color: "text-indigo-600" },
                          { label: "Nominal Cash", value: totalCash, helper: "CASH", color: "text-emerald-600" },
                          { label: "Nominal GoFood", value: totalGofood, helper: "GOFOOD", color: "text-red-500" },
                          { label: "Metode Lainnya", value: totalLainnya, helper: "LAINNYA", color: "text-slate-500" },
                        ].map((pay, i) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{pay.label}</span>
                            <span className={`text-xl font-black mt-2 tabular-nums ${pay.color}`}>{formatCurrency(pay.value)}</span>
                            <span className="text-[8px] font-bold text-slate-300 mt-1 uppercase tracking-widest">{pay.helper}</span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Tab 3: Operasional & Belanja */}
                    <TabsContent value="operasional" className="m-0 space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <Wallet className="h-4 w-4" /> Pengeluaran Operasional Toko/Kontainer ({keuanganData?.operationalDetails?.length || 0})
                        </h4>
                        {keuanganData?.operationalDetails && keuanganData.operationalDetails.length > 0 ? (
                          <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50">
                            {keuanganData.operationalDetails.map((op: any, i: number) => (
                              <div key={i} className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                                <span className="text-xs font-black uppercase text-slate-700">{op.pembayaran}</span>
                                <span className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(op.nominal)}</span>
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
                          <div className="space-y-3">
                            {keuanganData.purchaseDetails.map((pur: any, i: number) => (
                              <div key={i} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/40">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                  <span className="text-xs font-black text-slate-800 uppercase italic">Nota: {pur.nomorNota || "-"}</span>
                                  <span className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(pur.total)}</span>
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

                      <div className="p-5 rounded-2xl border border-rose-100 bg-rose-50/30 flex items-center justify-between">
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
                  
                  <div className="flex items-center justify-between rounded-2xl border border-slate-50 bg-slate-50/50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-slate-600">Total Penjualan (Excel)</span>
                    <span className="text-base font-black text-slate-900 tabular-nums">{formatCurrency(totalPenjualan)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-50 bg-slate-50/50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-slate-600">Total QRIS</span>
                    <span className="text-base font-black text-indigo-600 tabular-nums">{formatCurrency(totalQris)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-50 bg-slate-50/50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-slate-600">Total Cash</span>
                    <span className="text-base font-black text-emerald-600 tabular-nums">{formatCurrency(totalCash)}</span>
                  </div>
                </div>

                {/* Right Side: Summary of Finances / Expenses */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ikhtisar Pengeluaran & Setoran</h4>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-50 bg-slate-50/50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-slate-600">Total Pengeluaran Operasional</span>
                    <span className="text-base font-black text-rose-600 tabular-nums">{formatCurrency(totalOperasional)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-50 bg-slate-50/50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-slate-600">Total Belanja Bahan Baku</span>
                    <span className="text-base font-black text-rose-600 tabular-nums">{formatCurrency(totalBelanja)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-emerald-50 px-5 py-4">
                    <span className="text-xs font-black uppercase text-emerald-700">Sisa Uang Yang Harus Disetorkan</span>
                    <span className="text-lg font-black text-emerald-700 tabular-nums">{formatCurrency(sisaUangDisetor)}</span>
                  </div>
                </div>
              </div>

              {/* Cash Verification Footer */}
              {keuanganData && (
                <div className="bg-slate-50/30 p-6 md:p-8 grid gap-4 sm:grid-cols-3">
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
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
