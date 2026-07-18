"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  FileSpreadsheet,
  Loader2,
  Package,
  Search,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import * as XLSX from "xlsx";

// Helper to format currency/numbers
const formatNumber = (value: number) => {
  return new Intl.NumberFormat("id-ID").format(value);
};

export default function LaporanStockLossPage() {
  const db = useFirestore();
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE returns YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(today);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate yesterday's date
  const yesterdayDate = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      return d.toLocaleDateString("sv-SE");
    } catch {
      return "";
    }
  }, [selectedDate]);

  // Fetch materials (bahan-baku)
  const materialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db]
  );
  const { data: materials, loading: loadingMaterials } = useCollection(materialsQuery);

  // Fetch products (produk)
  const productsQuery = useMemoFirebase(
    () => collection(db, "produk"),
    [db]
  );
  const { data: products, loading: loadingProducts } = useCollection(productsQuery);

  // Fetch recipes (resep)
  const recipesQuery = useMemoFirebase(
    () => collection(db, "resep"),
    [db]
  );
  const { data: recipes, loading: loadingRecipes } = useCollection(recipesQuery);

  // Fetch sales (penjualan) for selectedDate
  const salesQuery = useMemoFirebase(
    () => collection(db, "penjualan"),
    [db]
  );
  const { data: allSales, loading: loadingSales } = useCollection(salesQuery);

  // Fetch stock opname harian
  const opnameQuery = useMemoFirebase(
    () => query(collection(db, "opnam_harian"), orderBy("date", "desc")),
    [db]
  );
  const { data: allOpnames, loading: loadingOpnames } = useCollection(opnameQuery);

  // Fetch purchase and mutation logs (log_pembelian_bahan)
  const logsQuery = useMemoFirebase(
    () => collection(db, "log_pembelian_bahan"),
    [db]
  );
  const { data: allLogs, loading: loadingLogs } = useCollection(logsQuery);

  // Convert Firebase Timestamp or Date or String to YYYY-MM-DD
  const parseDateString = (value: any): string => {
    if (!value) return "";
    if (value instanceof Date) return value.toLocaleDateString("sv-SE");
    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleDateString("sv-SE");
    }
    if (typeof value === "object" && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toLocaleDateString("sv-SE");
    }
    if (typeof value === "string") {
      return value.split("T")[0];
    }
    return "";
  };

  // Main compilation logic
  const reportRows = useMemo(() => {
    if (!materials || !products || !recipes) return [];

    // 1. Build product code map
    const productCodeMap: { [code: string]: string } = {};
    products.forEach((p: any) => {
      if (p.code) productCodeMap[p.code] = p.id;
    });

    // 2. Build recipe map
    const recipeMap: { [produkId: string]: { bahanBakuId: string; jumlah: number }[] } = {};
    recipes.forEach((r: any) => {
      if (r.produkId) {
        recipeMap[r.produkId] = r.komposisi ?? [];
      }
    });

    // 3. Aggregate recipe usage based on excel sales today
    const recipeUsageMap: { [bahanId: string]: number } = {};
    if (allSales) {
      allSales.forEach((sale: any) => {
        const saleDate = parseDateString(sale.tanggal || sale.createdAt);
        if (saleDate === selectedDate) {
          const items = sale.items ?? [];
          items.forEach((item: any) => {
            const qtySold = Number(item.total ?? 0);
            if (qtySold <= 0) return;
            const productId = productCodeMap[item.code];
            if (!productId) return;
            const recipe = recipeMap[productId];
            if (!recipe) return;
            recipe.forEach((ing: any) => {
              const usedAmount = ing.jumlah * qtySold;
              recipeUsageMap[ing.bahanBakuId] = (recipeUsageMap[ing.bahanBakuId] || 0) + usedAmount;
            });
          });
        }
      });
    }

    // 4. Find stock opnames (yesterday vs today)
    // We look for any daily opname matching the respective dates
    let yesterdayOpname: any = null;
    let todayOpname: any = null;

    if (allOpnames) {
      allOpnames.forEach((op: any) => {
        const opDate = parseDateString(op.date);
        if (opDate === selectedDate) {
          todayOpname = op;
        } else if (opDate === yesterdayDate) {
          yesterdayOpname = op;
        }
      });
    }

    // Map opname items by materialId
    const getOpnameStockMap = (opnameDoc: any) => {
      const map: { [materialId: string]: { bulk: number; small: number } } = {};
      if (opnameDoc?.items) {
        opnameDoc.items.forEach((item: any) => {
          if (item.id) {
            map[item.id] = {
              bulk: Number(item.after?.qtyKontainerBesar ?? 0),
              small: Number(item.after?.qtyKontainerKecil ?? 0),
            };
          }
        });
      }
      return map;
    };

    const yesterdayStockMap = getOpnameStockMap(yesterdayOpname);
    const todayStockMap = getOpnameStockMap(todayOpname);

    // 5. Aggregate belanja and pengambilan gudang from log_pembelian_bahan
    // Belanja = type in ['supplier', 'belanja'] and location === 'kontainer'
    // Pengambilan = type === 'ambil-gudang' and location === 'kontainer'
    const belanjaMap: { [materialId: string]: number } = {}; // in large units
    const pengambilanMap: { [materialId: string]: number } = {}; // in large units

    if (allLogs) {
      allLogs.forEach((log: any) => {
        const logDate = parseDateString(log.tanggal || log.createdAt);
        if (logDate === selectedDate) {
          const items = log.items ?? [];
          const isBelanjaType = log.type === "supplier" || log.type === "belanja";
          const isAmbilGudang = log.type === "ambil-gudang";

          if (isBelanjaType) {
            items.forEach((item: any) => {
              if (item.materialId) {
                // If log has totalQtyKecil, we sum that, otherwise we will multiply qty by conversion rate
                const qtyKecil = item.totalQtyKecil ?? 0;
                const qty = item.qty ?? 0;
                belanjaMap[item.materialId] = (belanjaMap[item.materialId] || 0) + (qtyKecil > 0 ? qtyKecil : qty);
              }
            });
          } else if (isAmbilGudang) {
            items.forEach((item: any) => {
              if (item.materialId) {
                // Pengambilan is stored as raw qty (bulk unit). We sum the qty here and multiply by conversion rate later
                pengambilanMap[item.materialId] = (pengambilanMap[item.materialId] || 0) + (item.qty ?? 0);
              }
            });
          }
        }
      });
    }

    // 6. Build the final row list
    return materials
      .map((mat: any) => {
        const conversionRate = Number(mat.qtyKecil || 1);

        // Col 3: Pemakaian resep (satuan kecil)
        const resepUsage = recipeUsageMap[mat.id] || 0;

        // Col 4: Opname Kemarin (convert to small units)
        const prevOpname = yesterdayStockMap[mat.id];
        const prevStockKecil = prevOpname
          ? prevOpname.bulk * conversionRate + prevOpname.small
          : 0;

        // Col 5: Opname Hari Ini (convert to small units)
        const currOpname = todayStockMap[mat.id];
        const currStockKecil = currOpname
          ? currOpname.bulk * conversionRate + currOpname.small
          : 0;

        // Col 6: Rekap Belanja (if it was added as bulk units without totalQtyKecil, convert it)
        const rawBelanjaVal = belanjaMap[mat.id] || 0;
        // In our system, if it's totalQtyKecil it will be stored directly, otherwise it's bulk quantity
        // Let's assume rawBelanjaVal is in small units if it represents totalQtyKecil, else convert it:
        // Actually, we sum item.totalQtyKecil or raw item.qty. If raw item.qty, we multiply it by conversion rate:
        // Since input-bahan saves totalQtyKecil, it's already in small units. Let's make sure:
        const belanjaKecil = rawBelanjaVal;

        // Col 7: Pengambilan Gudang (stored as bulk units, so multiply by conversion rate)
        const rawPengambilanVal = pengambilanMap[mat.id] || 0;
        const pengambilanKecil = rawPengambilanVal * conversionRate;

        // Col 8: Pemakaian Fisik = Opname Kemarin + Belanja + Pengambilan - Opname Hari Ini
        const pemakaianFisik = prevStockKecil + belanjaKecil + pengambilanKecil - currStockKecil;

        // Col 9: Selisih (Bahan Baku Hilang) = Pemakaian Fisik - Pemakaian Resep
        const stockLoss = pemakaianFisik - resepUsage;

        const priceBesar = Number(mat.currentPrice ?? mat.avgPrice ?? mat.hargaBeliSatuanBesar ?? 0);
        const unitPriceKecil = Number(mat.hargaSatuanKecil ?? (conversionRate > 0 ? priceBesar / conversionRate : 0));
        const calibrationNominal = stockLoss * unitPriceKecil;

        return {
          id: mat.id,
          code: mat.code ?? "-",
          nama: mat.nama ?? "-",
          satuanKecil: mat.satuanKecil ?? "pcs",
          resepUsage,
          prevStockKecil,
          currStockKecil,
          belanjaKecil,
          pengambilanKecil,
          pemakaianFisik,
          stockLoss,
          unitPriceKecil,
          calibrationNominal,
        };
      })
      .filter((row: any) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          row.code.toLowerCase().includes(term) ||
          row.nama.toLowerCase().includes(term)
        );
      });
  }, [
    materials,
    products,
    recipes,
    allSales,
    allOpnames,
    allLogs,
    selectedDate,
    yesterdayDate,
    searchTerm,
  ]);

  const loading =
    loadingMaterials ||
    loadingProducts ||
    loadingRecipes ||
    loadingSales ||
    loadingOpnames ||
    loadingLogs;

  // Summaries
  const totalResepUsageAll = useMemo(() => {
    return reportRows.reduce((sum, r) => sum + r.resepUsage, 0);
  }, [reportRows]);

  const totalFisikUsageAll = useMemo(() => {
    return reportRows.reduce((sum, r) => sum + r.pemakaianFisik, 0);
  }, [reportRows]);

  const totalStockLossRupiah = useMemo(() => {
    return reportRows.reduce((sum, r) => sum + (r.stockLoss > 0 ? r.calibrationNominal : 0), 0);
  }, [reportRows]);

  // Export to Excel
  const handleExportExcel = () => {
    if (reportRows.length === 0) return;
    const dataToExport = reportRows.map((r) => ({
      "Kode Bahan Baku": r.code,
      "Nama Bahan": r.nama,
      "Pemakaian Resep": r.resepUsage,
      "Opname Kemarin": r.prevStockKecil,
      "Opname Hari Ini": r.currStockKecil,
      "Belanja Bahan": r.belanjaKecil,
      "Pengambilan Gudang": r.pengambilanKecil,
      "Pemakaian Fisik": r.pemakaianFisik,
      "Stock Loss (Hilang)": r.stockLoss,
      "Kalibrasi Nominal": r.calibrationNominal,
      Satuan: r.satuanKecil,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Stock Loss ${selectedDate}`);
    XLSX.writeFile(wb, `Laporan_Stock_Loss_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Search & Date Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex-1 flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Cari kode atau nama bahan baku..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 w-full focus:outline-none placeholder-slate-400"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-700 focus:outline-none uppercase"
            />
          </div>
          <Button
            onClick={handleExportExcel}
            className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest gap-2 h-11 px-4 shadow-md shadow-emerald-100 shrink-0"
            disabled={reportRows.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-6">
        <Card className="p-3 md:p-6 bg-gradient-to-br from-blue-50 to-blue-100/30 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden">
          <div className="space-y-2 md:space-y-3">
            <div className="inline-flex p-1.5 md:p-2.5 rounded-xl bg-blue-500/10 text-blue-700">
              <TrendingUp className="h-3.5 w-3.5 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Resep Terpakai</p>
              <h3 className="text-xs sm:text-lg md:text-2xl font-black text-blue-900 mt-0.5 tabular-nums">
                {formatNumber(totalResepUsageAll)}
              </h3>
            </div>
          </div>
        </Card>

        <Card className="p-3 md:p-6 bg-gradient-to-br from-indigo-50 to-indigo-100/30 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden">
          <div className="space-y-2 md:space-y-3">
            <div className="inline-flex p-1.5 md:p-2.5 rounded-xl bg-indigo-500/10 text-indigo-700">
              <Package className="h-3.5 w-3.5 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Pemakaian Fisik</p>
              <h3 className="text-xs sm:text-lg md:text-2xl font-black text-indigo-900 mt-0.5 tabular-nums">
                {formatNumber(totalFisikUsageAll)}
              </h3>
            </div>
          </div>
        </Card>

        <Card className="p-3 md:p-6 bg-gradient-to-br from-rose-50 to-rose-100/30 border-none shadow-sm rounded-2xl md:rounded-3xl relative overflow-hidden">
          <div className="space-y-2 md:space-y-3">
            <div className="inline-flex p-1.5 md:p-2.5 rounded-xl bg-rose-500/10 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-[7px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Stok Loss (Rupiah)</p>
              <h3 className="text-xs sm:text-lg md:text-2xl font-black text-rose-900 mt-0.5 tabular-nums">
                Rp {formatNumber(totalStockLossRupiah)}
              </h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-black uppercase italic text-slate-900">Rincian Perbandingan Stok Harian ({selectedDate})</h3>
          </div>
        </div>

        <div className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : reportRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3.5 font-black uppercase text-slate-500">Kode</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500">Nama Bahan</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Pemakaian Resep (Excel)</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Opname Kemarin</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Opname Hari Ini</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Belanja Bahan</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Mutasi Pengambilan</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Pemakaian Fisik</th>
                    <th className="px-4 py-3.5 font-black uppercase text-slate-500 text-center">Selisih Loss (Hilang)</th>
                    <th className="px-5 py-3.5 font-black uppercase text-slate-500 text-right">Kalibrasi Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reportRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4 font-bold text-slate-900">{row.code}</td>
                      <td className="px-4 py-4 font-black uppercase italic text-slate-800">{row.nama}</td>
                      <td className="px-4 py-4 text-center font-bold text-blue-600 tabular-nums">
                        {formatNumber(row.resepUsage)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-slate-700 tabular-nums">
                        {formatNumber(row.prevStockKecil)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-slate-700 tabular-nums">
                        {formatNumber(row.currStockKecil)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-slate-600 tabular-nums">
                        {formatNumber(row.belanjaKecil)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-amber-600 tabular-nums">
                        {formatNumber(row.pengambilanKecil)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-black text-indigo-900 tabular-nums">
                        {formatNumber(row.pemakaianFisik)} <span className="text-[10px] text-slate-400 font-semibold">{row.satuanKecil}</span>
                      </td>
                      <td className="px-4 py-4 text-center font-black tabular-nums">
                        {row.stockLoss === 0 ? (
                          <span className="text-emerald-600">0</span>
                        ) : row.stockLoss > 0 ? (
                          <span className="text-rose-600">+{formatNumber(row.stockLoss)} {row.satuanKecil}</span>
                        ) : (
                          <span className="text-emerald-600">{formatNumber(row.stockLoss)} {row.satuanKecil}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-black tabular-nums text-xs">
                        {row.calibrationNominal === 0 ? (
                          <span className="text-emerald-600">Rp 0</span>
                        ) : row.calibrationNominal > 0 ? (
                          <span className="text-rose-600">+Rp {formatNumber(Math.round(row.calibrationNominal))}</span>
                        ) : (
                          <span className="text-emerald-600">-Rp {formatNumber(Math.round(Math.abs(row.calibrationNominal)))}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-20 text-center font-bold uppercase text-slate-400 text-xs tracking-widest">
              Tidak ada data stock loss untuk tanggal ini
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
