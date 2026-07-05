"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Layers,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCollection, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, orderBy, query } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface StockContainerOpnameViewProps {
  title?: string;
  subtitle?: string;
}

export function StockContainerOpnameView({
  title = "Opnam Harian",
  subtitle = "Verifikasi stok kontainer harian dengan alur yang sama seperti stok opname kontainer",
}: StockContainerOpnameViewProps) {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");

  const materialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db]
  );

  const { data: materials, loading } = useCollection(materialsQuery);
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number; grams: number }>>({});

  const filteredMaterials = (materials as any[])?.filter(
    (item) =>
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (!materials) return;

    const filtered = (materials as any[]).filter(
      (item) =>
        item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const next: Record<string, { aktif: number; grams: number }> = {};
    filtered.forEach((item: any) => {
      const aktif = Number(item.qtyKontainerKecil || 0);
      const gramPerBesar = Number(item.gramPerBesar || 0);
      const konversi = Number(item.qtyKecil || 1);
      const grams = gramPerBesar > 0 ? (aktif * (gramPerBesar / konversi)) : 0;
      next[item.id] = { aktif, grams };
    });

    setKontainerInputs(next);
  }, [materials, searchTerm]);

  const formatTotalStock = (item: any) => {
    const qtyGudang = Number(item.qtyBesar || 0);
    const qtyBulk = Number(item.qtyKontainerBesar || 0);
    const qtyAktif = Number(item.qtyKontainerKecil || 0);
    const konversi = Number(item.qtyKecil || 1);

    const totalKecil = (qtyGudang + qtyBulk) * konversi + qtyAktif;
    const hasilBesar = Math.floor(totalKecil / konversi);
    const hasilKecil = Math.round(totalKecil % konversi);

    if (hasilKecil === 0) return `${hasilBesar} ${item.satuanBesar}`;
    if (hasilBesar === 0) return `${hasilKecil} ${item.satuanKecil}`;
    return `${hasilBesar} ${item.satuanBesar} ${hasilKecil} ${item.satuanKecil}`;
  };

  const handleExportExcel = () => {
    const wsData = filteredMaterials?.map((item: any) => ({
      Kode: item.code,
      "Nama Bahan": item.nama,
      "Stok Gudang (Sistem)": item.qtyBesar || 0,
      "Satuan Besar": item.satuanBesar,
      "Bulk Kontainer (Sistem)": item.qtyKontainerBesar || 0,
      "Aktif Kontainer (Sistem)": item.qtyKontainerKecil || 0,
      "Satuan Kecil": item.satuanKecil,
      "Total Keseluruhan": formatTotalStock(item),
    }));

    const ws = XLSX.utils.json_to_sheet(wsData || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Opname");
    XLSX.writeFile(wb, `Stock_Opname_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF("l", "mm", "a4");

    if (settings?.logoHeader) {
      try {
        const response = await fetch(settings.logoHeader);
        const blob = await response.blob();
        const logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        docPDF.addImage(logoBase64 as string, "PNG", 15, 10, 35, 12);
      } catch (error) {
        console.error("Failed to load logo for PDF", error);
      }
    }

    docPDF.setFontSize(18);
    docPDF.setTextColor(139, 26, 26);
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 148, 15, { align: "center" });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 148, 21, { align: "center" });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 282, 28);

    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text("LAPORAN STOCK OPNAME", 148, 40, { align: "center" });
    docPDF.setFontSize(10);
    docPDF.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, 148, 46, { align: "center" });

    const tableData = filteredMaterials?.map((item: any) => [
      item.code,
      item.nama.toUpperCase(),
      `${item.qtyBesar || 0} ${item.satuanBesar}`,
      `${item.qtyKontainerBesar || 0} ${item.satuanBesar}`,
      `${Math.round(item.qtyKontainerKecil || 0)} ${item.satuanKecil}`,
      formatTotalStock(item),
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG", "KONT. BULK", "KONT. AKTIF", "TOTAL GABUNGAN"]],
      body: tableData || [],
      startY: 55,
      theme: "grid",
      headStyles: { fillColor: [139, 26, 26] },
      styles: { fontSize: 8 },
    });

    docPDF.save(`Stock_Opname_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 sm:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 sm:text-3xl">
            {title}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 sm:text-xs">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 sm:h-12 sm:px-6"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 sm:h-12 sm:px-6"
          >
            <FileDown className="mr-2 h-4 w-4 text-primary" /> PDF
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden rounded-[1.5rem] border-none bg-white shadow-sm sm:rounded-[2rem]">
        <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/30 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari bahan berdasarkan kode atau nama..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border-none bg-white py-3 pl-12 pr-4 text-xs font-bold outline-none shadow-sm transition-all focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 sm:gap-6">
            <span className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-indigo-500" /> Stok Bulk
            </span>
            <span className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" /> Stok Aktif
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left sm:min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6 sm:py-6 lg:px-10">Bahan Baku</th>
                <th className="px-3 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4 sm:py-6 lg:px-6">Bulk (Sistem)</th>
                <th className="px-3 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4 sm:py-6 lg:px-6">Aktif (Sistem)</th>
                <th className="px-3 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4 sm:py-6 lg:px-8">Input Fisik (Bulk)</th>
                <th className="px-3 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4 sm:py-6 lg:px-8">Input Fisik (Aktif)</th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-6 sm:py-6 lg:px-10">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <RefreshCcw className="mx-auto h-8 w-8 animate-spin text-primary opacity-20" />
                  </td>
                </tr>
              ) : (
                filteredMaterials?.map((item: any) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-5 sm:px-6 lg:px-10">
                      <p className="mb-1 text-[10px] font-bold text-primary">{item.code}</p>
                      <p className="text-sm font-black uppercase italic text-slate-900">{item.nama}</p>
                    </td>
                    <td className="px-3 py-5 text-right sm:px-4 lg:px-6">
                      <p className="text-lg font-black tabular-nums text-indigo-600 sm:text-xl">{item.qtyKontainerBesar || 0}</p>
                      <p className="text-[8px] font-bold uppercase text-slate-400">{item.satuanBesar}</p>
                    </td>
                    <td className="px-3 py-5 text-right sm:px-4 lg:px-6">
                      <p className="text-lg font-black tabular-nums text-emerald-600 sm:text-xl">{Math.round(item.qtyKontainerKecil || 0)}</p>
                      <p className="text-[8px] font-bold uppercase text-slate-400">{item.satuanKecil}</p>
                    </td>
                    <td className="px-3 py-5 sm:px-4 lg:px-8">
                      <div className="relative w-full max-w-[8rem] sm:max-w-[9rem]">
                        <Input type="number" placeholder="0" className="h-11 rounded-xl border-none bg-slate-50 pr-12 text-center text-base font-black sm:h-12 sm:text-lg" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-indigo-300">{item.satuanBesar}</span>
                      </div>
                    </td>
                    <td className="px-3 py-5 sm:px-4 lg:px-8">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative w-full max-w-[8rem] sm:max-w-[8rem]">
                          <Input
                            type="number"
                            value={kontainerInputs[item.id]?.aktif ?? ""}
                            readOnly
                            placeholder="Auto"
                            className="h-11 cursor-not-allowed rounded-xl border-none bg-slate-100 pr-12 text-center text-base font-black sm:h-12 sm:text-lg"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-emerald-300">{item.satuanKecil}</span>
                        </div>

                        <div className="relative w-full max-w-[8rem] sm:max-w-[8rem]">
                          <Input
                            type="number"
                            value={kontainerInputs[item.id]?.grams ?? ""}
                            onChange={(e) => {
                              const gramsVal = Number(e.target.value || 0);
                              setKontainerInputs((prev) => {
                                const gramPerBesar = Number(item.gramPerBesar || 0);
                                const konversi = Number(item.qtyKecil || 1);
                                let aktifFromGrams = 0;
                                if (gramPerBesar > 0) {
                                  aktifFromGrams = gramsVal / (gramPerBesar / konversi);
                                }
                                return {
                                  ...prev,
                                  [item.id]: {
                                    ...(prev[item.id] || { aktif: 0, grams: 0 }),
                                    grams: gramsVal,
                                    aktif: Math.round(aktifFromGrams * 100) / 100,
                                  },
                                };
                              });
                            }}
                            placeholder="0 g"
                            className="h-11 rounded-xl border-none bg-slate-50 pr-12 text-center text-base font-black sm:h-12 sm:text-lg"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-slate-400">g</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-right sm:px-6 lg:px-10">
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-primary hover:bg-primary/5">
                        <CheckCircle2 className="h-5 w-5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 bg-slate-900 p-4 text-white sm:p-6 md:flex-row md:items-center md:gap-6 lg:p-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-400 shadow-inner sm:h-12 sm:w-12">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest sm:text-xs">Sinkronisasi Data Fisik</p>
              <p className="mt-1 max-w-md text-[9px] leading-relaxed text-slate-400 sm:text-[10px]">
                Pastikan semua tim operasional telah menyelesaikan input fisik untuk stok Bulk dan Aktif sebelum melakukan finalisasi update sistem.
              </p>
            </div>
          </div>
          <Button className="h-12 w-full rounded-2xl bg-primary px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 hover:bg-primary/90 sm:h-14 sm:px-10 sm:text-[11px] md:w-auto">
            Finalisasi & Update Stok Sistem
          </Button>
        </div>
      </Card>
    </div>
  );
}
