"use client";

import { getStoreConfigDocId, useActiveBranch, getBranchScopedCollectionName, BranchId, setActiveBranch, BRANCH_LIST } from "@/lib/branch-helper";

import React, { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useDoc, useMemoFirebase, collection, doc } from "@/firebase";
import { query, where, getDocs } from "firebase/firestore";
import {
  Loader2,
  CalendarDays,
  BarChart2,
  FileDown,
  FileSpreadsheet,
  ChevronDown,
  Search,
  X,
  Filter,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

/* ─────────────────── helpers ─────────────────── */
function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function cleanCode(code: string | undefined | null): string {
  if (!code) return "";
  return String(code).trim().replace(/^0+/, "");
}

function cleanName(name: string | undefined | null): string {
  if (!name) return "";
  return String(name).trim().toLowerCase();
}

function compareMaterialCode(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/* ─────────────────── types ─────────────────── */
interface BahanRow {
  code: string;
  nama: string;
  qty: number;
  satuanKecil: string;
  hargaSatuanKecil: number;
  totalHarga: number;
}

export default function LaporanPemakaianBahanBakuPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();

  // Date pickers
  const today = new Date().toISOString().split("T")[0];
  const [hariDate, setHariDate] = useState(today);
  const [bulanYM, setBulanYM] = useState(today.slice(0, 7)); // "YYYY-MM"

  // Loading state
  const [loadingReport, setLoadingReport] = useState(false);

  // Report data
  const [hariRows, setHariRows] = useState<BahanRow[] | null>(null);
  const [bulanRows, setBulanRows] = useState<BahanRow[] | null>(null);

  // Filter Nama Bahan Baku
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>("all");
  const [searchMaterial, setSearchMaterial] = useState<string>("");

  const availableMaterialsHari = useMemo(() => {
    if (!hariRows) return [];
    const set = new Set<string>();
    hariRows.forEach((r) => {
      if (r.nama && r.nama !== "-") set.add(r.nama);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [hariRows]);

  const availableMaterialsBulan = useMemo(() => {
    if (!bulanRows) return [];
    const set = new Set<string>();
    bulanRows.forEach((r) => {
      if (r.nama && r.nama !== "-") set.add(r.nama);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bulanRows]);

  const filteredHariRows = useMemo(() => {
    if (!hariRows) return null;
    return hariRows.filter((r) => {
      const matchSelected = selectedMaterialName === "all" || r.nama.toLowerCase() === selectedMaterialName.toLowerCase();
      const matchSearch = !searchMaterial.trim() || 
        r.nama.toLowerCase().includes(searchMaterial.toLowerCase()) || 
        r.code.toLowerCase().includes(searchMaterial.toLowerCase());
      return matchSelected && matchSearch;
    });
  }, [hariRows, selectedMaterialName, searchMaterial]);

  const filteredBulanRows = useMemo(() => {
    if (!bulanRows) return null;
    return bulanRows.filter((r) => {
      const matchSelected = selectedMaterialName === "all" || r.nama.toLowerCase() === selectedMaterialName.toLowerCase();
      const matchSearch = !searchMaterial.trim() || 
        r.nama.toLowerCase().includes(searchMaterial.toLowerCase()) || 
        r.code.toLowerCase().includes(searchMaterial.toLowerCase());
      return matchSelected && matchSearch;
    });
  }, [bulanRows, selectedMaterialName, searchMaterial]);

  // Reset data when activeBranch changes
  useEffect(() => {
    setHariRows(null);
    setBulanRows(null);
    setSelectedMaterialName("all");
    setSearchMaterial("");
  }, [activeBranch]);

  // Settings (for PDF header)
  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);

  /* ── Fetch & compute ── */
  async function fetchReport(mode: "harian" | "bulanan") {
    setLoadingReport(true);
    try {
      const branchesToQuery: BranchId[] = activeBranch === 'all'
        ? ['gdm', 'kedungreja', 'tehwarga', 'gembong']
        : [activeBranch];

      // Combined maps across queried branches
      const bahanMap: { [id: string]: { code: string; nama: string; satuanKecil: string; hargaSatuanKecil: number } } = {};
      const agg: { [bahanId: string]: number } = {};

      for (const b of branchesToQuery) {
        // 1. Load bahan baku for branch
        const bahanColl = getBranchScopedCollectionName("bahan-baku", b);
        const bahanSnap = await getDocs(collection(db, bahanColl));
        bahanSnap.forEach((d) => {
          const data = d.data();
          const conversionRate = Number(data.qtyKecil || 1);
          const priceBesar = Number(data.currentPrice ?? data.avgPrice ?? data.hargaBeliSatuanBesar ?? 0);
          const unitPriceKecil = Number(data.hargaSatuanKecil ?? (conversionRate > 0 ? priceBesar / conversionRate : 0));

          bahanMap[d.id] = {
            code: data.code ?? "-",
            nama: data.nama ?? "-",
            satuanKecil: data.satuanKecil ?? "",
            hargaSatuanKecil: unitPriceKecil,
          };
        });

        // 2. Load products for branch
        const produkColl = getBranchScopedCollectionName("produk", b);
        const produkSnap = await getDocs(collection(db, produkColl));
        const productList: Array<{
          id: string;
          code: string;
          cleanCode: string;
          nama: string;
          cleanName: string;
        }> = [];

        produkSnap.forEach((d) => {
          const data = d.data();
          const rawCode = String(data.code || "").trim();
          const rawNama = String(data.nama || "").trim();
          productList.push({
            id: d.id,
            code: rawCode,
            cleanCode: cleanCode(rawCode),
            nama: rawNama,
            cleanName: cleanName(rawNama),
          });
        });

        const findProduct = (item: any) => {
          const itemCode = String(item.code || "").trim();
          const itemName = String(item.name || "").trim();
          const itemCleanCode = cleanCode(itemCode);
          const itemCleanName = cleanName(itemName);

          // 1. Direct match by ID if item has productId
          if (item.productId) {
            const found = productList.find((p) => p.id === item.productId);
            if (found) return found;
          }
          // 2. Exact code match
          if (itemCode) {
            const found = productList.find((p) => p.code === itemCode);
            if (found) return found;
          }
          // 3. Cleaned code match (stripping leading zeros, e.g. "0000000000001" vs "00001" -> "1")
          if (itemCleanCode) {
            const found = productList.find((p) => p.cleanCode === itemCleanCode);
            if (found) return found;
          }
          // 4. Exact cleaned name match
          if (itemCleanName) {
            const found = productList.find((p) => p.cleanName === itemCleanName);
            if (found) return found;
          }
          // 5. Fallback substring name match
          if (itemCleanName && itemCleanName.length > 2) {
            const found = productList.find(
              (p) => p.cleanName.includes(itemCleanName) || itemCleanName.includes(p.cleanName)
            );
            if (found) return found;
          }
          return null;
        };

        // 3. Load recipes for branch
        const resepColl = getBranchScopedCollectionName("resep", b);
        const resepSnap = await getDocs(collection(db, resepColl));
        const recipeMap: { [produkId: string]: { bahanBakuId: string; jumlah: number }[] } = {};
        const recipeByCode: { [code: string]: { bahanBakuId: string; jumlah: number }[] } = {};
        const recipeByName: { [name: string]: { bahanBakuId: string; jumlah: number }[] } = {};

        resepSnap.forEach((d) => {
          const data = d.data();
          const komposisi = data.komposisi ?? [];
          if (data.produkId) {
            recipeMap[data.produkId] = komposisi;
          }
          if (data.kodeProduk) {
            recipeByCode[data.kodeProduk] = komposisi;
            recipeByCode[cleanCode(data.kodeProduk)] = komposisi;
          }
          if (data.namaProduk) {
            recipeByName[cleanName(data.namaProduk)] = komposisi;
          }
        });

        // 4. Load penjualan filtered by date for branch
        const penjualanColl = getBranchScopedCollectionName("penjualan", b);
        let penjualanQuery;
        if (mode === "harian") {
          penjualanQuery = query(
            collection(db, penjualanColl),
            where("tanggal", "==", hariDate)
          );
        } else {
          const [year, month] = bulanYM.split("-");
          const start = `${year}-${month}-01`;
          const lastDay = new Date(Number(year), Number(month), 0).getDate();
          const end = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
          penjualanQuery = query(
            collection(db, penjualanColl),
            where("tanggal", ">=", start),
            where("tanggal", "<=", end)
          );
        }

        const penjualanSnap = await getDocs(penjualanQuery);

        // 5. Aggregate: for each sales doc -> each item -> each composition ingredient
        penjualanSnap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const items = data.items ?? [];
          items.forEach((item: any) => {
            // Quantity can be item.total, item.qty, or item.jumlah
            const qty = Number(item.total ?? item.qty ?? item.jumlah ?? 0);
            if (qty <= 0) return;

            const matchedProduct = findProduct(item);

            let recipe = matchedProduct ? recipeMap[matchedProduct.id] : undefined;
            if (!recipe && matchedProduct) {
              recipe =
                recipeByCode[matchedProduct.code] ||
                recipeByCode[matchedProduct.cleanCode] ||
                recipeByName[matchedProduct.cleanName];
            }
            if (!recipe) {
              const itemCode = String(item.code || "").trim();
              const itemName = String(item.name || "").trim();
              recipe =
                recipeByCode[itemCode] ||
                recipeByCode[cleanCode(itemCode)] ||
                recipeByName[cleanName(itemName)];
            }

            if (!recipe || !Array.isArray(recipe)) return;

            recipe.forEach((ing) => {
              const jumlahPerPorsi = Number(ing.jumlah || 0);
              if (jumlahPerPorsi <= 0 || !ing.bahanBakuId) return;
              const used = jumlahPerPorsi * qty;
              agg[ing.bahanBakuId] = (agg[ing.bahanBakuId] || 0) + used;
            });
          });
        });
      }

      // 6. Build rows with Total Harga Bahan Baku calculation
      const rows: BahanRow[] = Object.entries(agg)
        .map(([bahanId, qty]) => {
          const bahan = bahanMap[bahanId];
          if (!bahan) return null;
          const hargaSatuanKecil = bahan.hargaSatuanKecil || 0;
          const totalHarga = Math.round(qty * hargaSatuanKecil);
          return { 
            code: bahan.code, 
            nama: bahan.nama, 
            qty, 
            satuanKecil: bahan.satuanKecil,
            hargaSatuanKecil,
            totalHarga
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => compareMaterialCode(a.code, b.code)) as BahanRow[];

      if (mode === "harian") setHariRows(rows);
      else setBulanRows(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReport(false);
    }
  }

  /* ── Export Excel ── */
  function exportExcel(rows: BahanRow[], label: string) {
    const wsData = rows.map((r) => ({
      Code: r.code,
      "Nama Bahan": r.nama,
      Qty: r.qty,
      "Satuan Kecil": r.satuanKecil,
      "Harga Satuan Kecil": r.hargaSatuanKecil,
      "Total Harga Bahan Baku": r.totalHarga,
    }));

    const totalBiaya = rows.reduce((sum, r) => sum + r.totalHarga, 0);
    wsData.push({
      Code: "TOTAL",
      "Nama Bahan": "Total Keseluruhan Pemakaian",
      Qty: 0,
      "Satuan Kecil": "",
      "Harga Satuan Kecil": 0,
      "Total Harga Bahan Baku": totalBiaya,
    });

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pemakaian");
    XLSX.writeFile(wb, `Laporan_Pemakaian_${label}.xlsx`);
  }

  /* ── Export PDF ── */
  async function exportPDF(rows: BahanRow[], label: string) {
    const docPDF = new jsPDF();

    if (settings?.logoHeader) {
      try {
        const response = await fetch(settings.logoHeader);
        const blob = await response.blob();
        const logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        docPDF.addImage(logoBase64, "PNG", 15, 10, 35, 12);
      } catch { }
    }

    docPDF.setFontSize(18);
    docPDF.setTextColor(139, 26, 26);
    docPDF.text(settings?.name?.toUpperCase() ?? "ZONA WAKTU", 105, 15, { align: "center" });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline ?? "Coffee & Teh Bakar Autentik", 105, 21, { align: "center" });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 195, 28);

    docPDF.setFontSize(13);
    docPDF.setTextColor(0);
    docPDF.text(`LAPORAN PEMAKAIAN BAHAN BAKU`, 105, 38, { align: "center" });
    docPDF.setFontSize(9);
    docPDF.setTextColor(80);
    docPDF.text(label, 105, 45, { align: "center" });

    const totalBiaya = rows.reduce((sum, r) => sum + r.totalHarga, 0);

    const bodyData: any[] = rows.map((r) => [
      r.code, 
      r.nama, 
      r.qty.toLocaleString("id-ID"), 
      r.satuanKecil,
      `Rp ${r.totalHarga.toLocaleString("id-ID")}`
    ]);

    bodyData.push([
      "TOTAL",
      "TOTAL KESELURUHAN",
      "",
      "",
      `Rp ${totalBiaya.toLocaleString("id-ID")}`
    ]);

    autoTable(docPDF, {
      head: [["CODE", "NAMA BAHAN", "QTY", "SATUAN KECIL", "TOTAL HARGA BAHAN BAKU"]],
      body: bodyData,
      startY: 52,
      theme: "grid",
      headStyles: { fillColor: [139, 26, 26] },
      styles: { fontSize: 8 },
    });

    docPDF.save(`Laporan_Pemakaian_${label}.pdf`);
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Laporan Pemakaian
          </h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">
            Pemakaian Bahan Baku — Harian &amp; Bulanan • {BRANCH_LIST[activeBranch]?.name || "Zona Waktu"}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-2xl px-5 py-3">
          <BarChart2 className="h-4 w-4 text-primary" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              Cabang: <strong className="text-primary">{BRANCH_LIST[activeBranch]?.shortName || "Zona Waktu"}</strong>
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
              Rekap Otomatis dari Penjualan &amp; Resep
            </span>
          </div>
        </div>
      </header>

      {/* Branch Selector Switcher */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-200/60 shadow-2xs">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-2 mr-1">
          Pilih Toko:
        </span>
        {[
          { id: 'gdm' as BranchId, label: 'Zona Waktu GDM', color: 'bg-emerald-500' },
          { id: 'kedungreja' as BranchId, label: 'Zona Kedungreja', color: 'bg-cyan-500' },
          { id: 'tehwarga' as BranchId, label: 'Teh Warga GDM', color: 'bg-amber-500' },
          { id: 'gembong' as BranchId, label: 'Zona Gembong', color: 'bg-indigo-500' },
          { id: 'all' as BranchId, label: 'Semua Toko', color: 'bg-slate-700' },
        ].map((b) => {
          const isActive = activeBranch === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBranch(b.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-2xs cursor-pointer",
                isActive
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-900/10 font-bold"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", b.color, isActive && "ring-2 ring-white/50")} />
              {b.label}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="harian" className="w-full">
        <TabsList className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 h-14 w-full max-w-xs grid grid-cols-2 gap-2 mb-6">
          <TabsTrigger
            value="harian"
            className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
          >
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
            Harian
          </TabsTrigger>
          <TabsTrigger
            value="bulanan"
            className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
          >
            <BarChart2 className="h-3.5 w-3.5 mr-1.5" />
            Bulanan
          </TabsTrigger>
        </TabsList>

        {/* ── HARIAN ── */}
        <TabsContent value="harian">
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
            {/* Controls */}
            <div className="p-4 sm:p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
              <div className="grid grid-cols-2 gap-2 items-end w-full md:w-auto md:flex md:items-end md:gap-4">
                <div className="flex flex-col gap-1 w-full md:w-auto">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={hariDate}
                    onChange={(e) => {
                      setHariDate(e.target.value);
                      setHariRows(null);
                    }}
                    className="h-11 md:h-12 px-3 sm:px-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 w-full"
                  />
                </div>
                <Button
                  onClick={() => fetchReport("harian")}
                  disabled={loadingReport}
                  className="h-11 md:h-12 px-3 sm:px-8 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[9.5px] sm:text-[10px] shadow-lg shadow-primary/20 gap-1.5 sm:gap-2 w-full md:w-auto flex items-center justify-center"
                >
                  {loadingReport ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Tampilkan
                </Button>
              </div>

              {hariRows && hariRows.length > 0 && (
                <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:items-center">
                  <Button
                    variant="outline"
                    onClick={() => exportExcel(filteredHariRows || hariRows, hariDate)}
                    className="h-11 md:h-12 px-3 sm:px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-1.5 sm:gap-2 bg-white flex items-center justify-center"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportPDF(filteredHariRows || hariRows, hariDate)}
                    className="h-11 md:h-12 px-3 sm:px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-1.5 sm:gap-2 bg-white flex items-center justify-center"
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                    PDF
                  </Button>
                </div>
              )}
            </div>

            {/* Filter Nama Bahan Toolbar */}
            {hariRows && hariRows.length > 0 && (
              <div className="px-4 sm:px-6 md:px-8 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
                    <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Nama Bahan:</span>
                    <select
                      value={selectedMaterialName}
                      onChange={(e) => setSelectedMaterialName(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer max-w-[200px] truncate"
                    >
                      <option value="all">Semua Bahan Baku ({availableMaterialsHari.length})</option>
                      {availableMaterialsHari.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      value={searchMaterial}
                      onChange={(e) => setSearchMaterial(e.target.value)}
                      placeholder="Ketik cari nama atau kode bahan..."
                      className="pl-8 pr-7 h-9 rounded-xl bg-white border-slate-200 text-xs font-bold"
                    />
                    {searchMaterial && (
                      <button
                        type="button"
                        onClick={() => setSearchMaterial("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {(selectedMaterialName !== "all" || searchMaterial.trim()) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedMaterialName("all");
                        setSearchMaterial("");
                      }}
                      className="h-8 px-2.5 rounded-xl text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 gap-1"
                    >
                      <X className="h-3.5 w-3.5" /> Reset Filter
                    </Button>
                  )}
                </div>

                <div className="text-[10px] font-bold text-slate-500 shrink-0">
                  Menampilkan <span className="font-black text-slate-900">{filteredHariRows?.length ?? 0}</span> dari {hariRows.length} bahan
                </div>
              </div>
            )}

            {/* Summary badges */}
            {hariRows && hariRows.length > 0 && (
              <div className="px-6 md:px-8 pt-6 grid grid-cols-2 md:flex md:flex-wrap items-center gap-3 w-full">
                <div className="bg-primary/5 text-primary border border-primary/10 rounded-2xl p-4 md:px-4 md:py-2 text-center md:text-left flex flex-col md:block">
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider block md:hidden">Jenis Bahan</span>
                  <span className="text-xs md:text-[10px] font-black uppercase tracking-widest">
                    {filteredHariRows?.length ?? 0} Jenis {(filteredHariRows?.length ?? 0) !== hariRows.length ? `(dari ${hariRows.length})` : ""}
                  </span>
                </div>
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-2xl p-4 md:px-4 md:py-2 text-center md:text-left flex flex-col md:block">
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider block md:hidden">Total Biaya</span>
                  <span className="text-xs md:text-[10px] font-black uppercase tracking-widest">
                    Rp {(filteredHariRows || hariRows).reduce((sum, r) => sum + r.totalHarga, 0).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="col-span-2 text-center md:text-left text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-0">
                  Periode: {new Date(hariDate + "T00:00:00").toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}

            <ReportTable rows={filteredHariRows} loading={loadingReport} />
          </Card>
        </TabsContent>

        {/* ── BULANAN ── */}
        <TabsContent value="bulanan">
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
            {/* Controls */}
            <div className="p-4 sm:p-6 md:p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
              <div className="grid grid-cols-2 gap-2 items-end w-full md:w-auto md:flex md:items-end md:gap-4">
                <div className="flex flex-col gap-1 w-full md:w-auto">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
                    Bulan
                  </label>
                  <input
                    type="month"
                    value={bulanYM}
                    onChange={(e) => {
                      setBulanYM(e.target.value);
                      setBulanRows(null);
                    }}
                    className="h-11 md:h-12 px-3 sm:px-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 w-full"
                  />
                </div>
                <Button
                  onClick={() => fetchReport("bulanan")}
                  disabled={loadingReport}
                  className="h-11 md:h-12 px-3 sm:px-8 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[9.5px] sm:text-[10px] shadow-lg shadow-primary/20 gap-1.5 sm:gap-2 w-full md:w-auto flex items-center justify-center"
                >
                  {loadingReport ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Tampilkan
                </Button>
              </div>

              {bulanRows && bulanRows.length > 0 && (
                <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:items-center">
                  <Button
                    variant="outline"
                    onClick={() => exportExcel(filteredBulanRows || bulanRows, monthLabel(bulanYM))}
                    className="h-11 md:h-12 px-3 sm:px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-1.5 sm:gap-2 bg-white flex items-center justify-center"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportPDF(filteredBulanRows || bulanRows, monthLabel(bulanYM))}
                    className="h-11 md:h-12 px-3 sm:px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-1.5 sm:gap-2 bg-white flex items-center justify-center"
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                    PDF
                  </Button>
                </div>
              )}
            </div>

            {/* Filter Nama Bahan Toolbar */}
            {bulanRows && bulanRows.length > 0 && (
              <div className="px-4 sm:px-6 md:px-8 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
                    <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Nama Bahan:</span>
                    <select
                      value={selectedMaterialName}
                      onChange={(e) => setSelectedMaterialName(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer max-w-[200px] truncate"
                    >
                      <option value="all">Semua Bahan Baku ({availableMaterialsBulan.length})</option>
                      {availableMaterialsBulan.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      value={searchMaterial}
                      onChange={(e) => setSearchMaterial(e.target.value)}
                      placeholder="Ketik cari nama atau kode bahan..."
                      className="pl-8 pr-7 h-9 rounded-xl bg-white border-slate-200 text-xs font-bold"
                    />
                    {searchMaterial && (
                      <button
                        type="button"
                        onClick={() => setSearchMaterial("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {(selectedMaterialName !== "all" || searchMaterial.trim()) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedMaterialName("all");
                        setSearchMaterial("");
                      }}
                      className="h-8 px-2.5 rounded-xl text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 gap-1"
                    >
                      <X className="h-3.5 w-3.5" /> Reset Filter
                    </Button>
                  )}
                </div>

                <div className="text-[10px] font-bold text-slate-500 shrink-0">
                  Menampilkan <span className="font-black text-slate-900">{filteredBulanRows?.length ?? 0}</span> dari {bulanRows.length} bahan
                </div>
              </div>
            )}

            {/* Summary badges */}
            {bulanRows && bulanRows.length > 0 && (
              <div className="px-6 md:px-8 pt-6 grid grid-cols-2 md:flex md:flex-wrap items-center gap-3 w-full">
                <div className="bg-primary/5 text-primary border border-primary/10 rounded-2xl p-4 md:px-4 md:py-2 text-center md:text-left flex flex-col md:block">
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider block md:hidden">Jenis Bahan</span>
                  <span className="text-xs md:text-[10px] font-black uppercase tracking-widest">
                    {filteredBulanRows?.length ?? 0} Jenis {(filteredBulanRows?.length ?? 0) !== bulanRows.length ? `(dari ${bulanRows.length})` : ""}
                  </span>
                </div>
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-2xl p-4 md:px-4 md:py-2 text-center md:text-left flex flex-col md:block">
                  <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider block md:hidden">Total Biaya</span>
                  <span className="text-xs md:text-[10px] font-black uppercase tracking-widest">
                    Rp {(filteredBulanRows || bulanRows).reduce((sum, r) => sum + r.totalHarga, 0).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="col-span-2 text-center md:text-left text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-0">
                  Periode: {monthLabel(bulanYM)}
                </div>
              </div>
            )}

            <ReportTable rows={filteredBulanRows} loading={loadingReport} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Table component ── */
function ReportTable({ rows, loading }: { rows: BahanRow[] | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
        Klik tombol <span className="text-primary">Tampilkan</span> untuk memuat laporan.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
        Tidak ada data pemakaian pada periode ini.
      </div>
    );
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.totalHarga, 0);

  return (
    <>
      {/* Desktop Table View */}
      <div className="overflow-x-auto custom-scrollbar hidden md:block">
        <table className="w-full text-left min-w-[600px]">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="px-6 md:px-8 py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest">
                Code
              </th>
              <th className="px-4 md:px-6 py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest">
                Nama Bahan
              </th>
              <th className="px-4 md:px-6 py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">
                Qty Pemakaian
              </th>
              <th className="px-6 md:px-8 py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">
                Satuan Kecil
              </th>
              <th className="px-6 md:px-8 py-4 text-[9px] md:text-[10px] font-black uppercase text-emerald-800 tracking-widest text-right">
                Total Harga Bahan Baku
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, i) => (
              <tr
                key={row.code + i}
                className="hover:bg-slate-50/60 transition-colors duration-150"
              >
                <td className="px-6 md:px-8 py-4 text-[10px] font-black text-slate-500 tracking-wider">
                  {row.code}
                </td>
                <td className="px-4 md:px-6 py-4 text-sm font-black text-slate-900 uppercase italic">
                  {row.nama}
                </td>
                <td className="px-4 md:px-6 py-4 text-right font-black text-primary tabular-nums italic text-lg md:text-xl">
                  {row.qty % 1 === 0
                    ? row.qty.toLocaleString("id-ID")
                    : row.qty.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 md:px-8 py-4 text-center text-[9px] md:text-[10px] font-black uppercase text-primary tracking-widest">
                  {row.satuanKecil}
                </td>
                <td className="px-6 md:px-8 py-4 text-right font-black text-emerald-700 tabular-nums italic text-base md:text-lg">
                  Rp {row.totalHarga.toLocaleString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100/80 font-black">
              <td colSpan={4} className="px-6 md:px-8 py-4 text-right text-xs uppercase tracking-widest text-slate-700">
                Total Keseluruhan Harga Bahan Baku:
              </td>
              <td className="px-6 md:px-8 py-4 text-right text-lg md:text-xl text-emerald-800 tabular-nums italic">
                Rp {grandTotal.toLocaleString("id-ID")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile List Cards View */}
      <div className="md:hidden p-4 space-y-4 bg-slate-50/30">
        {rows.map((row, i) => (
          <Card key={row.code + i} className="rounded-[1.5rem] bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start gap-2 mb-3">
              <div className="space-y-1">
                <span className="inline-flex px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[8px] font-bold text-primary">
                  {row.code}
                </span>
                <h4 className="text-xs font-black text-slate-900 uppercase italic">
                  {row.nama}
                </h4>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Pemakaian</span>
                <span className="text-sm font-black text-slate-800 tabular-nums">
                  {row.qty % 1 === 0
                    ? row.qty.toLocaleString("id-ID")
                    : row.qty.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                  <span className="text-[10px] text-slate-400 font-bold uppercase ml-1">{row.satuanKecil || "Unit"}</span>
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100/60 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold">Total Harga</span>
              <span className="font-black text-emerald-700 tabular-nums text-sm">
                Rp {row.totalHarga.toLocaleString("id-ID")}
              </span>
            </div>
          </Card>
        ))}

        {/* Grand Total Footer for Mobile */}
        <div className="bg-slate-900 text-white rounded-[1.5rem] p-4 flex justify-between items-center shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Total Harga Pemakaian:</span>
          <span className="text-lg font-black text-emerald-400 tabular-nums">
            Rp {grandTotal.toLocaleString("id-ID")}
          </span>
        </div>
      </div>
    </>
  );
}
