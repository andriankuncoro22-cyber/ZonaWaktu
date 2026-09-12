"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  RefreshCcw,
  Archive,
  Layers,
  Building2,
  Store,
  Save,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  useActiveBranch,
  WarehouseId,
  BranchId,
  WAREHOUSE_LIST,
  BRANCH_LIST,
  getWarehouseForBranch,
  warehouseCollection,
  warehouseDoc,
  branchDoc,
  branchCollection
} from "@/firebase";
import { query, orderBy, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- Types ---
interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyBesar?: number | string;
  qtyGudangKecil?: number | string;
  qtyKontainerBesar?: number | string;
  qtyKontainerKecil?: number | string;
  qtyKecil?: number | string;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  satuanKalibrasi?: string;
  metodePembelian?: string;
  [key: string]: unknown;
}

interface HistoryItem {
  id?: string;
  nama?: string;
  code?: string;
  unitBesar?: string;
  unitKecil?: string;
  beforeQtyBesar?: number;
  afterQtyBesar?: number;
  diffQtyBesar?: number;
  beforeQtyGudangKecil?: number;
  afterQtyGudangKecil?: number;
  diffQtyGudangKecil?: number;
  before?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  after?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  diffBulk?: number;
  diffAktif?: number;
}

export default function AdminStockOpnamePage() {
  const db = useFirestore();
  const { toast } = useToast();
  const activeBranch = useActiveBranch();

  const [activeTab, setActiveTab] = useState<"kontainer" | "gudang">("kontainer");
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseId>(() => getWarehouseForBranch(activeBranch));
  const [selectedBranch, setSelectedBranch] = useState<BranchId>(activeBranch);

  const [searchTerm, setSearchTerm] = useState("");
  const [processing, setProcessing] = useState(false);

  // State for warehouse inputs
  const [warehouseInputs, setWarehouseInputs] = useState<Record<string, { besar: number | string; kecil: number | string }>>({});

  // State for container inputs
  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number | string; grams: number | string }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number | string>>({});

  // Sync default when activeBranch changes
  useEffect(() => {
    queueMicrotask(() => {
      setSelectedWarehouse(getWarehouseForBranch(activeBranch));
      setSelectedBranch(activeBranch);
    });
  }, [activeBranch]);

  // Fetch ingredients dynamically based on active tab and location
  // 1. Gudang Materials
  const warehouseMaterialsQuery = useMemoFirebase(
    () => query(warehouseCollection(db, "bahan-baku", selectedWarehouse), orderBy("code", "asc")),
    [db, selectedWarehouse]
  );
  const { data: rawWarehouseMats, loading: loadingWarehouse } = useCollection(warehouseMaterialsQuery);

  // 2. Kontainer Materials
  const containerMaterialsQuery = useMemoFirebase(
    () => query(branchCollection(db, "bahan-baku", selectedBranch), orderBy("code", "asc")),
    [db, selectedBranch]
  );
  const { data: rawContainerMats, loading: loadingContainer } = useCollection(containerMaterialsQuery);

  const materials = useMemo(() => {
    if (activeTab === "gudang") {
      const list = (rawWarehouseMats as BahanBaku[]) || [];
      return list.filter(m => m.metodePembelian !== "Pembuatan Sendiri");
    }
    return (rawContainerMats as BahanBaku[]) || [];
  }, [activeTab, rawWarehouseMats, rawContainerMats]);

  const loading = activeTab === "gudang" ? loadingWarehouse : loadingContainer;

  // Helpers for grams conversion
  const getUnitWeight = (item: BahanBaku) => {
    const gramPerBesar = Number(item.gramPerBesar || 0);
    const konversi = Number(item.qtyKecil || 1);
    return konversi > 0 ? gramPerBesar / konversi : 0;
  };

  const getAktifFromGrams = (item: BahanBaku, gramsValue: unknown) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    const netGrams = Math.max(0, Number(gramsValue || 0) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    return unitWeight > 0 ? netGrams / unitWeight : 0;
  };

  const cleanNumber = (val: unknown): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  // Filter ingredients
  const filteredMaterials = useMemo(() => {
    return materials.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [materials, searchTerm]);

  // Initialize inputs when active list loads
  useEffect(() => {
    if (!materials || materials.length === 0) return;
    const initialWarehouse: Record<string, { besar: number | string; kecil: number | string }> = {};
    const initialKontainer: Record<string, { aktif: number | string; grams: number | string }> = {};
    const initialBulk: Record<string, number | string> = {};

    materials.forEach(it => {
      initialWarehouse[it.id] = { besar: it.qtyBesar ?? 0, kecil: it.qtyGudangKecil ?? 0 };
      initialKontainer[it.id] = { aktif: it.qtyKontainerKecil ?? 0, grams: "" };
      initialBulk[it.id] = it.qtyKontainerBesar ?? 0;
    });

    queueMicrotask(() => {
      setWarehouseInputs(initialWarehouse);
      setKontainerInputs(initialKontainer);
      setBulkInputs(initialBulk);
    });
  }, [materials, activeTab, selectedWarehouse, selectedBranch]);

  // Handle finalization for warehouse
  const handleFinalizeGudang = async () => {
    if (processing) return;
    const locName = WAREHOUSE_LIST[selectedWarehouse].name;
    const confirm = window.confirm(`Apakah Anda yakin ingin memperbarui stok ${locName} dengan data fisik?`);
    if (!confirm) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: HistoryItem[] = [];

      filteredMaterials.forEach((it) => {
        const beforeBesar = Number(it.qtyBesar || 0);
        const beforeKecil = Number(it.qtyGudangKecil || 0);
        const inputBesar = warehouseInputs[it.id]?.besar;
        const inputKecil = warehouseInputs[it.id]?.kecil;

        const afterBesar = Math.max(0, cleanNumber(inputBesar === "" || inputBesar === undefined ? beforeBesar : inputBesar));
        const afterKecil = Math.max(0, cleanNumber(inputKecil === "" || inputKecil === undefined ? beforeKecil : inputKecil));

        const ref = warehouseDoc(db, "bahan-baku", it.id, selectedWarehouse);
        batch.update(ref, { 
          qtyBesar: afterBesar,
          qtyGudangKecil: afterKecil
        });

        historyItems.push({
          id: it.id,
          code: it.code || "-",
          nama: it.nama || "-",
          unitBesar: it.satuanBesar || "-",
          unitKecil: it.satuanKecil || "-",
          beforeQtyBesar: beforeBesar,
          afterQtyBesar: afterBesar,
          diffQtyBesar: afterBesar - beforeBesar,
          beforeQtyGudangKecil: beforeKecil,
          afterQtyGudangKecil: afterKecil,
          diffQtyGudangKecil: afterKecil - beforeKecil
        });
      });

      await batch.commit();

      await addDoc(warehouseCollection(db, "opnam_gudang", selectedWarehouse), {
        date: serverTimestamp(),
        warehouse: selectedWarehouse,
        warehouseName: locName,
        note: `Stock Opname Gudang Utama (Admin - ${locName})`,
        items: historyItems
      });

      toast({
        title: "Stok Gudang Disinkronisasi",
        description: `Stok fisik ${locName} berhasil diperbarui.`
      });
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Finalisasi",
        description: "Terjadi kesalahan sistem saat memperbarui stok gudang."
      });
    } finally {
      setProcessing(false);
    }
  };

  // Handle finalization for container
  const handleFinalizeKontainer = async () => {
    if (processing) return;
    const locName = BRANCH_LIST[selectedBranch].name;
    const confirm = window.confirm(`Apakah Anda yakin ingin memperbarui stok kontainer ${locName} dengan data fisik?`);
    if (!confirm) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: HistoryItem[] = [];

      filteredMaterials.forEach((it) => {
        const beforeBulk = Number(it.qtyKontainerBesar || 0);
        const beforeAktif = Number(it.qtyKontainerKecil || 0);
        const inputBulk = bulkInputs[it.id];
        const inputAktif = kontainerInputs[it.id]?.aktif;

        const afterBulk = Math.max(0, cleanNumber(inputBulk === "" || inputBulk === undefined ? beforeBulk : inputBulk));
        const afterAktif = Math.max(0, cleanNumber(inputAktif === "" || inputAktif === undefined ? beforeAktif : inputAktif));

        const ref = branchDoc(db, "bahan-baku", it.id, selectedBranch);
        batch.update(ref, { 
          qtyKontainerBesar: afterBulk, 
          qtyKontainerKecil: afterAktif 
        });

        historyItems.push({
          id: it.id,
          code: it.code || "-",
          nama: it.nama || "-",
          unitBesar: it.satuanBesar || "-",
          unitKecil: it.satuanKecil || "-",
          before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
          after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif },
          diffBulk: afterBulk - beforeBulk,
          diffAktif: afterAktif - beforeAktif
        });
      });

      await batch.commit();

      await addDoc(branchCollection(db, "opnam_harian", selectedBranch), {
        date: serverTimestamp(),
        branch: selectedBranch,
        branchName: locName,
        note: `Stock Opname Kontainer (Admin - ${locName})`,
        items: historyItems
      });

      toast({
        title: "Stok Kontainer Disinkronisasi",
        description: `Stok fisik kontainer ${locName} berhasil diperbarui.`
      });
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Finalisasi",
        description: "Terjadi kesalahan sistem saat memperbarui stok kontainer."
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Stock Opname (Admin)
          </h1>
          <p className="text-[10px] sm:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Pencocokan Stok Fisik vs Sistem — Multi-Gudang &amp; Kontainer
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "kontainer" | "gudang")} className="w-full">
        {/* Tab Triggers & Location Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-100/80 p-1.5 rounded-2xl mb-4">
          <TabsList className="bg-transparent h-10 p-0 gap-1">
            <TabsTrigger 
              value="kontainer" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
            >
              <Layers className="mr-1.5 h-3.5 w-3.5 text-indigo-600" /> 
              <span>Opname Kontainer</span>
            </TabsTrigger>
            <TabsTrigger 
              value="gudang" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
            >
              <Archive className="mr-1.5 h-3.5 w-3.5 text-amber-600" /> 
              <span>Opname Gudang</span>
            </TabsTrigger>
          </TabsList>

          {/* Sub Location Switcher */}
          {activeTab === "gudang" ? (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSelectedWarehouse("gdm")}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedWarehouse === "gdm" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Gudang GDM (Terpadu)
              </button>
              <button
                type="button"
                onClick={() => setSelectedWarehouse("kedungreja")}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedWarehouse === "kedungreja" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Gudang Kedungreja
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSelectedBranch("gdm")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "gdm" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW GDM
              </button>
              <button
                type="button"
                onClick={() => setSelectedBranch("tehwarga")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "tehwarga" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Teh Warga GDM
              </button>
              <button
                type="button"
                onClick={() => setSelectedBranch("kedungreja")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "kedungreja" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW Kedungreja
              </button>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="my-4 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari bahan baku..."
              className="pl-10 h-10 rounded-2xl bg-white border-slate-200 text-xs font-bold"
            />
          </div>
          <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            {activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[selectedBranch].name} • {filteredMaterials.length} Bahan
          </div>
        </div>

        {/* Content Card */}
        <Card className="rounded-3xl border-slate-200/80 shadow-sm bg-white overflow-hidden">
          <div className="overflow-x-auto">
            {/* ── TAB 1: OPNAME KONTAINER ── */}
            <TabsContent value="kontainer" className="mt-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Bahan Baku</th>
                    <th className="py-3 px-4 text-right">Bulk (Sistem)</th>
                    <th className="py-3 px-4 text-right">Aktif (Sistem)</th>
                    <th className="py-3 px-4 text-center">Input Fisik (Bulk)</th>
                    <th className="py-3 px-4 text-center">Input Fisik (Aktif / Gramasi)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Memuat data stok...</span>
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                        Bahan baku tidak ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-black text-indigo-950 font-mono block">{item.code}</span>
                          <span className="font-black text-slate-900 uppercase italic">{item.nama}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-indigo-600 text-sm">
                          {item.qtyKontainerBesar || 0} <span className="text-[10px] text-slate-400 font-normal">{item.satuanBesar}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600 text-sm">
                          {Math.round(Number(item.qtyKontainerKecil || 0))} <span className="text-[10px] text-slate-400 font-normal">{item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input 
                              type="number"
                              value={bulkInputs[item.id] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkInputs(prev => ({ ...prev, [item.id]: val === "" ? "" : Number(val) }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-indigo-400 uppercase">{item.satuanBesar}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative w-28">
                              <Input 
                                type="number"
                                value={kontainerInputs[item.id]?.aktif ?? ""}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 0);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: { aktif: val, grams: val }
                                  }));
                                }}
                                placeholder="0"
                                className="h-9 rounded-xl text-xs font-black text-center pr-8"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-400 uppercase">{item.satuanKecil}</span>
                            </div>
                            <div className="relative w-28">
                              <Input 
                                type="number"
                                value={kontainerInputs[item.id]?.grams ?? ""}
                                onChange={(e) => {
                                  const gramsVal = Number(e.target.value || 0);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      grams: gramsVal,
                                      aktif: Math.round(getAktifFromGrams(item, gramsVal) * 100) / 100
                                    }
                                  }));
                                }}
                                placeholder={item.satuanKalibrasi === "Pcs" ? "0 pcs" : "0 g"}
                                className="h-9 rounded-xl text-xs font-black text-center pr-8"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">
                                {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Action Bar */}
              <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    Finalisasi Opname Kontainer: {BRANCH_LIST[selectedBranch].name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Menyelaraskan stok fisik bulk & aktif kontainer ke sistem.
                  </p>
                </div>
                <Button 
                  onClick={handleFinalizeKontainer}
                  disabled={processing}
                  className="rounded-xl h-10 px-6 font-black uppercase text-xs tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md gap-2"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>Simpan Stok Kontainer</span>
                </Button>
              </div>
            </TabsContent>

            {/* ── TAB 2: OPNAME GUDANG ── */}
            <TabsContent value="gudang" className="mt-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Bahan Baku</th>
                    <th className="py-3 px-4 text-right">Stok Besar (Sistem)</th>
                    <th className="py-3 px-4 text-right">Sisa Kecil (Sistem)</th>
                    <th className="py-3 px-4 text-center">Fisik Gudang (Besar)</th>
                    <th className="py-3 px-4 text-center">Fisik Sisa (Kecil)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Memuat data stok gudang...</span>
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                        Bahan baku tidak ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-black text-indigo-950 font-mono block">{item.code}</span>
                          <span className="font-black text-slate-900 uppercase italic">{item.nama}</span>
                          <span className="text-[10px] text-slate-500 block">1 {item.satuanBesar} = {item.qtyKecil} {item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                          {item.qtyBesar || 0} <span className="text-[10px] text-slate-500 font-normal">{item.satuanBesar}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-700">
                          {item.qtyGudangKecil || 0} <span className="text-[10px] text-slate-500 font-normal">{item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input 
                              type="number"
                              value={warehouseInputs[item.id]?.besar ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWarehouseInputs(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    besar: val === "" ? "" : Number(val),
                                    kecil: prev[item.id]?.kecil ?? 0
                                  }
                                }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{item.satuanBesar}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input 
                              type="number"
                              value={warehouseInputs[item.id]?.kecil ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWarehouseInputs(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    besar: prev[item.id]?.besar ?? 0,
                                    kecil: val === "" ? "" : Number(val)
                                  }
                                }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{item.satuanKecil}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Action Bar */}
              <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    Finalisasi Opname Gudang: {WAREHOUSE_LIST[selectedWarehouse].name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Menyelaraskan stok fisik gudang utama ke sistem.
                  </p>
                </div>
                <Button 
                  onClick={handleFinalizeGudang}
                  disabled={processing}
                  className="rounded-xl h-10 px-6 font-black uppercase text-xs tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md gap-2"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>Simpan Stok Gudang</span>
                </Button>
              </div>
            </TabsContent>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
