"use client";

import { getStoreConfigDocId, useActiveBranch, filterContainerMaterials, BRANCH_LIST, getBranchTheme, branchCollection, branchDoc } from "@/lib/branch-helper";
import { cn } from "@/lib/utils";

import React, { useState, useMemo } from "react";
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
import { orderBy, query, addDoc, serverTimestamp, writeBatch } from "firebase/firestore";
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
  const activeBranch = useActiveBranch();
  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;
  const theme = getBranchTheme(activeBranch);
  const [searchTerm, setSearchTerm] = useState("");

  const materialsQuery = useMemoFirebase(
    () => query(branchCollection(db, "bahan-baku", activeBranch), orderBy("code", "asc")),
    [db, activeBranch]
  );

  const { data: rawMaterials, loading } = useCollection(materialsQuery);
  const materials = useMemo(() => {
    return filterContainerMaterials(rawMaterials as BahanBaku[], activeBranch);
  }, [rawMaterials, activeBranch]);

  const settingsRef = useMemoFirebase(() => branchDoc(db, "settings", getStoreConfigDocId(activeBranch)), [db, activeBranch]);
  const { data: settings } = useDoc(settingsRef);

  const cleanNumber = (val: unknown): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const [kontainerInputs, setKontainerInputs] = useState<Record<string, string>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const historyQuery = useMemoFirebase(
    () => query(branchCollection(db, "opnam_harian", activeBranch), orderBy("date", "desc")),
    [db, activeBranch]
  );
  const { data: histories, loading: historyLoading } = useCollection(historyQuery);

  const formatDateOnly = (timestamp: unknown) => {
    if (!timestamp) return "-";
    try {
      const ts = timestamp as { toDate?: () => Date } | string | number | Date;
      const date = typeof ts === "object" && ts !== null && "toDate" in ts && typeof ts.toDate === "function"
        ? ts.toDate()
        : new Date(ts as string | number | Date);
      return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch {
      return "-";
    }
  };

  const formatTimeOnly = (timestamp: unknown) => {
    if (!timestamp) return "-";
    try {
      const ts = timestamp as { toDate?: () => Date } | string | number | Date;
      const date = typeof ts === "object" && ts !== null && "toDate" in ts && typeof ts.toDate === "function"
        ? ts.toDate()
        : new Date(ts as string | number | Date);
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
        const excelData = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        if (!excelData || excelData.length === 0) {
          window.alert("Berkas Excel kosong atau format tidak sesuai.");
          return;
        }

        const newBulkInputs: Record<string, string> = { ...bulkInputs };
        const newKontainerInputs: Record<string, string> = { ...kontainerInputs };
        const allMaterials = (materials as BahanBaku[]) || [];

        let matchedCount = 0;

        const cleanStr = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        const getRowVal = (row: Record<string, unknown>, primaryKeywords: string[], secondaryKeywords: string[] = []): unknown => {
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

        excelData.forEach((row: Record<string, unknown>) => {
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
            newBulkInputs[mat.id] = String(bulkValRaw);
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
            newKontainerInputs[mat.id] = String(gramsValRaw);
          } else if (aktifValRaw !== undefined) {
            newKontainerInputs[mat.id] = String(aktifValRaw);
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
    const wsData = filteredMaterials?.map((item) => {
      const hasBulk = item.id in bulkInputs && String(bulkInputs[item.id]).trim() !== "";
      const hasAktif = item.id in kontainerInputs && String(kontainerInputs[item.id]).trim() !== "";

      const realBulk = hasBulk ? Math.max(0, cleanNumber(bulkInputs[item.id])) : 0;
      const realAktif = hasAktif ? Math.max(0, cleanNumber(kontainerInputs[item.id])) : 0;

      return {
        Kode: item.code,
        "Nama Bahan": item.nama,
        "Stok Gudang (Sistem)": item.qtyBesar || 0,
        "Satuan Besar": item.satuanBesar,
        "Bulk Kontainer (Sistem)": item.qtyKontainerBesar || 0,
        "Aktif Kontainer (Sistem)": item.qtyKontainerKecil || 0,
        "Hasil Opnam Bulk (Real)": realBulk,
        "Hasil Opnam Aktif (Real)": realAktif,
        "Satuan Kecil": item.satuanKecil,
        "Total Keseluruhan": formatTotalStock(item),
      };
    });

    const ws = XLSX.utils.json_to_sheet(wsData || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Opname");
    XLSX.writeFile(wb, `Stock_Opname_${branchInfo.shortName}_${new Date().toLocaleDateString()}.xlsx`);
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
    docPDF.text(settings?.name?.toUpperCase() || `ZONA WAKTU • ${branchInfo.shortName.toUpperCase()}`, 148, 15, { align: "center" });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || `Outlet ${branchInfo.name}`, 148, 21, { align: "center" });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 282, 28);

    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text(`LAPORAN STOCK OPNAME • ${branchInfo.shortName.toUpperCase()}`, 148, 40, { align: "center" });
    docPDF.setFontSize(10);
    docPDF.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, 148, 46, { align: "center" });

    const tableData = filteredMaterials?.map((item) => {
      const hasBulk = item.id in bulkInputs && String(bulkInputs[item.id]).trim() !== "";
      const hasAktif = item.id in kontainerInputs && String(kontainerInputs[item.id]).trim() !== "";

      const realBulk = hasBulk ? Math.max(0, cleanNumber(bulkInputs[item.id])) : 0;
      const realAktif = hasAktif ? Math.max(0, cleanNumber(kontainerInputs[item.id])) : 0;

      return [
        item.code,
        item.nama.toUpperCase(),
        `${item.qtyBesar || 0} ${item.satuanBesar}`,
        `${item.qtyKontainerBesar || 0} ${item.satuanBesar}`,
        `${Math.round(item.qtyKontainerKecil || 0)} ${item.satuanKecil}`,
        `${realBulk} ${item.satuanBesar}`,
        `${Math.round(realAktif)} ${item.satuanKecil}`,
        formatTotalStock(item),
      ];
    });

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG", "KONT. BULK (SIS)", "KONT. AKTIF (SIS)", "OPNAM BULK (REAL)", "OPNAM AKTIF (REAL)", "TOTAL SISTEM"]],
      body: tableData || [],
      startY: 55,
      theme: "grid",
      headStyles: { fillColor: [139, 26, 26] },
      styles: { fontSize: 7.5 },
    });

    docPDF.save(`Stock_Opname_${branchInfo.shortName}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const finalizeAll = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: Array<{
        id: string;
        code: string;
        nama: string;
        unitBesar: string;
        unitKecil: string;
        before: { qtyKontainerBesar: number; qtyKontainerKecil: number };
        after: { qtyKontainerBesar: number; qtyKontainerKecil: number; grams: number };
        afterBulk: number;
        afterAktif: number;
        diffBulk: number;
        diffAktif: number;
        grams: number;
      }> = [];

      (materials as BahanBaku[])?.forEach((it) => {
        const beforeBulk = Number(it.qtyKontainerBesar ?? 0);
        const beforeAktif = Number(it.qtyKontainerKecil ?? 0);

        const hasBulkInput = it.id in bulkInputs && String(bulkInputs[it.id]).trim() !== "";
        const hasAktifInput = it.id in kontainerInputs && String(kontainerInputs[it.id]).trim() !== "";

        // Ketika bahan tidak di-input di stock opname harian, hasilnya pasti 0 untuk Bulk Fisik maupun Aktif Fisik
        const afterBulk = hasBulkInput ? Math.max(0, cleanNumber(bulkInputs[it.id])) : 0;
        const afterAktif = hasAktifInput ? Math.max(0, cleanNumber(kontainerInputs[it.id])) : 0;

        // 1. UPDATE REAL STOK KE MASTER BAHAN BAKU FIRESTORE
        const ref = branchDoc(db, "bahan-baku", it.id, activeBranch);
        batch.update(ref, {
          qtyKontainerBesar: afterBulk,
          qtyKontainerKecil: afterAktif,
        });

        // 2. CATAT KE HISTORI OPNAM HARIAN DENGAN DETAIL LENGKAP
        historyItems.push({
          id: it.id,
          code: it.code || "-",
          nama: it.nama || "-",
          unitBesar: it.satuanBesar || "Bulk",
          unitKecil: it.satuanKecil || (it.satuanKalibrasi === "Pcs" ? "pcs" : "g"),
          before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
          after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif, grams: afterAktif },
          afterBulk,
          afterAktif,
          diffBulk: afterBulk - beforeBulk,
          diffAktif: afterAktif - beforeAktif,
          grams: afterAktif,
        });
      });

      // Commit update stok bahan baku
      await batch.commit();

      // Simpan catatan opnam harian ke koleksi opnam_harian cabang aktif
      await addDoc(branchCollection(db, "opnam_harian", activeBranch), {
        date: serverTimestamp(),
        branch: activeBranch,
        _branchId: activeBranch,
        branchName: branchInfo.name,
        note: `Opnam Harian Kontainer (${branchInfo.shortName})`,
        items: historyItems,
      });

      resetInputs();
      window.alert(`Opnam harian ${branchInfo.shortName} berhasil difinalisasi dan stok sistem telah diperbarui sesuai hasil input real.`);
    } catch (err) {
      console.error(err);
      window.alert("Terjadi kesalahan saat finalisasi opnam harian. Cek console.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 sm:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border", theme.badgeClass)}>
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1", theme.dotColor)} />
              {branchInfo.shortName}
            </span>
          </div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 sm:text-3xl">
            {title} &bull; {branchInfo.shortName}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 sm:text-xs">
            {subtitle} &bull; {branchInfo.name}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-2 w-full md:w-auto">
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
            className="h-9 sm:h-12 rounded-xl sm:rounded-2xl border-slate-200 bg-white px-1 sm:px-5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 hover:text-indigo-600 shadow-sm flex items-center justify-center gap-1 sm:gap-2"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <span className="truncate sm:hidden">Impor</span>
            <span className="hidden sm:inline">Impor Excel</span>
          </Button>
          <Button
            variant="outline"
            onClick={resetInputs}
            className="h-9 sm:h-12 rounded-xl sm:rounded-2xl border-slate-200 bg-white px-1 sm:px-5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1 sm:gap-2"
          >
            <RefreshCcw className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <span className="truncate">Bersihkan</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="h-9 sm:h-12 rounded-xl sm:rounded-2xl border-slate-200 bg-white px-1 sm:px-5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1 sm:gap-2"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Excel</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            className="h-9 sm:h-12 rounded-xl sm:rounded-2xl border-slate-200 bg-white px-1 sm:px-5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1 sm:gap-2"
          >
            <FileDown className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">PDF</span>
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
                      value={bulkInputs[item.id] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBulkInputs((prev) => ({ ...prev, [item.id]: raw }));
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
                      value={kontainerInputs[item.id] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setKontainerInputs((prev) => ({ ...prev, [item.id]: raw }));
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
          className={cn("mt-3 h-12 w-full rounded-2xl px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-xl sm:h-14 sm:px-10 sm:text-[11px] md:w-auto", theme.buttonGradient)}
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
            (histories as Array<Record<string, unknown>>).slice(0, 10).map((h) => {
              const isExpanded = expandedHistoryId === (h.id as string);
              const itemsList = Array.isArray(h.items) ? (h.items as Array<Record<string, unknown>>) : [];
              const itemCount = itemsList.length;
              return (
                <div
                  key={(h.id as string) || String((h.date as { seconds?: number })?.seconds)}
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
                        {String(h.note || "Finalisasi Opnam Harian")} • <span className="text-slate-700 font-black">{itemCount} Bahan Baku</span>
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedHistoryId(isExpanded ? null : (h.id as string))}
                      className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:bg-indigo-50 self-start sm:self-auto"
                    >
                      {isExpanded ? (
                        <>Tutup Rincian <ChevronUp className="ml-1 h-3.5 w-3.5" /></>
                      ) : (
                        <>Lihat Rincian <ChevronDown className="ml-1 h-3.5 w-3.5" /></>
                      )}
                    </Button>
                  </div>

                  {isExpanded && itemsList.length > 0 && (
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
                          {itemsList.map((it, idx: number) => {
                            const afterObj = it.after as Record<string, unknown> | undefined;
                            const bulkVal = afterObj?.qtyKontainerBesar !== undefined
                              ? Number(afterObj.qtyKontainerBesar)
                              : it.afterBulk !== undefined
                              ? Number(it.afterBulk)
                              : null;
                            const aktifVal = afterObj?.qtyKontainerKecil !== undefined
                              ? Number(afterObj.qtyKontainerKecil)
                              : it.grams !== undefined
                              ? Number(it.grams)
                              : it.afterAktif !== undefined
                              ? Number(it.afterAktif)
                              : null;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                <td className="p-2 text-indigo-600 font-mono">{String(it.code || "-")}</td>
                                <td className="p-2 uppercase">{String(it.nama || "-")}</td>
                                <td className="p-2 text-right text-indigo-600">
                                  {bulkVal !== null ? `${bulkVal} ${String(it.unitBesar || "")}`.trim() : "-"}
                                </td>
                                <td className="p-2 text-right text-emerald-600">
                                  {aktifVal !== null ? `${aktifVal} ${String(it.unitKecil || "")}`.trim() : "-"}
                                </td>
                              </tr>
                            );
                          })}
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