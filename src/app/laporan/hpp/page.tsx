"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import { Calendar, Search, ShoppingBag, TrendingUp, Wallet, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateRecipeIngredientCost } from "@/lib/hpp";

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
    if (appliedType === "daily") return rawData;
    return rawData.filter((doc: any) => doc.tanggal?.startsWith(appliedMonth)) || [];
  }, [rawData, appliedType, appliedMonth]);

  const productCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    products?.forEach((product: any) => {
      if (product.code) map[product.code] = product.id;
    });
    return map;
  }, [products]);

  const recipeMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    recipes?.forEach((recipe: any) => {
      if (recipe.produkId) map[recipe.produkId] = recipe.komposisi || [];
    });
    return map;
  }, [recipes]);

  const materialMap = useMemo(() => {
    const map: Record<string, any> = {};
    materials?.forEach((material: any) => {
      map[material.id] = material;
    });
    return map;
  }, [materials]);

  const productSummary = useMemo(() => {
    const summary: Record<string, any> = {};

    filteredData.forEach((closing: any) => {
      closing.items?.forEach((item: any) => {
        const key = item.code || item.name || "-";
        if (!summary[key]) {
          summary[key] = {
            code: item.code || "-",
            name: item.name || "-",
            totalQty: 0,
            totalJual: 0,
            totalHpp: 0,
            labaKotor: 0,
          };
        }

        const qty = Number(item.total || 0);
        const jual = Number(item.pendapatan || 0);
        const productId = productCodeMap[item.code];
        const recipe = Array.isArray(productId ? recipeMap[productId] : []) ? (productId ? recipeMap[productId] : []) : [];
        let hpp = 0;

        recipe.forEach((ingredient: any) => {
          const material = materialMap[ingredient?.bahanBakuId];
          hpp += calculateRecipeIngredientCost(ingredient, material, qty);
        });

        summary[key].totalQty += qty;
        summary[key].totalJual += jual;
        summary[key].totalHpp += hpp;
        summary[key].labaKotor += jual - hpp;
      });
    });

    return Object.values(summary).sort((a: any, b: any) =>
      (a.code || "").localeCompare(b.code || "", undefined, { numeric: true })
    );
  }, [filteredData, materialMap, productCodeMap, recipeMap]);

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

        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex items-center">
            <Button
              variant="ghost"
              onClick={() => setReportType("daily")}
              className={cn(
                "rounded-xl px-4 h-10 text-[9px] font-black uppercase tracking-widest transition-all",
                reportType === "daily" ? "bg-primary text-white shadow-lg" : "text-slate-500"
              )}
            >
              Harian
            </Button>
            <Button
              variant="ghost"
              onClick={() => setReportType("monthly")}
              className={cn(
                "rounded-xl px-4 h-10 text-[9px] font-black uppercase tracking-widest transition-all",
                reportType === "monthly" ? "bg-primary text-white shadow-lg" : "text-slate-500"
              )}
            >
              Bulanan
            </Button>
          </div>

          <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <Calendar className="h-4 w-4 text-primary" />
            {reportType === "daily" ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              />
            ) : (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-[10px] font-black uppercase tracking-widest text-slate-700 bg-transparent border-none outline-none cursor-pointer"
              />
            )}
          </div>

          <Button
            onClick={handleCheck}
            disabled={loading}
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg"
          >
            <Search className="h-4 w-4" />
            Tampilkan Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-emerald-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <Wallet className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Penjualan</p>
          <h3 className="text-2xl font-black text-slate-900">Rp {totals.totalJual.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-amber-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <Package className="h-6 w-6 text-amber-600" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total HPP Bahan</p>
          <h3 className="text-2xl font-black text-amber-700">Rp {totals.totalHpp.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-white p-6">
          <div className="bg-primary/5 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Laba Kotor</p>
          <h3 className="text-2xl font-black text-primary">Rp {totals.labaKotor.toLocaleString("id-ID")}</h3>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-sm bg-slate-900 p-6 text-white">
          <div className="bg-white/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <ShoppingBag className="h-6 w-6 text-white" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Barang Terjual</p>
          <h3 className="text-2xl font-black">{totals.totalQty}</h3>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Total Barang Terjual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Nominal Total Jual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Nominal Total Harga Bahan Baku</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Laba Kotor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">Memuat data...</td>
                </tr>
              ) : productSummary.length > 0 ? (
                productSummary.map((item: any) => (
                  <tr key={item.code} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-black text-slate-800">{item.code}</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-800">{item.name}</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-600 text-center">{item.totalQty}</td>
                    <td className="px-6 py-4 text-sm font-black text-emerald-600 text-right">Rp {item.totalJual.toLocaleString("id-ID")}</td>
                    <td className="px-6 py-4 text-sm font-black text-amber-700 text-right">Rp {item.totalHpp.toLocaleString("id-ID")}</td>
                    <td className="px-6 py-4 text-sm font-black text-primary text-right">Rp {item.labaKotor.toLocaleString("id-ID")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">Tidak ada data penjualan untuk periode ini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
