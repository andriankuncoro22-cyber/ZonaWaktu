"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  RefreshCcw,
  Search,
  Upload,
  History,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCollection, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, orderBy, query, addDoc, serverTimestamp } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface StockContainerOpnameViewProps {
  title?: string;
  subtitle?: string;
}

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  qtyBesar?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  qtyKecil?: number;
  satuanBesar?: string;
  satuanKecil?: string;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  totalGramasiPerProduk?: number;
  [key: string]: unknown;
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

  const cleanNumber = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const getUnitWeight = (item: any) => {
    const gramPerBesar = cleanNumber(item?.gramPerBesar);
    const konversi = cleanNumber(item?.qtyKecil) || 1;
    const res = konversi > 0 ? gramPerBesar / konversi : 0;
    return isNaN(res) ? 0 : res;
  };

  const getAktifFromGrams = (item: any, gramsValue: any) => {
    const beratBungkus = cleanNumber(item?.beratBungkusProduk);
    const netGrams = Math.max(0, cleanNumber(gramsValue) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    const res = unitWeight > 0 ? netGrams / unitWeight : 0;
    return isNaN(res) ? 0 : res;
  };

  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number; grams: number }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const historyQuery = useMemoFirebase(
    () => query(collection(db, "opnam_harian"), orderBy("date", "desc")),
    [db]
  );
  const { data: histories, loading: historyLoading } = useCollection(historyQuery);

  const formatDateOnly = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch {
      return "-";
    }
  };

  const formatTimeOnly = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date) + " WIB";
    } catch {
      return "-";
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetInputs = () => {
    setKontainerInputs({});
    setBulkInputs({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const excelData = XLSX.utils.sheet_to_json(ws) as any[];

        if (!excelData || excelData.length === 0) {
          window.alert("Berkas Excel kosong atau format tidak sesuai.");
          return;
        }

        const newBulkInputs: Record<string, number> = { ...bulkInputs };
        const newKontainerInputs: Record<string, { aktif: number; grams: number }> = { ...kontainerInputs };
        const allMaterials = (materials as BahanBaku[]) || [];

        let matchedCount = 0;

        const cleanStr = (s: any) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        const getRowVal = (row: any, primaryKeywords: string[], secondaryKeywords: string[] = []) => {
          const keys = Object.keys(row);
          // First pass: exact matches, ignoring headers that contain "satuan" or "unit"
          for (const k of keys) {
            const cleanK = cleanStr(k);
            if (cleanK.includes("satuan") || cleanK.includes("unit")) continue;
            for (const kw of primaryKeywords) {
              const cleanKw = cleanStr(kw);
              if (cleanK === cleanKw) {
                const val = row[k];
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                  return val;
                }
              }
            }
          }
          // Second pass: includes matches, ignoring headers that contain "satuan" or "unit"
          for (const k of keys) {
            const cleanK = cleanStr(k);
            if (cleanK.includes("satuan") || cleanK.includes("unit")) continue;
            for (const kw of [...primaryKeywords, ...secondaryKeywords]) {
              const cleanKw = cleanStr(kw);
              if (cleanK.includes(cleanKw)) {
                const val = row[k];
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                  return val;
                }
              }
            }
          }
          return undefined;
        };

        excelData.forEach((row: any) => {
          const codeVal = getRowVal(row, ["code", "kode", "kd", "sku", "barcode"]);
          const namaVal = getRowVal(row, ["nama", "name", "bahan", "barang", "item"]);

          if (!codeVal && !namaVal) return;

          let mat = allMaterials.find(m => cleanStr(m.code) === cleanStr(codeVal));
          if (!mat && namaVal) {
            mat = allMaterials.find(m => cleanStr(m.nama) === cleanStr(namaVal) || cleanStr(m.nama).includes(cleanStr(namaVal)));
          }

          if (!mat) return;

          const bulkValRaw = getRowVal(
            row,
            ["bulk", "bulkkontainer", "bulkkontainersistem", "stokbulk", "bulkfisik", "qtybulk"],
            ["bulk", "kontainerbesar"]
          );
          if (bulkValRaw !== undefined) {
            newBulkInputs[mat.id] = cleanNumber(bulkValRaw);
          }

          const gramsValRaw = getRowVal(
            row,
            ["gram", "grams", "gramasi", "berat", "timbangan", "beratgram", "stokgramasi"],
            ["gram", "berat", "timbang"]
          );

          const aktifValRaw = getRowVal(
            row,
            ["aktifkontainer", "aktifkontainersistem", "stokaktif", "aktif", "aktifisik", "qtyaktif"],
            ["aktif", "kontainerkecil"]
          );

          if (gramsValRaw !== undefined) {
            const gramsNum = cleanNumber(gramsValRaw);
            newKontainerInputs[mat.id] = {
              grams: gramsNum,
              aktif: gramsNum
            };
          } else if (aktifValRaw !== undefined) {
            const numVal = cleanNumber(aktifValRaw);
            newKontainerInputs[mat.id] = {
              grams: numVal,
              aktif: numVal
            };
          }

          matchedCount++;
        });

        setBulkInputs({ ...newBulkInputs });
        setKontainerInputs({ ...newKontainerInputs });

        if (matchedCount > 0) {
          window.alert(`Berhasil mengimpor ${matchedCount} data bahan baku ke formulir opnam.`);
        } else {
          window.alert("Tidak ada data bahan yang cocok. Pastikan Excel memiliki kolom 'Kode' atau 'Nama Bahan', serta 'Bulk' dan 'Gram' / 'Aktif'.");
        }
      } catch (err) {
        console.error("Error parsing excel:", err);
        window.alert("Gagal membaca berkas Excel. Pastikan formatnya benar.");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredMaterials = (materials as BahanBaku[])?.filter(
    (item) =>
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatNumber = (value: number | string | undefined) => {
    const num = Number(value || 0);
    return new Intl.NumberFormat("id-ID").format(num);
  };

  const formatTotalStock = (item: BahanBaku) => {
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
    const wsData = filteredMaterials?.map((item) => ({
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

    const tableData = filteredMaterials?.map((item) => [
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
      interface HistoryItem {
        id: string;
        code?: string;
        nama?: string;
        before: { qtyKontainerBesar: number; qtyKontainerKecil: number };
        after: { qtyKontainerBesar: number; qtyKontainerKecil: number };
      }

      const latestHistory = histories && (histories as any[]).length > 0 ? (histories as any[])[0] : null;
      const prevItemsMap: Record<string, { qtyKontainerBesar?: number; qtyKontainerKecil?: number }> = {};
      if (latestHistory && Array.isArray(latestHistory.items)) {
        latestHistory.items.forEach((it: any) => {
          if (it.id) prevItemsMap[it.id] = { qtyKontainerBesar: it.after?.qtyKontainerBesar, qtyKontainerKecil: it.after?.qtyKontainerKecil };
          if (it.code) prevItemsMap[it.code] = { qtyKontainerBesar: it.after?.qtyKontainerBesar, qtyKontainerKecil: it.after?.qtyKontainerKecil };
        });
      }

      const historyItems: HistoryItem[] = [];
      (materials as BahanBaku[])?.forEach((it) => {
        // Snapshot stok bahan baku sistem tepat pada saat opname disimpan
        const beforeBulk = Number(it.qtyKontainerBesar ?? 0);
        const beforeAktif = Number(it.qtyKontainerKecil ?? 0);
        const afterBulk = Math.max(0, cleanNumber(bulkInputs[it.id] ?? beforeBulk));
        const inputGrams = kontainerInputs[it.id]?.grams;
        const inputAktif = kontainerInputs[it.id]?.aktif;
        const afterAktif = Math.max(0, cleanNumber(
          (inputGrams !== undefined && inputGrams !== null && String(inputGrams) !== "")
            ? inputGrams
            : ((inputAktif !== undefined && inputAktif !== null && String(inputAktif) !== "")
                ? inputAktif
                : beforeAktif)
        ));

        historyItems.push({
          id: it.id,
          code: it.code,
          nama: it.nama,
          grams: afterAktif,
          before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
          after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif, grams: afterAktif } as any,
        } as any);
      });

      await addDoc(collection(db, "opnam_harian"), {
        date: serverTimestamp(),
        note: "Finalisasi Opnam Harian",
        items: historyItems,
      });
      resetInputs();
      window.alert("Opnam harian berhasil disimpan.");
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
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx, .xls"
            onChange={handleImportExcel}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 sm:h-12 sm:px-6 hover:text-indigo-600"
          >
            <Upload className="mr-2 h-4 w-4 text-indigo-600" /> Impor Excel
          </Button>
          <Button
            variant="outline"
            onClick={resetInputs}
            className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 sm:h-12 sm:px-6"
          >
            <RefreshCcw className="mr-2 h-4 w-4 text-slate-600" /> Bersihkan
          </Button>
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
            filteredMaterials?.map((item) => (
              <Card key={item.id} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.code}</p>
                    <p className="text-base font-black uppercase tracking-tight text-slate-900">{item.nama}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                        Bungkus: {Number(item.beratBungkusProduk || 0).toLocaleString("id-ID")} {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                      </span>
                      <span className="rounded-full bg-primary/5 px-2 py-1 font-semibold text-primary">
                        Total/produk: {Number(item.totalGramasiPerProduk ?? (Number(item.gramPerBesar || 0) + Number(item.beratBungkusProduk || 0))).toLocaleString("id-ID")} {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
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
                  {/* Input Bulk */}
                  <div className="relative">
                    <Input
                      type="number"
                      value={bulkInputs[item.id] !== undefined && bulkInputs[item.id] !== null && !isNaN(Number(bulkInputs[item.id])) ? String(bulkInputs[item.id]) : ""}
                      onChange={(e) => {
                        const val = cleanNumber(e.target.value);
                        setBulkInputs((prev) => ({ ...prev, [item.id]: val }));
                      }}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-11 w-full rounded-2xl border-none bg-slate-50 pr-14 text-center text-base font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-indigo-400">
                      {item.satuanBesar || "Bulk"}
                    </span>
                  </div>

                  {/* Input Aktif Fisik (Murni tanpa potong bungkus) */}
                  <div className="relative">
                    <Input
                      type="number"
                      value={kontainerInputs[item.id]?.grams !== undefined && kontainerInputs[item.id]?.grams !== null && !isNaN(Number(kontainerInputs[item.id]?.grams)) ? String(kontainerInputs[item.id]?.grams) : ""}
                      onChange={(e) => {
                        const gramsVal = cleanNumber(e.target.value);
                        setKontainerInputs((prev) => ({
                          ...prev,
                          [item.id]: {
                            grams: gramsVal,
                            aktif: gramsVal,
                          },
                        }));
                      }}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-11 w-full rounded-2xl border-none bg-slate-50 pr-14 text-center text-base font-black"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-emerald-600">
                      {item.satuanKecil || (item.satuanKalibrasi === "Pcs" ? "pcs" : "g")}
                    </span>
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
              <p className="text-[10px] font-black uppercase tracking-widest sm:text-xs">Simpan Data Fisik Opnam</p>
              <p className="mt-1 max-w-md text-[9px] leading-relaxed text-slate-400 sm:text-[10px]">
                Pastikan semua data fisik stok Bulk dan Aktif telah sesuai sebelum melakukan penyimpanan.
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
          {processing ? "Memproses..." : "Finalisasi & Simpan Opnam Harian"}
        </Button>
      </div>

      {/* HISTORI PENYIMPANAN OPNAM */}
      <Card className="overflow-hidden rounded-[1.25rem] border border-slate-200/80 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                Histori Penyimpanan Opnam Harian
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Riwayat tanggal & waktu sistem menyimpan hasil opname fisik
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider rounded-full bg-slate-100 px-3 py-1 text-slate-600 self-start sm:self-auto">
            {histories ? `${histories.length} Riwayat` : "Memuat..."}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {historyLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs font-bold">
              <RefreshCcw className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-500" />
              Memuat histori opnam...
            </div>
          ) : !histories || histories.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs font-bold">
              Belum ada riwayat penyimpanan opnam harian.
            </div>
          ) : (
            (histories as any[]).slice(0, 10).map((h: any) => {
              const isExpanded = expandedHistoryId === h.id;
              const itemCount = Array.isArray(h.items) ? h.items.length : 0;
              return (
                <div
                  key={h.id || String(h.date?.seconds)}
                  className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:bg-slate-50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-slate-900">
                          <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                          {formatDateOnly(h.date)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600">
                          <Clock className="h-3 w-3 text-indigo-500" />
                          {formatTimeOnly(h.date)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Tersimpan
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-500">
                        {h.note || "Finalisasi Opnam Harian"} â€¢ <span className="text-slate-700 font-black">{itemCount} Bahan Baku</span>
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                      className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:bg-indigo-50 self-start sm:self-auto"
                    >
                      {isExpanded ? (
                        <>Tutup Rincian <ChevronUp className="ml-1 h-3.5 w-3.5" /></>
                      ) : (
                        <>Lihat Rincian <ChevronDown className="ml-1 h-3.5 w-3.5" /></>
                      )}
                    </Button>
                  </div>

                  {isExpanded && Array.isArray(h.items) && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 uppercase font-black">
                            <th className="p-2">Kode</th>
                            <th className="p-2">Nama Bahan</th>
                            <th className="p-2 text-right">Bulk Fisik</th>
                            <th className="p-2 text-right">Aktif Fisik</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-bold text-slate-700">
                          {h.items.map((it: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="p-2 text-indigo-600 font-mono">{it.code || "-"}</td>
                              <td className="p-2 uppercase">{it.nama || "-"}</td>
                              <td className="p-2 text-right text-indigo-600">{it.after?.qtyKontainerBesar ?? "-"}</td>
                              <td className="p-2 text-right text-emerald-600">{it.after?.qtyKontainerKecil ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}