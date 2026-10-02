"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  useFirestore, 
  useConsolidatedCollection,
  useCollection,
  useMemoFirebase
} from "@/firebase";
import { 
  collection, 
  addDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  query,
  orderBy
} from "firebase/firestore";
import { 
  useActiveBranch, 
  BRANCH_LIST, 
  getBranchTheme,
  normalizeBranchId
} from "@/lib/branch-helper";
import { 
  DEFAULT_KONSINYASI_PRODUCTS, 
  isKonsinyasiProduct 
} from "@/lib/konsinyasi-helper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Store, 
  ArrowDownLeft, 
  ArrowUpRight, 
  History, 
  Calendar, 
  CheckCircle2, 
  Trash2, 
  Save, 
  Info,
  Cookie,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KaryawanDoc {
  id: string;
  nama?: string;
  name?: string;
  cabang?: string;
  _branchId?: string;
  status?: string;
}

interface TitipJualItem {
  code: string;
  nama: string;
  qtyMasuk: number;
  qtyRetur: number;
  hargaJual: number;
  hargaDasar: number;
  catatan?: string;
}

interface TitipJualDoc {
  id: string;
  tanggal: string;
  branchId: string;
  vendor: string;
  penerima: string;
  pengembali?: string;
  items: TitipJualItem[];
  catatan?: string;
  status: "aktif" | "selesai";
  createdAt?: unknown;
}

interface RawProductDoc {
  code?: string;
  nama?: string;
  name?: string;
  kategori?: string;
  hargaJual?: number;
  hargaDasar?: number;
  isKonsinyasi?: boolean;
  namaPenitip?: string;
}

interface RawSaleItem {
  code?: string;
  name?: string;
  nama?: string;
  total?: number;
  qty?: number;
}

interface RawSaleDoc {
  tanggal?: string;
  _branchId?: string;
  branchId?: string;
  items?: RawSaleItem[];
}

export default function EmployeeTitipJualPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;
  const theme = getBranchTheme(activeBranch);
  const { toast } = useToast();

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<"masuk" | "retur" | "histori">("masuk");
  const [vendorName, setVendorName] = useState<string>("Penitip Soft Cookies");
  const [karyawanName, setKaryawanName] = useState<string>("");
  const [pengembaliName, setPengembaliName] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Fetch product catalog
  const { data: rawProducts } = useConsolidatedCollection(db, "produk");
  
  // Fetch closing sales (penjualan collection)
  const { data: rawSales } = useConsolidatedCollection(db, "penjualan");

  // Fetch titip-jual records
  const { data: rawTitipJual, loading: loadingTitip } = useConsolidatedCollection(db, "titip-jual");

  // Fetch Karyawan (Consolidated + Root)
  const { data: rawKaryawan } = useConsolidatedCollection(db, "karyawan");
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: listKaryawanRoot } = useCollection(karyawanQuery);

  // Filter Karyawan by current active branch
  const branchKaryawanList = useMemo(() => {
    const map = new Map<string, KaryawanDoc>();
    if (Array.isArray(listKaryawanRoot)) {
      (listKaryawanRoot as KaryawanDoc[]).forEach((k) => {
        if (k.id) map.set(k.id, k);
      });
    }
    if (Array.isArray(rawKaryawan)) {
      (rawKaryawan as KaryawanDoc[]).forEach((k) => {
        if (k.id && !map.has(k.id)) map.set(k.id, k);
      });
    }
    const all = Array.from(map.values());
    const targetBranch = normalizeBranchId(activeBranch);

    return all
      .filter((k) => {
        if (k.status && k.status !== "aktif") return false;
        if (targetBranch === "all") return true;
        const kBranch = normalizeBranchId(k.cabang || k._branchId || "gdm");
        return kBranch === targetBranch;
      })
      .sort((a, b) => (a.nama || a.name || "").localeCompare(b.nama || b.name || ""));
  }, [listKaryawanRoot, rawKaryawan, activeBranch]);

  // Load employee name from localStorage if available in branch
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedUser = localStorage.getItem("karyawan_user") || localStorage.getItem("absensi_user");
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          const savedName = parsed.nama || parsed.name || parsed.username || "";
          if (savedName) {
            setKaryawanName((prev) => prev || savedName);
            setPengembaliName((prev) => prev || savedName);
          }
        }
      } catch {
        // ignore
      }
    });
  }, []);

  // Prepare available konsinyasi products (from catalog + defaults)
  const availableKonsinyasiProducts = useMemo(() => {
    const list = [...DEFAULT_KONSINYASI_PRODUCTS];
    if (rawProducts && Array.isArray(rawProducts)) {
      (rawProducts as RawProductDoc[]).forEach((p) => {
        if (isKonsinyasiProduct(p)) {
          const code = String(p.code || "").trim();
          if (!list.some((item) => item.code === code)) {
            list.push({
              code: code || `KONS-${list.length + 1}`,
              name: p.nama || p.name || "Produk Konsinyasi",
              kategori: p.kategori || "Titip Jual",
              hargaJual: Number(p.hargaJual || 8000),
              hargaDasar: Number(p.hargaDasar || 5000),
              margin: Math.max(0, Number(p.hargaJual || 8000) - Number(p.hargaDasar || 5000)),
              vendor: p.namaPenitip || "Penitip Soft Cookies",
            });
          }
        }
      });
    }
    return list;
  }, [rawProducts]);

  // Form State: Barang Masuk (Barang Datang Pagi)
  const [inputItems, setInputItems] = useState<{ [code: string]: number }>({});

  // Filtered Titip Jual docs for selected date and branch
  const currentBranchDocs = useMemo(() => {
    if (!rawTitipJual) return [];
    return (rawTitipJual as TitipJualDoc[]).filter((docItem) => {
      const docBranch = normalizeBranchId(docItem.branchId || "gdm");
      const matchBranch = activeBranch === "all" || docBranch === activeBranch;
      const matchDate = docItem.tanggal === selectedDate;
      return matchBranch && matchDate;
    });
  }, [rawTitipJual, activeBranch, selectedDate]);

  // Total Barang Masuk per code on this date
  const summaryMasukMap = useMemo(() => {
    const map: { [code: string]: number } = {};
    currentBranchDocs.forEach((docItem) => {
      (docItem.items || []).forEach((it) => {
        const c = String(it.code).trim();
        map[c] = (map[c] || 0) + Number(it.qtyMasuk || 0);
      });
    });
    return map;
  }, [currentBranchDocs]);

  // Total Barang Retur per code on this date
  const summaryReturMap = useMemo(() => {
    const map: { [code: string]: number } = {};
    currentBranchDocs.forEach((docItem) => {
      (docItem.items || []).forEach((it) => {
        const c = String(it.code).trim();
        map[c] = (map[c] || 0) + Number(it.qtyRetur || 0);
      });
    });
    return map;
  }, [currentBranchDocs]);

  // Read Closing Sales (Excel Upload) for this date & branch
  const salesMap = useMemo(() => {
    const map: { [key: string]: number } = {};
    if (!rawSales) return map;

    (rawSales as RawSaleDoc[]).forEach((saleDoc) => {
      const saleDate = String(saleDoc.tanggal || "").split("T")[0];
      if (saleDate !== selectedDate) return;

      const saleBranch = normalizeBranchId(saleDoc._branchId || saleDoc.branchId || "gdm");
      if (activeBranch !== "all" && saleBranch !== activeBranch) return;

      const items = saleDoc.items || [];
      items.forEach((it) => {
        const itCode = String(it.code || "").trim();
        const itName = String(it.name || it.nama || "").trim().toLowerCase();
        const qty = Number(it.total || it.qty || 0);

        if (itCode) {
          map[itCode] = (map[itCode] || 0) + qty;
        }
        if (itName) {
          map[itName] = (map[itName] || 0) + qty;
        }
      });
    });

    return map;
  }, [rawSales, selectedDate, activeBranch]);

  // Form State: Retur Pengembalian (user overrides)
  const [returInputs, setReturInputs] = useState<{ [code: string]: number }>({});

  // Reset retur inputs when date changes
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setReturInputs({});
  };

  // Helper to get retur quantity for a product code
  const getProductReturQty = (code: string, sisa: number) => {
    if (returInputs[code] !== undefined) {
      return returInputs[code];
    }
    const existingRetur = summaryReturMap[code] || 0;
    return existingRetur > 0 ? existingRetur : sisa;
  };

  // Handle Save Barang Masuk
  const handleSaveMasuk = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToSave: TitipJualItem[] = [];

    availableKonsinyasiProducts.forEach((p) => {
      const qty = Number(inputItems[p.code] || 0);
      if (qty > 0) {
        itemsToSave.push({
          code: p.code,
          nama: p.name,
          qtyMasuk: qty,
          qtyRetur: 0,
          hargaJual: p.hargaJual,
          hargaDasar: p.hargaDasar,
        });
      }
    });

    if (!karyawanName || !karyawanName.trim()) {
      toast({
        variant: "destructive",
        title: "Karyawan Penerima Wajib Dipilih",
        description: `Silakan pilih nama karyawan penerima di toko ${branchInfo.name}.`,
      });
      return;
    }

    if (itemsToSave.length === 0) {
      toast({
        variant: "destructive",
        title: "Jumlah Masuk Masih 0",
        description: "Masukkan minimal 1 produk dengan jumlah masuk lebih dari 0.",
      });
      return;
    }

    setSaving(true);
    try {
      const targetBranch = activeBranch === "all" ? "gdm" : activeBranch;
      await addDoc(collection(db, "titip-jual"), {
        tanggal: selectedDate,
        branchId: targetBranch,
        vendor: vendorName || "Penitip Soft Cookies",
        penerima: karyawanName || "Karyawan",
        items: itemsToSave,
        tipe: "masuk",
        status: "aktif",
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Penerimaan Berhasil Dicatat",
        description: `Berhasil mencatat titipan ${itemsToSave.length} varian produk.`,
      });

      setInputItems({});
      setActiveTab("retur");
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error?.message || "Terjadi kesalahan saat menyimpan data.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Save Retur / Pengembalian
  const handleSaveRetur = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToSave: TitipJualItem[] = [];

    availableKonsinyasiProducts.forEach((p) => {
      const masuk = summaryMasukMap[p.code] || 0;
      const terjual = salesMap[p.code] || salesMap[p.name.toLowerCase()] || 0;
      const sisa = Math.max(0, masuk - terjual);
      const returQty = getProductReturQty(p.code, sisa);

      if (masuk > 0 || returQty > 0) {
        itemsToSave.push({
          code: p.code,
          nama: p.name,
          qtyMasuk: 0,
          qtyRetur: returQty,
          hargaJual: p.hargaJual,
          hargaDasar: p.hargaDasar,
        });
      }
    });

    if (!pengembaliName || !pengembaliName.trim()) {
      toast({
        variant: "destructive",
        title: "Karyawan Penyerah Retur Wajib Dipilih",
        description: `Silakan pilih nama karyawan yang menyerahkan retur di toko ${branchInfo.name}.`,
      });
      return;
    }

    if (itemsToSave.length === 0) {
      toast({
        variant: "destructive",
        title: "Belum Ada Data Retur",
        description: "Tidak ada produk titip yang dapat diretur.",
      });
      return;
    }

    setSaving(true);
    try {
      const targetBranch = activeBranch === "all" ? "gdm" : activeBranch;
      await addDoc(collection(db, "titip-jual"), {
        tanggal: selectedDate,
        branchId: targetBranch,
        vendor: vendorName || "Penitip Soft Cookies",
        penerima: karyawanName || "Karyawan",
        pengembali: pengembaliName || karyawanName || "Karyawan",
        items: itemsToSave,
        tipe: "retur",
        status: "selesai",
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Pengembalian / Retur Disimpan",
        description: `Berhasil mencatat retur barang ke ${vendorName}.`,
      });

      setActiveTab("histori");
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Retur",
        description: error?.message || "Terjadi kesalahan sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Quick action: Retur Semua Sisa
  const handleReturSemuaSisa = () => {
    const updated: { [code: string]: number } = {};
    availableKonsinyasiProducts.forEach((p) => {
      const masuk = summaryMasukMap[p.code] || 0;
      const terjual = salesMap[p.code] || salesMap[p.name.toLowerCase()] || 0;
      const sisa = Math.max(0, masuk - terjual);
      updated[p.code] = sisa;
    });
    setReturInputs(updated);
    toast({
      title: "Sisa Terisi Otomatis",
      description: "Jumlah retur telah disesuaikan dengan sisa barang yang belum terjual.",
    });
  };

  // Delete history document
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Hapus catatan titip jual ini?")) return;
    try {
      await deleteDoc(doc(db, "titip-jual", docId));
      toast({ title: "Data Berhasil Dihapus" });
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast({ variant: "destructive", title: "Gagal Menghapus", description: error?.message || "Gagal menghapus data" });
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                Operasional Karyawan
              </span>
              <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-black uppercase border", theme.badgeClass)}>
                {branchInfo.shortName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase italic text-slate-900 leading-tight">
              Barang Titip Jual (Konsinyasi)
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">
              Penerimaan barang masuk, monitoring penjualan closing POS, dan pengembalian sisa barang.
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-2xl self-start sm:self-auto">
          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-transparent text-xs font-black uppercase text-slate-800 outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("masuk")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
            activeTab === "masuk"
              ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          <ArrowDownLeft className="h-4 w-4" />
          1. Catat Barang Masuk
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("retur")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
            activeTab === "retur"
              ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          <ArrowUpRight className="h-4 w-4" />
          2. Pengembalian (Retur)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("histori")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all",
            activeTab === "histori"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          )}
        >
          <History className="h-4 w-4" />
          3. Riwayat & Rekap ({currentBranchDocs.length})
        </button>
      </div>

      {/* 3. TAB 1: CATAT BARANG MASUK */}
      {activeTab === "masuk" && (
        <Card className="p-5 sm:p-6 rounded-[2rem] border-slate-100 shadow-sm bg-white space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">
                Penerimaan Barang Titip (Pagi / Siang)
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Catat jumlah pcs cookies yang dititipkan oleh vendor hari ini.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveMasuk} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Nama Penitip / Vendor
                </Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Contoh: Penitip Soft Cookies / Dapur Bu Ani"
                  className="rounded-xl border-slate-200 h-10 font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-amber-600" />
                    Karyawan Penerima <span className="text-rose-500">*</span>
                  </Label>
                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Wajib Isi ({branchInfo.shortName})
                  </span>
                </div>
                <select
                  value={karyawanName}
                  onChange={(e) => setKaryawanName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 h-10 px-3 font-bold text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  required
                >
                  <option value="">-- Pilih Karyawan Penerima ({branchInfo.shortName}) --</option>
                  {branchKaryawanList.map((k) => {
                    const name = k.nama || k.name || "";
                    return (
                      <option key={k.id} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
                {branchKaryawanList.length === 0 && (
                  <p className="text-[10px] text-amber-600 italic">
                    Belum ada data master karyawan untuk cabang {branchInfo.shortName}.
                  </p>
                )}
              </div>
            </div>

            {/* Product Table List */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-700">
                    <th className="px-3 py-3 w-10 text-center">No</th>
                    <th className="px-3 py-3 w-28">Kode</th>
                    <th className="px-4 py-3">Nama Produk Titip</th>
                    <th className="px-3 py-3 text-right">Harga Jual</th>
                    <th className="px-4 py-3 w-36 text-center bg-amber-100/70 text-amber-950 font-black">
                      Jumlah Masuk (Pcs)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-xs">
                  {availableKonsinyasiProducts.map((p, idx) => (
                    <tr key={p.code} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-3 text-center font-bold text-slate-400 text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-indigo-600 text-[10px]">
                        {p.code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Cookie className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="font-bold text-slate-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-600 tabular-nums">
                        Rp {p.hargaJual.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-2.5 text-center bg-amber-50/40">
                        <Input
                          type="number"
                          min="0"
                          value={inputItems[p.code] ?? 0}
                          onChange={(e) =>
                            setInputItems({
                              ...inputItems,
                              [p.code]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          className="h-9 w-24 text-center font-black text-amber-950 mx-auto rounded-xl border-amber-300 bg-white focus:ring-amber-500 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
              <div className="text-xs font-bold text-slate-500">
                Total Masuk:{" "}
                <span className="text-slate-900 font-black text-sm">
                  {Object.values(inputItems).reduce((sum, val) => sum + (val || 0), 0)} Pcs
                </span>
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto rounded-2xl bg-amber-600 hover:bg-amber-700 px-8 py-6 font-black uppercase tracking-wider text-xs shadow-lg shadow-amber-600/20 text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Menyimpan..." : "Simpan Penerimaan Barang"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 4. TAB 2: PENGEMBALIAN (RETUR) & REKONSILIASI CLOSING */}
      {activeTab === "retur" && (
        <Card className="p-5 sm:p-6 rounded-[2rem] border-slate-100 shadow-sm bg-white space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">
                Pengembalian (Retur) Barang Tidak Habis
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Pencocokan stok masuk vs penjualan Excel closing harian kasir. Sisa barang yang tidak laku dikembalikan ke penitip.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleReturSemuaSisa}
              className="rounded-xl border-amber-200 text-amber-800 hover:bg-amber-50 font-black text-[10px] uppercase tracking-wider h-9"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              Retur Semua Sisa Otomatis
            </Button>
          </div>

          {/* Info Banner */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Penjualan Terintegrasi dengan Excel Closing Toko:</p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Kolom <strong>Terjual</strong> otomatis terisi ketika kasir mengunggah Excel Closing harian di menu Closing Toko. 
                Sisa fisik dihitung otomatis dari selisih barang masuk dikurangi penjualan closing.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveRetur} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Nama Penitip / Pengambil Barang
                </Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Contoh: Penitip Soft Cookies"
                  className="rounded-xl border-slate-200 h-10 font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-rose-600" />
                    Karyawan yang Menyerahkan Retur <span className="text-rose-500">*</span>
                  </Label>
                  <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Wajib Isi ({branchInfo.shortName})
                  </span>
                </div>
                <select
                  value={pengembaliName}
                  onChange={(e) => setPengembaliName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 h-10 px-3 font-bold text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                  required
                >
                  <option value="">-- Pilih Karyawan Penyerah Retur ({branchInfo.shortName}) --</option>
                  {branchKaryawanList.map((k) => {
                    const name = k.nama || k.name || "";
                    return (
                      <option key={k.id} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
                {branchKaryawanList.length === 0 && (
                  <p className="text-[10px] text-amber-600 italic">
                    Belum ada data master karyawan untuk cabang {branchInfo.shortName}.
                  </p>
                )}
              </div>
            </div>

            {/* Reconciliation Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-700">
                    <th className="px-3 py-3 w-10 text-center">No</th>
                    <th className="px-3 py-3 w-28">Kode</th>
                    <th className="px-4 py-3">Nama Produk</th>
                    <th className="px-3 py-3 text-right bg-blue-50 text-blue-900">1. Masuk (Pcs)</th>
                    <th className="px-3 py-3 text-right bg-emerald-50 text-emerald-900">2. Terjual (Excel)</th>
                    <th className="px-3 py-3 text-right bg-amber-50 text-amber-900">3. Sisa Fisik</th>
                    <th className="px-4 py-3 w-36 text-center bg-rose-50 text-rose-950 font-black">
                      4. Jumlah Retur (Pcs)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {availableKonsinyasiProducts.map((p, idx) => {
                    const masuk = summaryMasukMap[p.code] || 0;
                    const terjual = salesMap[p.code] || salesMap[p.name.toLowerCase()] || 0;
                    const sisa = Math.max(0, masuk - terjual);
                    const retur = getProductReturQty(p.code, sisa);

                    return (
                      <tr key={p.code} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-3 text-center font-bold text-slate-400 text-[10px]">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-indigo-600 text-[10px]">
                          {p.code}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {p.name}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-blue-950 bg-blue-50/40 tabular-nums">
                          {masuk} pcs
                        </td>
                        <td className="px-3 py-3 text-right font-black text-emerald-950 bg-emerald-50/40 tabular-nums">
                          {terjual} pcs
                        </td>
                        <td className="px-3 py-3 text-right font-black text-amber-950 bg-amber-50/40 tabular-nums">
                          {sisa} pcs
                        </td>
                        <td className="px-4 py-2.5 text-center bg-rose-50/30">
                          <Input
                            type="number"
                            min="0"
                            value={retur}
                            onChange={(e) =>
                              setReturInputs({
                                ...returInputs,
                                [p.code]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              })
                            }
                            className="h-9 w-24 text-center font-black text-rose-950 mx-auto rounded-xl border-rose-300 bg-white focus:ring-rose-500 text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
              <div className="text-xs font-bold text-slate-500">
                Total Dikembalikan ke Vendor:{" "}
                <span className="text-rose-600 font-black text-sm">
                  {availableKonsinyasiProducts.reduce((sum, p) => {
                    const masuk = summaryMasukMap[p.code] || 0;
                    const terjual = salesMap[p.code] || salesMap[p.name.toLowerCase()] || 0;
                    const sisa = Math.max(0, masuk - terjual);
                    return sum + getProductReturQty(p.code, sisa);
                  }, 0)} Pcs
                </span>
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto rounded-2xl bg-slate-900 hover:bg-slate-800 px-8 py-6 font-black uppercase tracking-wider text-xs shadow-lg shadow-slate-900/20 text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Menyimpan..." : "Simpan Pengembalian (Retur)"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 5. TAB 3: RIWAYAT & REKAP HARIAN */}
      {activeTab === "histori" && (
        <Card className="p-5 sm:p-6 rounded-[2rem] border-slate-100 shadow-sm bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">
                Riwayat Titip Jual ({selectedDate})
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Daftar transaksi penerimaan masuk dan pengembalian retur pada tanggal terpilih.
              </p>
            </div>
          </div>

          {loadingTitip ? (
            <div className="py-16 text-center text-sm text-slate-400 font-bold">
              Memuat data riwayat...
            </div>
          ) : currentBranchDocs.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400 font-bold">
              Belum ada pencatatan titip jual pada tanggal {selectedDate} untuk cabang ini.
            </div>
          ) : (
            <div className="space-y-3">
              {currentBranchDocs.map((docItem) => (
                <div
                  key={docItem.id}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase border",
                          docItem.items?.some((i) => i.qtyMasuk > 0)
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : "bg-rose-100 text-rose-900 border-rose-300"
                        )}
                      >
                        {docItem.items?.some((i) => i.qtyMasuk > 0) ? "Penerimaan Masuk" : "Retur Pengembalian"}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {docItem.vendor}
                      </span>
                      <span className="text-[10px] text-slate-400">• Penerima: {docItem.penerima}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-medium text-slate-600">
                      {docItem.items.map((it, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                          <strong>{it.nama}:</strong>
                          {it.qtyMasuk > 0 && <span className="text-amber-700">+{it.qtyMasuk} Masuk</span>}
                          {it.qtyRetur > 0 && <span className="text-rose-700">-{it.qtyRetur} Retur</span>}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDoc(docItem.id)}
                      className="h-8 px-2 text-rose-600 hover:bg-rose-50 rounded-xl"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
