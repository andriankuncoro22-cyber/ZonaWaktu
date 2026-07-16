"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
} from "firebase/firestore";
import {
  Loader2,
  CalendarDays,
  BarChart2,
  FileDown,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─────────────────── helpers ─────────────────── */
function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
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

  // Date pickers
  const today = new Date().toISOString().split("T")[0];
  const [hariDate, setHariDate] = useState(today);
  const [bulanYM, setBulanYM] = useState(today.slice(0, 7)); // "YYYY-MM"

  // Loading state
  const [loadingReport, setLoadingReport] = useState(false);

  // Report data
  const [hariRows, setHariRows] = useState<BahanRow[] | null>(null);
  const [bulanRows, setBulanRows] = useState<BahanRow[] | null>(null);

  // Settings (for PDF header)
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  /* ── Fetch & compute ── */
  async function fetchReport(mode: "harian" | "bulanan") {
    setLoadingReport(true);
    try {
      // 1. Load all bahan baku
      const bahanSnap = await getDocs(collection(db, "bahan-baku"));
      const bahanMap: { [id: string]: { code: string; nama: string; satuanKecil: string; hargaSatuanKecil: number } } = {};
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

      // 2. Load all products (produk)
      const produkSnap = await getDocs(collection(db, "produk"));
      const productCodeMap: { [code: string]: string } = {};
      produkSnap.forEach((d) => {
        const data = d.data();
        if (data.code) {
          productCodeMap[data.code] = d.id;
        }
      });

      // 3. Load all recipes (resep)
      const resepSnap = await getDocs(collection(db, "resep"));
      const recipeMap: { [produkId: string]: { bahanBakuId: string; jumlah: number }[] } = {};
      resepSnap.forEach((d) => {
        const data = d.data();
        if (data.produkId) {
          recipeMap[data.produkId] = data.komposisi ?? [];
        }
      });

      // 4. Load penjualan filtered by date
      let penjualanQuery;
      if (mode === "harian") {
        penjualanQuery = query(
          collection(db, "penjualan"),
          where("tanggal", "==", hariDate)
        );
      } else {
        // Bulanan: tanggal starts with YYYY-MM
        const [year, month] = bulanYM.split("-");
        const start = `${year}-${month}-01`;
        // last day of month
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        const end = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
        penjualanQuery = query(
          collection(db, "penjualan"),
          where("tanggal", ">=", start),
          where("tanggal", "<=", end)
        );
      }

      const penjualanSnap = await getDocs(penjualanQuery);

      // 5. Aggregate: for each sales doc -> each item -> each composition ingredient
      const agg: { [bahanId: string]: number } = {};

      penjualanSnap.forEach((doc) => {
        const data = doc.data() as any;
        const items = data.items ?? [];
        items.forEach((item: any) => {
          const qty = Number(item.total ?? 0);
          if (qty <= 0) return;
          const productId = productCodeMap[item.code];
          if (!productId) return;
          const recipe = recipeMap[productId];
          if (!recipe) return;
          recipe.forEach((ing) => {
            const used = ing.jumlah * qty;
            agg[ing.bahanBakuId] = (agg[ing.bahanBakuId] || 0) + used;
          });
        });
      });

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
        .sort((a: any, b: any) => a.code.localeCompare(b.code)) as BahanRow[];

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
            Pemakaian Bahan Baku — Harian &amp; Bulanan
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-2xl px-5 py-3">
          <BarChart2 className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            Rekap Otomatis dari Penjualan &amp; Resep
          </span>
        </div>
      </header>

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
            <div className="p-6 md:p-8 border-b border-slate-50 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={hariDate}
                  onChange={(e) => {
                    setHariDate(e.target.value);
                    setHariRows(null);
                  }}
                  className="h-12 px-4 rounded-xl bg-slate-50 border-none text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button
                onClick={() => fetchReport("harian")}
                disabled={loadingReport}
                className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2"
              >
                {loadingReport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Tampilkan
              </Button>

              {hariRows && hariRows.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => exportExcel(hariRows, hariDate)}
                    className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportPDF(hariRows, hariDate)}
                    className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                    PDF
                  </Button>
                </>
              )}
            </div>

            {/* Summary badges */}
            {hariRows && hariRows.length > 0 && (
              <div className="px-6 md:px-8 pt-6 flex flex-wrap items-center gap-3">
                <span className="bg-primary/5 text-primary border border-primary/10 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest">
                  {hariRows.length} Jenis Bahan
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest">
                  Total Harga: Rp {hariRows.reduce((sum, r) => sum + r.totalHarga, 0).toLocaleString("id-ID")}
                </span>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  Periode: {new Date(hariDate + "T00:00:00").toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}

            <ReportTable rows={hariRows} loading={loadingReport} />
          </Card>
        </TabsContent>

        {/* ── BULANAN ── */}
        <TabsContent value="bulanan">
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
            {/* Controls */}
            <div className="p-6 md:p-8 border-b border-slate-50 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Bulan
                </label>
                <input
                  type="month"
                  value={bulanYM}
                  onChange={(e) => {
                    setBulanYM(e.target.value);
                    setBulanRows(null);
                  }}
                  className="h-12 px-4 rounded-xl bg-slate-50 border-none text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button
                onClick={() => fetchReport("bulanan")}
                disabled={loadingReport}
                className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2"
              >
                {loadingReport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Tampilkan
              </Button>

              {bulanRows && bulanRows.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => exportExcel(bulanRows, monthLabel(bulanYM))}
                    className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportPDF(bulanRows, monthLabel(bulanYM))}
                    className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white"
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                    PDF
                  </Button>
                </>
              )}
            </div>

            {/* Summary badges */}
            {bulanRows && bulanRows.length > 0 && (
              <div className="px-6 md:px-8 pt-6 flex flex-wrap items-center gap-3">
                <span className="bg-primary/5 text-primary border border-primary/10 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest">
                  {bulanRows.length} Jenis Bahan
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest">
                  Total Harga: Rp {bulanRows.reduce((sum, r) => sum + r.totalHarga, 0).toLocaleString("id-ID")}
                </span>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  Periode: {monthLabel(bulanYM)}
                </span>
              </div>
            )}

            <ReportTable rows={bulanRows} loading={loadingReport} />
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
    <div className="overflow-x-auto custom-scrollbar">
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
  );
}
