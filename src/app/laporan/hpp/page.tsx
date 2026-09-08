"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore, useCollection, useMemoFirebase, collection } from "@/firebase";
import { query, where, orderBy } from "firebase/firestore";
import { Calendar, Search, ShoppingBag, TrendingUp, Wallet, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateRecipeIngredientCost } from "@/lib/hpp";

interface ProductItem {
  id: string;
  code?: string;
  kode?: string;
  nama?: string;
  name?: string;
  kategori?: string;
}

interface RecipeCompositionItem {
  bahanBakuId: string;
  jumlah: number | string;
  satuan?: string;
}

interface RecipeItem {
  id: string;
  produkId?: string;
  kodeProduk?: string;
  namaProduk?: string;
  type?: string;
  bahanBakuId?: string;
  namaPelengkap?: string;
  komposisi?: RecipeCompositionItem[];
}

interface MaterialItem {
  id: string;
  nama?: string;
  qtyKecil?: number | string;
  currentPrice?: number | string;
  avgPrice?: number | string;
  hargaBeliSatuanBesar?: number | string;
  hargaSatuanKecil?: number | string;
}

interface ClosingItemDoc {
  code?: string;
  kode?: string;
  name?: string;
  nama?: string;
  produkId?: string;
  id?: string;
  kategori?: string;
  total?: number | string;
  qty?: number | string;
  pendapatan?: number | string;
  totalHarga?: number | string;
  price?: number | string;
}

interface ClosingPenjualanDoc {
  id: string;
  tanggal?: string;
  items?: ClosingItemDoc[];
}

interface ProductSummaryItem {
  code: string;
  name: string;
  kategori: string;
  totalQty: number;
  totalJual: number;
  totalHpp: number;
  labaKotor: number;
}

export default function HppReportPage() {
  const db = useFirestore();

  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [appliedDate, setAppliedDate] = useState(selectedDate);
  const [appliedMonth, setAppliedMonth] = useState(selectedMonth);
  const [appliedType, setAppliedType] = useState(reportType);

  const handleCheck = () => {
    setAppliedDate(selectedDate);
    setAppliedMonth(selectedMonth);
    setAppliedType(reportType);
  };

  const penjualanQuery = useMemoFirebase(() => {
    if (appliedType === "daily") {
      return query(collection(db, "penjualan"), where("tanggal", "==", appliedDate));
    }
    return query(collection(db, "penjualan"), orderBy("tanggal", "asc"));
  }, [db, appliedType, appliedDate]);

  const { data: rawData, loading } = useCollection(penjualanQuery);

  const productsQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const { data: products } = useCollection(productsQuery);

  const recipesQuery = useMemoFirebase(() => collection(db, "resep"), [db]);
  const { data: recipes } = useCollection(recipesQuery);

  const materialsQuery = useMemoFirebase(() => collection(db, "bahan-baku"), [db]);
  const { data: materials } = useCollection(materialsQuery);

  const filteredData = useMemo(() => {
    if (!rawData) return [];
    if (appliedType === "daily") return rawData as unknown as ClosingPenjualanDoc[];
    return (rawData as unknown as ClosingPenjualanDoc[]).filter((doc: ClosingPenjualanDoc) => doc.tanggal?.startsWith(appliedMonth)) || [];
  }, [rawData, appliedType, appliedMonth]);

  const productCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (products as unknown as ProductItem[])?.forEach((product: ProductItem) => {
      if (product.code) map[product.code] = product.id;
    });
    return map;
  }, [products]);

  const recipeMap = useMemo(() => {
    const map: Record<string, RecipeCompositionItem[]> = {};
    (recipes as unknown as RecipeItem[])?.forEach((recipe: RecipeItem) => {
      if (recipe.produkId) map[recipe.produkId] = recipe.komposisi || [];
    });
    return map;
  }, [recipes]);

  const materialMap = useMemo(() => {
    const map: Record<string, MaterialItem> = {};
    (materials as unknown as MaterialItem[])?.forEach((material: MaterialItem) => {
      map[material.id] = material;
    });
    return map;
  }, [materials]);

  const productSummary = useMemo(() => {
    const summary: Record<string, ProductSummaryItem> = {};

    const findProduct = (itemCode?: string, itemName?: string, itemId?: string): ProductItem | null => {
      const productList = products as unknown as ProductItem[] | undefined;
      if (!productList || !productList.length) return null;
      const rawCode = itemCode?.trim().toUpperCase();
      const cleanCode = rawCode?.replace(/[\s-_]/g, '');
      const rawName = itemName?.trim().toLowerCase();

      // 1. Match by product ID
      if (itemId) {
        const byId = productList.find((p: ProductItem) => p.id === itemId);
        if (byId) return byId;
      }
      // 2. Match by exact code or normalized code
      if (rawCode) {
        const byCode = productList.find((p: ProductItem) => {
          const pCode = p.code?.trim().toUpperCase();
          if (!pCode) return false;
          const pClean = pCode.replace(/[\s-_]/g, '');
          return pCode === rawCode || (cleanCode && pClean === cleanCode);
        });
        if (byCode) return byCode;
      }
      // 3. Match by Name
      if (rawName) {
        const byName = productList.find((p: ProductItem) => p.nama?.trim().toLowerCase() === rawName);
        if (byName) return byName;
      }
      return null;
    };

    filteredData.forEach((closing: ClosingPenjualanDoc) => {
      closing.items?.forEach((item: ClosingItemDoc) => {
        const matchedProduct = findProduct(item.code || item.kode, item.name || item.nama, item.produkId || item.id);
        
        const finalCode = matchedProduct?.code || item.code || item.kode || "-";
        const finalName = matchedProduct?.nama || item.name || item.nama || "-";
        const finalCategory = matchedProduct?.kategori || item.kategori || "-";
        const groupKey = finalCode !== "-" ? finalCode.toUpperCase() : finalName.toLowerCase();

        if (!summary[groupKey]) {
          summary[groupKey] = {
            code: finalCode,
            name: finalName,
            kategori: finalCategory,
            totalQty: 0,
            totalJual: 0,
            totalHpp: 0,
            labaKotor: 0,
          };
        }

        const qty = Number(item.total ?? item.qty ?? 0);
        const jual = Number(item.pendapatan ?? item.totalHarga ?? (qty * Number(item.price || 0)));
        const productId = matchedProduct?.id || (item.code ? productCodeMap[item.code] : undefined) || (item.kode ? productCodeMap[item.kode] : undefined);
        
        const recipeObj = (recipes as unknown as RecipeItem[])?.find((r: RecipeItem) => 
          (productId && r.produkId === productId) || 
          (finalCode !== "-" && r.kodeProduk?.trim().toUpperCase() === finalCode.toUpperCase()) ||
          (finalName !== "-" && r.namaProduk?.trim().toLowerCase() === finalName.toLowerCase())
        );

        const composition = recipeObj?.komposisi || (productId ? recipeMap[productId] : []) || [];
        let hpp = 0;

        composition.forEach((ingredient: RecipeCompositionItem) => {
          const material = materialMap[ingredient?.bahanBakuId];
          if (!material) return;

          // Cek jika bahan baku merupakan hasil racikan / pembuatan sendiri
          const pelengkapRecipe = (recipes as unknown as RecipeItem[])?.find(
            (r: RecipeItem) => r.type === "pelengkap" && (r.bahanBakuId === material.id || (!r.bahanBakuId && r.namaPelengkap?.trim().toLowerCase() === material.nama?.trim().toLowerCase()))
          );

          if (pelengkapRecipe && pelengkapRecipe.komposisi?.length) {
            const batchCost = pelengkapRecipe.komposisi.reduce((sum: number, comp: RecipeCompositionItem) => {
              const ingMat = materialMap[comp.bahanBakuId];
              if (!ingMat) return sum;
              const ingConversion = Number(ingMat.qtyKecil) || 1;
              const ingUnitPrice = Number(ingMat.currentPrice ?? ingMat.avgPrice ?? ingMat.hargaBeliSatuanBesar ?? 0);
              const ingExplicit = Number(ingMat.hargaSatuanKecil || 0);
              const ingPriceSmall = ingExplicit > 0 ? ingExplicit : (ingConversion > 0 ? ingUnitPrice / ingConversion : 0);
              return sum + (ingPriceSmall * Number(comp.jumlah || 0));
            }, 0);

            const qtyCups = Number(material.qtyKecil) || 1;
            const pricePerCup = qtyCups > 0 ? batchCost / qtyCups : batchCost;
            hpp += Number(ingredient.jumlah || 0) * qty * pricePerCup;
          } else {
            hpp += calculateRecipeIngredientCost(ingredient, material, qty);
          }
        });

        const roundedHpp = Math.round(hpp);

        summary[groupKey].totalQty += qty;
        summary[groupKey].totalJual += jual;
        summary[groupKey].totalHpp += roundedHpp;
        summary[groupKey].labaKotor += jual - roundedHpp;
      });
    });

    return Object.values(summary).sort((a: ProductSummaryItem, b: ProductSummaryItem) =>
      (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [filteredData, materialMap, productCodeMap, recipeMap, products, recipes]);

  const totals = useMemo(() => {
    return productSummary.reduce(
      (acc, item) => ({
        totalQty: acc.totalQty + (item.totalQty || 0),
        totalJual: acc.totalJual + (item.totalJual || 0),
        totalHpp: acc.totalHpp + (item.totalHpp || 0),
        labaKotor: acc.labaKotor + (item.labaKotor || 0),
      }),
      { totalQty: 0, totalJual: 0, totalHpp: 0, labaKotor: 0 }
    );
  }, [productSummary]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Laporan HPP</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ringkasan produk terjual dan biaya bahan baku per periode</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center sm:justify-end w-full md:w-auto">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setReportType("daily")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-3 sm:px-4 h-9 sm:h-10 text-[9px] font-black uppercase tracking-wider transition-all",
                  reportType === "daily" ? "bg-primary text-white shadow-md" : "text-slate-500"
                )}
              >
                Harian
              </Button>
              <Button
                variant="ghost"
                onClick={() => setReportType("monthly")}
                className={cn(
                  "flex-1 sm:flex-none rounded-xl px-3 sm:px-4 h-9 sm:h-10 text-[9px] font-black uppercase tracking-wider transition-all",
                  reportType === "monthly" ? "bg-primary text-white shadow-md" : "text-slate-500"
                )}
              >
                Bulanan
              </Button>
            </div>

            <div className="bg-white px-3 py-1.5 sm:py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center gap-2 min-h-[38px] sm:min-h-[42px]">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              {reportType === "daily" ? (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                />
              ) : (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-transparent border-none outline-none cursor-pointer w-full text-center sm:text-left"
                />
              )}
            </div>
          </div>

          <Button
            onClick={handleCheck}
            disabled={loading}
            className="rounded-xl sm:rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-5 sm:px-8 h-10 sm:h-12 font-black uppercase tracking-widest text-[9px] sm:text-[10px] gap-2 shadow-md w-full sm:w-auto shrink-0 flex items-center justify-center"
          >
            <Search className="h-4 w-4" />
            <span>Tampilkan Data</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-sm bg-white p-4 md:p-6 hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-emerald-50 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-4 shrink-0">
            <Wallet className="h-5 w-5 md:h-6 md:w-6 text-emerald-600" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-slate-400 mb-1 truncate">Total Penjualan</p>
          <h3 className="text-sm sm:text-xl md:text-2xl font-black text-slate-900 truncate">Rp {totals.totalJual.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-sm bg-white p-4 md:p-6 hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-amber-50 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-4 shrink-0">
            <Package className="h-5 w-5 md:h-6 md:w-6 text-amber-600" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-slate-400 mb-1 truncate">Total HPP Bahan</p>
          <h3 className="text-sm sm:text-xl md:text-2xl font-black text-amber-700 truncate">Rp {totals.totalHpp.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-sm bg-white p-4 md:p-6 hover:shadow-xl transition-all duration-500 border border-slate-50">
          <div className="bg-primary/5 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-4 shrink-0">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-slate-400 mb-1 truncate">Laba Kotor</p>
          <div className="flex flex-wrap items-baseline gap-1">
            <h3 className="text-sm sm:text-xl md:text-2xl font-black text-primary truncate">Rp {totals.labaKotor.toLocaleString("id-ID")}</h3>
            <span className="text-[8px] md:text-[10px] font-black text-slate-400">
              ({totals.totalJual > 0 ? ((totals.labaKotor / totals.totalJual) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}%)
            </span>
          </div>
        </Card>

        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-sm bg-slate-900 p-4 md:p-6 hover:shadow-xl transition-all duration-500 text-white">
          <div className="bg-white/10 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-4 shrink-0">
            <ShoppingBag className="h-5 w-5 md:h-6 md:w-6 text-white" />
          </div>
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-slate-400 mb-1 truncate">Barang Terjual</p>
          <h3 className="text-sm sm:text-xl md:text-2xl font-black truncate">{totals.totalQty} <span className="text-[8px] md:text-[10px] opacity-50 font-bold uppercase tracking-widest">Item</span></h3>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden">
        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Produk</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Kategori</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Total Barang Terjual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Nominal Total Jual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Nominal Total Harga Bahan Baku</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Laba Kotor</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">% Laba Kotor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">Memuat data...</td>
                </tr>
              ) : productSummary.length > 0 ? (
                productSummary.map((item: ProductSummaryItem) => (
                  <tr key={item.code} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="inline-flex px-3 py-1 rounded-lg bg-primary/5 border border-primary/10 text-[10px] font-bold text-primary">
                        {item.code}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900 uppercase italic tracking-tight">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 whitespace-nowrap">
                        {item.kategori}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-slate-600 text-center">{item.totalQty}</td>
                    <td className="px-6 py-4 text-sm font-black text-emerald-600 text-right">Rp {item.totalJual.toLocaleString("id-ID")}</td>
                    <td className="px-6 py-4 text-sm font-black text-amber-700 text-right">Rp {item.totalHpp.toLocaleString("id-ID")}</td>
                    <td className="px-6 py-4 text-sm font-black text-primary text-right">Rp {item.labaKotor.toLocaleString("id-ID")}</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-700 text-right">
                      {item.totalJual > 0 ? ((item.labaKotor / item.totalJual) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">Tidak ada data penjualan untuk periode ini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List Cards View */}
        <div className="md:hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Memuat data...</p>
              </div>
            </div>
          ) : productSummary.length > 0 ? (
            <div className="p-4 space-y-4 bg-slate-50/30">
              {productSummary.map((item: ProductSummaryItem) => (
                <Card key={item.code} className="rounded-[1.5rem] bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow relative">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[8px] font-bold text-primary">
                          {item.code}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                          {item.kategori}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-slate-900 uppercase italic">
                        {item.name}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Terjual</span>
                      <span className="text-sm font-black text-slate-800 tabular-nums">
                        {item.totalQty} <span className="text-[10px] text-slate-400 font-bold uppercase">Pcs</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100/60 text-[10px]">
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                      <span className="text-slate-400 font-bold">Total Jual</span>
                      <span className="font-black text-emerald-600 tabular-nums">Rp {item.totalJual.toLocaleString("id-ID")}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                      <span className="text-slate-400 font-bold">HPP Bahan</span>
                      <span className="font-black text-amber-700 tabular-nums">Rp {item.totalHpp.toLocaleString("id-ID")}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg col-span-2">
                      <span className="text-slate-400 font-bold">Laba Kotor</span>
                      <div className="flex items-center gap-1.5 font-black text-primary tabular-nums">
                        <span>Rp {item.labaKotor.toLocaleString("id-ID")}</span>
                        <span className="text-[9px] text-slate-400">
                          ({item.totalJual > 0 ? ((item.labaKotor / item.totalJual) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : 0}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500">
              <div className="flex flex-col items-center gap-4 opacity-30">
                <ShoppingBag className="h-16 w-16" />
                <p className="text-xs font-black uppercase tracking-[0.3em]">Tidak ada data penjualan</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
