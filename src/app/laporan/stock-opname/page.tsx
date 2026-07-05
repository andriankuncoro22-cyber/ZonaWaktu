"use client";

import React, { useMemo, useState } from "react";
import {
  Archive,
  Box,
  CalendarDays,
  ClipboardList,
  Layers,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, orderBy, query } from "firebase/firestore";

const formatNumber = (value: number | string | undefined) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("id-ID").format(num);
};

const toDateValue = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  return new Date(value);
};

const formatDateLabel = (value: any) => {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getMonthKey = (value: any) => {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export default function LaporanStockOpnamePage() {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  const materialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db]
  );
  const { data: materials, loading: loadingMaterials } = useCollection(materialsQuery);

  const historyQuery = useMemoFirebase(
    () => query(collection(db, "opnam_harian"), orderBy("date", "desc")),
    [db]
  );
  const { data: opnameHistory, loading: loadingHistory } = useCollection(historyQuery);

  const filteredMaterials = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (materials as any[])?.filter((item) => {
      return (
        item.nama?.toLowerCase().includes(term) ||
        item.code?.toLowerCase().includes(term)
      );
    }) || [];
  }, [materials, searchTerm]);

  const filteredContainerEntries = useMemo(() => {
    return (opnameHistory as any[])
      ?.map((entry) => ({
        ...entry,
        entryDate: toDateValue(entry.date),
        items: (entry.items || []).map((item: any) => ({
          ...item,
          beforeBulk: Number(item.before?.qtyKontainerBesar || 0),
          beforeAktif: Number(item.before?.qtyKontainerKecil || 0),
          afterBulk: Number(item.after?.qtyKontainerBesar || 0),
          afterAktif: Number(item.after?.qtyKontainerKecil || 0),
          diffBulk: Number(item.after?.qtyKontainerBesar || 0) - Number(item.before?.qtyKontainerBesar || 0),
          diffAktif: Number(item.after?.qtyKontainerKecil || 0) - Number(item.before?.qtyKontainerKecil || 0),
        })),
      }))
      .filter((entry) => {
        const date = entry.entryDate;
        if (selectedDate) {
          return date && date.toISOString().split("T")[0] === selectedDate;
        }
        if (selectedMonth) {
          return date && getMonthKey(date) === selectedMonth;
        }
        return true;
      }) || [];
  }, [opnameHistory, selectedDate, selectedMonth]);

  const warehouseRows = useMemo(() => {
    return filteredMaterials.map((item: any) => ({
      id: item.id,
      code: item.code,
      nama: item.nama,
      qtyBesar: Number(item.qtyBesar || 0),
      satuanBesar: item.satuanBesar || "",
      qtyKontainerBesar: Number(item.qtyKontainerBesar || 0),
      qtyKontainerKecil: Number(item.qtyKontainerKecil || 0),
      satuanKecil: item.satuanKecil || "",
      total: Number(item.qtyBesar || 0) + Number(item.qtyKontainerBesar || 0),
    }));
  }, [filteredMaterials]);

  const resetFilters = () => {
    setSelectedDate("");
    setSelectedMonth("");
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 md:text-4xl">
            Laporan Stock Opnam
          </h1>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 md:text-xs">
            Rekap stok gudang dan hasil opname kontainer dari input harian karyawan
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              Pilih Tanggal
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedMonth("");
              }}
              className="h-10 w-full min-w-[150px] rounded-xl border-none bg-slate-50 text-xs"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              Pilih Bulan
            </label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setSelectedDate("");
              }}
              className="h-10 w-full min-w-[150px] rounded-xl border-none bg-slate-50 text-xs"
            />
          </div>
          <Button
            variant="outline"
            onClick={resetFilters}
            className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"
          >
            Reset Filter
          </Button>
        </div>
      </div>

      <Tabs defaultValue="gudang" className="w-full">
        <TabsList className="mb-6 grid h-14 w-full max-w-2xl grid-cols-2 rounded-[2rem] border border-slate-100 bg-white p-2 shadow-sm">
          <TabsTrigger value="gudang" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Archive className="mr-2 h-4 w-4" /> Stock Opname Gudang
          </TabsTrigger>
          <TabsTrigger value="kontainer" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Layers className="mr-2 h-4 w-4" /> Stock Opname Kontainer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gudang" className="space-y-4">
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <Box className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">Stok Gudang</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Data stok gudang sistem per bahan baku
                  </p>
                </div>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari bahan..."
                  className="w-full rounded-2xl border-none bg-white py-3 pl-12 pr-4 text-xs font-bold shadow-sm outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Gudang</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Bulk Kontainer</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Aktif Kontainer</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMaterials ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                        <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                        Memuat data stok gudang...
                      </td>
                    </tr>
                  ) : warehouseRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                        Tidak ada data stok gudang.
                      </td>
                    </tr>
                  ) : (
                    warehouseRows.map((item) => (
                      <tr key={item.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-4 text-sm font-black text-slate-700">{item.code}</td>
                        <td className="px-4 py-4 text-sm font-bold text-slate-900">{item.nama}</td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700">{formatNumber(item.qtyBesar)} {item.satuanBesar}</td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700">{formatNumber(item.qtyKontainerBesar)} {item.satuanBesar}</td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700">{formatNumber(item.qtyKontainerKecil)} {item.satuanKecil}</td>
                        <td className="px-4 py-4 text-right text-sm font-black text-primary">{formatNumber(item.total)} {item.satuanBesar}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="kontainer" className="space-y-4">
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">Stok Kontainer</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rekap hasil input opname harian karyawan
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {selectedDate ? `Tanggal: ${selectedDate}` : selectedMonth ? `Bulan: ${selectedMonth}` : "Semua periode"}
                </div>
              </div>
            </div>

            {loadingHistory ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                Memuat data opname kontainer...
              </div>
            ) : filteredContainerEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada data stock opname kontainer untuk filter ini.
              </div>
            ) : (
              <div className="space-y-4 p-4 md:p-6">
                {filteredContainerEntries.map((entry: any) => (
                  <div key={entry.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          Tanggal Opname
                        </p>
                        <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                      </div>
                      {entry.note && (
                        <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          {entry.note}
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left">
                        <thead className="bg-white/80">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sebelum Bulk</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sebelum Aktif</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sesudah Bulk</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sesudah Aktif</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.items.map((item: any) => (
                            <tr key={`${entry.id}-${item.id}`} className="border-t border-slate-100 bg-white/70">
                              <td className="px-3 py-3 text-sm font-black text-slate-700">{item.code}</td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-900">{item.nama}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{formatNumber(item.beforeBulk)}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{formatNumber(item.beforeAktif)}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{formatNumber(item.afterBulk)}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{formatNumber(item.afterAktif)}</td>
                              <td className={`px-3 py-3 text-right text-sm font-black ${item.diffBulk + item.diffAktif >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                <div className="flex items-center justify-end gap-1">
                                  {item.diffBulk + item.diffAktif >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                  {formatNumber(item.diffBulk + item.diffAktif)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
