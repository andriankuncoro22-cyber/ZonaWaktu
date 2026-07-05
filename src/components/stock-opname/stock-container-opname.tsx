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
import { collection, doc, orderBy, query, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
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

  const getUnitWeight = (item: any) => {
    const gramPerBesar = Number(item.gramPerBesar || 0);
    const konversi = Number(item.qtyKecil || 1);
    return konversi > 0 ? gramPerBesar / konversi : 0;
  };

  const getTotalWeightFromAktif = (item: any, aktifQty: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    return Number(aktifQty || 0) * getUnitWeight(item) + beratBungkus;
  };

  const getAktifFromGrams = (item: any, gramsValue: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    const netGrams = Math.max(0, Number(gramsValue || 0) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    return unitWeight > 0 ? netGrams / unitWeight : 0;
  };

  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number; grams: number }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);

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
    const nextBulk: Record<string, number> = {};
    filtered.forEach((item: any) => {
      const aktif = Number(item.qtyKontainerKecil || 0);
      const grams = getTotalWeightFromAktif(item, aktif);
      next[item.id] = { aktif, grams };
      nextBulk[item.id] = Number(item.qtyKontainerBesar || 0);
    });

    setKontainerInputs(next);
    setBulkInputs(nextBulk);
  }, [materials, searchTerm]);

  const formatNumber = (value: number | string | undefined) => {
    const num = Number(value || 0);
    return new Intl.NumberFormat("id-ID").format(num);
  };

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

  const finalizeAll = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: any[] = [];
      (filteredMaterials || []).forEach((it: any) => {
        const beforeBulk = Number(it.qtyKontainerBesar || 0);
        const beforeAktif = Number(it.qtyKontainerKecil || 0);
        const afterBulk = Number(bulkInputs[it.id] ?? beforeBulk);
        const afterAktif = Number(kontainerInputs[it.id]?.aktif ?? beforeAktif);

        const ref = doc(db, "bahan-baku", it.id);
        batch.update(ref, { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif });

        historyItems.push({
          id: it.id,
          code: it.code,
          nama: it.nama,
          before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
          after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif },
        });
      });

      await batch.commit();
      await addDoc(collection(db, "opnam_harian"), {
        date: serverTimestamp(),
        note: "Finalisasi Opnam Harian",
        items: historyItems,
      });
      window.alert("Finalisasi berhasil dan stok sistem diperbarui.");
    } catch (err) {
      console.error(err);
      window.alert("Terjadi kesalahan saat finalisasi. Cek console.");
    } finally {
      setProcessing(false);
    }
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

      <Card className="overflow-hidden rounded-[1.25rem] border-none bg-white shadow-sm sm:rounded-[2rem]">
        <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/30 p-3 sm:p-6 md:flex-row md:items-center md:justify-between">
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

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 p-4">
          {loading ? (
            <div className="col-span-full rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              <RefreshCcw className="mx-auto mb-3 h-8 w-8 animate-spin text-primary opacity-20" />
              Memuat data...
            </div>
          ) : (
            filteredMaterials?.map((item: any) => (
              <Card key={item.id} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.code}</p>
                    <p className="text-base font-black uppercase tracking-tight text-slate-900">{item.nama}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                        Bungkus: {Number(item.beratBungkusProduk || 0).toLocaleString("id-ID")} g
                      </span>
                      <span className="rounded-full bg-primary/5 px-2 py-1 font-semibold text-primary">
                        Total/produk: {Number(item.totalGramasiPerProduk ?? (Number(item.gramPerBesar || 0) + Number(item.beratBungkusProduk || 0))).toLocaleString("id-ID")} g
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-primary hover:bg-primary/5">
                    <CheckCircle2 className="h-5 w-5" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 text-[10px]">
                  <div className="flex justify-between rounded-2xl bg-slate-50 p-3">
                    <span className="font-black text-slate-600">Bulk (Sistem)</span>
                    <span className="font-black text-indigo-600 tabular-nums">{formatNumber(item.qtyKontainerBesar || 0)} {item.satuanBesar}</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 p-3">
                    <span className="font-black text-slate-600">Aktif (Sistem)</span>
                    <span className="font-black text-emerald-600 tabular-nums">{formatNumber(Math.round(item.qtyKontainerKecil || 0))} {item.satuanKecil}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <Input
                      type="number"
                      value={bulkInputs[item.id] ?? ""}
                      onChange={(e) => {
                        const val = Number(e.target.value || 0);
                        setBulkInputs((prev) => ({ ...prev, [item.id]: val }));
                      }}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-11 w-full rounded-2xl border-none bg-slate-50 pr-12 text-center text-base font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-indigo-300">{item.satuanBesar}</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      value={kontainerInputs[item.id]?.grams ?? ""}
                      onChange={(e) => {
                        const gramsVal = Number(e.target.value || 0);
                        setKontainerInputs((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || { aktif: 0, grams: 0 }),
                            grams: gramsVal,
                            aktif: Math.round(getAktifFromGrams(item, gramsVal) * 100) / 100,
                          },
                        }));
                      }}
                      placeholder="0 g"
                      inputMode="decimal"
                      className="h-11 w-full rounded-2xl border-none bg-slate-50 pr-12 text-center text-base font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-slate-400">g</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      value={kontainerInputs[item.id]?.aktif ?? ""}
                      readOnly
                      placeholder="0"
                      className="h-11 w-full cursor-not-allowed rounded-2xl border-none bg-slate-100 pr-12 text-center text-base font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black uppercase text-emerald-300">{item.satuanKecil}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
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
        </div>
      </Card>
      <div className="mt-4">
        <Button
          onClick={finalizeAll}
          className="mt-3 h-12 w-full rounded-2xl bg-emerald-600 px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-emerald-200 hover:bg-emerald-700 sm:h-14 sm:px-10 sm:text-[11px] md:w-auto"
          disabled={processing}
        >
          {processing ? "Memproses..." : "Finalisasi & Update Stok Sistem (langsung)"}
        </Button>
      </div>
  </div>
  );
}
