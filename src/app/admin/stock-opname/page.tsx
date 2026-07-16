"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  RefreshCcw,
  AlertCircle,
  Archive,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, doc, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Types ---
interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyBesar?: number | string;
  qtyKontainerBesar?: number | string;
  qtyKontainerKecil?: number | string;
  qtyKecil?: number | string;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  [key: string]: unknown;
}

interface HistoryItem {
  id?: string;
  nama?: string;
  code?: string;
  unitBesar?: string;
  beforeQtyBesar?: number;
  afterQtyBesar?: number;
  diffQtyBesar?: number;
  before?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  after?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
}

interface HistoryLog {
  id: string;
  date?: { toDate?: () => Date };
  note?: string;
  items?: HistoryItem[];
}

export default function AdminStockOpnamePage() {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [processing, setProcessing] = useState(false);

  // State for warehouse inputs
  const [warehouseInputs, setWarehouseInputs] = useState<Record<string, number>>({});

  // State for container inputs
  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number; grams: number }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number>>({});

  // Fetch ingredients
  const materialsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("code", "asc")), 
    [db]
  );
  const { data: materials, loading } = useCollection(materialsQuery);

  // Fetch histories
  const warehouseHistoryQuery = useMemoFirebase(() => 
    query(collection(db, "opnam_gudang"), orderBy("date", "desc")), 
    [db]
  );
  const { data: historiesGudang } = useCollection(warehouseHistoryQuery);

  const containerHistoryQuery = useMemoFirebase(() => 
    query(collection(db, "opnam_harian"), orderBy("date", "desc")), 
    [db]
  );
  const { data: historiesKontainer } = useCollection(containerHistoryQuery);

  // Helpers for grams conversion
  const getUnitWeight = (item: BahanBaku) => {
    const gramPerBesar = Number(item.gramPerBesar || 0);
    const konversi = Number(item.qtyKecil || 1);
    return konversi > 0 ? gramPerBesar / konversi : 0;
  };

  const getTotalWeightFromAktif = (item: BahanBaku, aktifQty: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    return Number(aktifQty || 0) * getUnitWeight(item) + beratBungkus;
  };

  const getAktifFromGrams = (item: BahanBaku, gramsValue: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    const netGrams = Math.max(0, Number(gramsValue || 0) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    return unitWeight > 0 ? netGrams / unitWeight : 0;
  };

  // Filter ingredients
  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    return (materials as BahanBaku[]).filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [materials, searchTerm]);

  // Initialize inputs when materials load — setState is called inside effect body (valid data-sync pattern here).
  useEffect(() => {
    if (!materials) return;
    const initialWarehouse: Record<string, number> = {};
    const initialKontainer: Record<string, { aktif: number; grams: number }> = {};
    const initialBulk: Record<string, number> = {};

    (materials as BahanBaku[]).forEach(it => {
      // Warehouse
      initialWarehouse[it.id] = Number(it.qtyBesar || 0);

      // Container
      const aktif = Number(it.qtyKontainerKecil || 0);
      const grams = getTotalWeightFromAktif(it, aktif);
      initialKontainer[it.id] = { aktif, grams };
      initialBulk[it.id] = Number(it.qtyKontainerBesar || 0);
    });

    queueMicrotask(() => {
      setWarehouseInputs(initialWarehouse);
      setKontainerInputs(initialKontainer);
      setBulkInputs(initialBulk);
    });
  }, [materials, getTotalWeightFromAktif]);

  // Handle finalization for warehouse
  const handleFinalizeGudang = async () => {
    if (processing) return;
    const confirm = window.confirm("Apakah Anda yakin ingin memperbarui stok gudang utama dengan data fisik?");
    if (!confirm) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: HistoryItem[] = [];

      (materials as BahanBaku[] || []).forEach((it) => {
        const beforeQty = Number(it.qtyBesar || 0);
        const afterQty = warehouseInputs[it.id] !== undefined ? Number(warehouseInputs[it.id]) : beforeQty;

        const ref = doc(db, "bahan-baku", it.id);
        batch.update(ref, { qtyBesar: afterQty });

        historyItems.push({
          id: it.id,
          code: it.code || "-",
          nama: it.nama || "-",
          beforeQtyBesar: beforeQty,
          afterQtyBesar: afterQty,
          diffQtyBesar: afterQty - beforeQty,
          unitBesar: it.satuanBesar || "-"
        });
      });

      await batch.commit();

      await addDoc(collection(db, "opnam_gudang"), {
        date: serverTimestamp(),
        note: "Stock Opname Gudang Utama (Admin)",
        items: historyItems
      });

      window.alert("Stok gudang utama berhasil disinkronisasi!");
    } catch (err) {
      console.error(err);
      window.alert("Gagal melakukan finalisasi stock opname gudang.");
    } finally {
      setProcessing(false);
    }
  };

  // Handle finalization for container
  const handleFinalizeKontainer = async () => {
    if (processing) return;
    const confirm = window.confirm("Apakah Anda yakin ingin memperbarui stok kontainer dengan data fisik?");
    if (!confirm) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: HistoryItem[] = [];

      (materials as BahanBaku[] || []).forEach((it) => {
        const beforeBulk = Number(it.qtyKontainerBesar || 0);
        const beforeAktif = Number(it.qtyKontainerKecil || 0);
        const afterBulk = bulkInputs[it.id] !== undefined ? Number(bulkInputs[it.id]) : beforeBulk;
        const afterAktif = kontainerInputs[it.id]?.aktif !== undefined ? Number(kontainerInputs[it.id].aktif) : beforeAktif;

        const ref = doc(db, "bahan-baku", it.id);
        batch.update(ref, { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif });

        historyItems.push({
          id: it.id,
          code: it.code || "-",
          nama: it.nama || "-",
          before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
          after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif }
        });
      });

      await batch.commit();

      await addDoc(collection(db, "opnam_harian"), {
        date: serverTimestamp(),
        note: "Stock Opname Kontainer (Admin)",
        items: historyItems
      });

      window.alert("Stok kontainer berhasil disinkronisasi!");
    } catch (err) {
      console.error(err);
      window.alert("Gagal melakukan finalisasi stock opname kontainer.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Stock Opname
          </h1>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Pencocokan Stok Fisik vs Sistem — Kontainer &amp; Gudang Utama
          </p>
        </div>
      </div>

      <Tabs defaultValue="kontainer" className="w-full">
        {/* Tab Triggers */}
        <TabsList className="mb-6 grid h-14 w-full max-w-2xl grid-cols-2 rounded-[2rem] border border-slate-100 bg-white p-2 shadow-sm">
          <TabsTrigger value="kontainer" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Layers className="mr-2 h-4 w-4" /> Tab 1: Opname Kontainer
          </TabsTrigger>
          <TabsTrigger value="gudang" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Archive className="mr-2 h-4 w-4" /> Tab 2: Opname Gudang
          </TabsTrigger>
        </TabsList>

        {/* Search Input Box */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 bg-white border border-slate-100 rounded-t-[2.5rem] border-b-none">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Cari Bahan Baku
            </span>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari bahan..."
              className="rounded-2xl border-none bg-slate-50 pl-12 h-12 font-bold"
            />
          </div>
        </div>

        {/* ── TAB 1: OPNAME KONTAINER ── */}
        <TabsContent value="kontainer" className="mt-0">
          <Card className="rounded-b-[2.5rem] rounded-t-none border-t-none border-slate-100 shadow-sm bg-white overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-20">
                  <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Memuat data...</p>
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                  Bahan baku tidak ditemukan.
                </div>
              ) : (
                <table className="w-full text-left min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Bahan Baku</th>
                      <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Bulk (Sistem)</th>
                      <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Aktif (Sistem)</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Input Fisik (Bulk)</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Input Fisik (Aktif)</th>
                      <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6">
                          <p className="text-[10px] font-bold text-primary mb-1">{item.code}</p>
                          <p className="text-sm font-black text-slate-900 uppercase italic">{item.nama}</p>
                        </td>
                        <td className="px-6 py-6 text-right font-black text-indigo-600 text-lg tabular-nums">
                          {Number(item.qtyKontainerBesar || 0).toLocaleString("id-ID")}
                        </td>
                        <td className="px-6 py-6 text-right font-black text-emerald-600 text-lg tabular-nums">
                          {Number(item.qtyKontainerKecil || 0).toLocaleString("id-ID")}
                        </td>
                        <td className="px-8 py-6">
                          <div className="relative w-36">
                            <Input 
                              type="number"
                              value={bulkInputs[item.id] ?? ""}
                              onChange={(e) => setBulkInputs(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                              placeholder="0"
                              className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-indigo-300 uppercase">{item.satuanBesar}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                            <div className="relative w-32">
                              <Input 
                                type="number"
                                value={kontainerInputs[item.id]?.aktif ?? ""}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      aktif: val,
                                      grams: getTotalWeightFromAktif(item, val)
                                    }
                                  }));
                                }}
                                placeholder="0"
                                className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-emerald-300 uppercase">{item.satuanKecil}</span>
                            </div>
                            <div className="relative w-32">
                              <Input 
                                type="number"
                                value={kontainerInputs[item.id]?.grams ?? ""}
                                onChange={(e) => {
                                  const gramsVal = Number(e.target.value);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      grams: gramsVal,
                                      aktif: Math.round(getAktifFromGrams(item, gramsVal) * 100) / 100
                                    }
                                  }));
                                }}
                                placeholder={item.satuanKalibrasi === "Pcs" ? "0 pcs" : "0 g"}
                                className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-slate-400 uppercase">
                                {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-center text-[10px] font-black uppercase text-slate-500">
                          {item.satuanBesar} / {item.satuanKecil}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Opname Kontainer */}
            <div className="p-10 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-400">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest">Finalisasi Update Stok Kontainer</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1 max-w-md leading-relaxed">
                    Tindakan ini akan langsung memperbarui stok bulk dan aktif kontainer dalam sistem.
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleFinalizeKontainer}
                disabled={processing || loading}
                className="w-full md:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-white px-10 h-14 font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20"
              >
                {processing ? "Memproses..." : "Finalisasi & Update Stok Kontainer"}
              </Button>
            </div>

            {/* History Container */}
            <div className="p-10 bg-white border-t border-slate-50">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 mb-6">
                Histori Opname Kontainer Terakhir
              </h3>
              <div className="space-y-4">
                {!historiesKontainer || historiesKontainer.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-black uppercase">
                    Belum ada histori opname kontainer.
                  </div>
                ) : (
                  (historiesKontainer as HistoryLog[]).slice(0, 5).map((h) => (
                    <div key={h.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Tanggal Opname Kontainer
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {h.date?.toDate ? h.date.toDate().toLocaleString("id-ID") : "-"}
                          </p>
                        </div>
                        <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-4 py-1 text-[9px] font-black uppercase">
                          {h.note || "Opname Kontainer"}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs bg-white rounded-xl border border-slate-50">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2 font-black uppercase text-slate-500">Nama Bahan</th>
                              <th className="px-4 py-2 font-black uppercase text-slate-500 text-right">Sebelum (Bulk/Aktif)</th>
                              <th className="px-4 py-2 font-black uppercase text-slate-500 text-right">Sesudah (Bulk/Aktif)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(h.items || []).map((it, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-3 font-bold text-slate-900 uppercase italic">
                                  {it.nama}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-600">
                                  {it.before?.qtyKontainerBesar || 0} / {it.before?.qtyKontainerKecil || 0}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-600">
                                  {it.after?.qtyKontainerBesar || 0} / {it.after?.qtyKontainerKecil || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── TAB 2: OPNAME GUDANG ── */}
        <TabsContent value="gudang" className="mt-0">
          <Card className="rounded-b-[2.5rem] rounded-t-none border-t-none border-slate-100 shadow-sm bg-white overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-20">
                  <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Memuat data...</p>
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                  Bahan baku tidak ditemukan.
                </div>
              ) : (
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Bahan Baku</th>
                      <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Stok Sistem</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Stok Fisik Gudang</th>
                      <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Satuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6">
                          <p className="text-[10px] font-bold text-primary mb-1">{item.code}</p>
                          <p className="text-sm font-black text-slate-900 uppercase italic">{item.nama}</p>
                        </td>
                        <td className="px-6 py-6 text-right font-black text-slate-900 text-xl tabular-nums">
                          {Number(item.qtyBesar || 0).toLocaleString("id-ID")}
                        </td>
                        <td className="px-8 py-6">
                          <div className="relative w-36">
                            <Input 
                              type="number"
                              value={warehouseInputs[item.id] ?? ""}
                              onChange={(e) => setWarehouseInputs(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                              placeholder="0"
                              className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg"
                            />
                          </div>
                        </td>
                        <td className="px-10 py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {item.satuanBesar || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Opname Gudang */}
            <div className="p-10 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest">Finalisasi Update Stok Gudang</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1 max-w-md leading-relaxed">
                    Tindakan ini akan langsung memperbarui stok fisik gudang utama dalam sistem. Pastikan hitungan fisik sudah benar.
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleFinalizeGudang}
                disabled={processing || loading}
                className="w-full md:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-white px-10 h-14 font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20"
              >
                {processing ? "Memproses..." : "Finalisasi & Update Stok Gudang"}
              </Button>
            </div>

            {/* History Warehouse */}
            <div className="p-10 bg-white border-t border-slate-50">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 mb-6">
                Histori Opname Gudang Terakhir
              </h3>
              <div className="space-y-4">
                {!historiesGudang || historiesGudang.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-black uppercase">
                    Belum ada histori opname gudang.
                  </div>
                ) : (
                  (historiesGudang as HistoryLog[]).slice(0, 5).map((h) => (
                    <div key={h.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Tanggal Opname Gudang
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {h.date?.toDate ? h.date.toDate().toLocaleString("id-ID") : "-"}
                          </p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-4 py-1 text-[9px] font-black uppercase">
                          {h.note || "Opname Gudang"}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs bg-white rounded-xl border border-slate-50">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2 font-black uppercase text-slate-500">Nama Bahan</th>
                              <th className="px-4 py-2 font-black uppercase text-slate-500 text-right">Sebelum</th>
                              <th className="px-4 py-2 font-black uppercase text-slate-500 text-right">Sesudah</th>
                              <th className="px-4 py-2 font-black uppercase text-slate-500 text-right">Selisih</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(h.items || []).filter((it) => it.diffQtyBesar !== 0).map((it, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-3 font-bold text-slate-900 uppercase italic">
                                  {it.nama}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-600">
                                  {it.beforeQtyBesar} {it.unitBesar}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-600">
                                  {it.afterQtyBesar} {it.unitBesar}
                                </td>
                                <td className={`px-4 py-3 text-right font-black ${it.diffQtyBesar > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {it.diffQtyBesar > 0 ? `+${it.diffQtyBesar}` : it.diffQtyBesar} {it.unitBesar}
                                </td>
                              </tr>
                            ))}
                            {(h.items || []).filter((it) => it.diffQtyBesar !== 0).length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-3 text-center text-slate-400 font-bold">
                                  Tidak ada selisih stok fisik vs sistem.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
