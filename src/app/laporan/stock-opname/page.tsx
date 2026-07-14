"use client";

import React, { useMemo, useState } from "react";
import {
  Archive,
  Box,
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  Layers,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection, useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, orderBy, query } from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

// --- Types ---
interface FirestoreTimestamp {
  toDate?: () => Date;
  seconds?: number;
}

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyBesar?: number | string;
  qtyKontainerBesar?: number | string;
  qtyKontainerKecil?: number | string;
  [key: string]: unknown;
}

interface RawOpnameItem {
  id?: string;
  code?: string;
  nama?: string;
  unitBesar?: string;
  beforeQtyBesar?: number;
  afterQtyBesar?: number;
  diffQtyBesar?: number;
  before?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  after?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  [key: string]: unknown;
}

interface RawOpnameEntry {
  id: string;
  date?: FirestoreTimestamp | Date | string;
  note?: string;
  items?: RawOpnameItem[];
  [key: string]: unknown;
}

interface EnrichedContainerItem extends RawOpnameItem {
  beforeBulk: number;
  beforeAktif: number;
  afterBulk: number;
  afterAktif: number;
  diffBulk: number;
  diffAktif: number;
  unitBulk: string;
  unitAktif: string;
}

interface EnrichedContainerEntry extends RawOpnameEntry {
  entryDate: Date | null;
  items: EnrichedContainerItem[];
}

interface EnrichedWarehouseItem extends RawOpnameItem {
  beforeQtyBesar: number;
  afterQtyBesar: number;
  diffQtyBesar: number;
  unitBesar: string;
}

interface EnrichedWarehouseEntry extends RawOpnameEntry {
  entryDate: Date | null;
  items: EnrichedWarehouseItem[];
}

const formatNumber = (value: number | string | undefined) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("id-ID").format(num);
};

const formatCombinedDifference = (item: EnrichedContainerItem) => {
  const diffBulk = Number(item?.diffBulk || 0);
  const diffAktif = Number(item?.diffAktif || 0);
  const totalDiff = diffBulk + diffAktif;

  if (totalDiff === 0) {
    return "0";
  }

  const parts: string[] = [];
  if (diffBulk !== 0) {
    parts.push(`${formatNumber(diffBulk)} ${item?.unitBulk || ""}`.trim());
  }
  if (diffAktif !== 0) {
    parts.push(`${formatNumber(diffAktif)} ${item?.unitAktif || ""}`.trim());
  }

  return parts.join(" ");
};

const toDateValue = (value: FirestoreTimestamp | Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  return new Date(value);
};

const formatDateLabel = (value: FirestoreTimestamp | Date | string | null | undefined) => {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getMonthKey = (value: FirestoreTimestamp | Date | string | null | undefined) => {
  const date = toDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export default function LaporanStockOpnamePage() {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [opnameSource, setOpnameSource] = useState<"karyawan" | "admin">("karyawan");

  const materialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db]
  );
  const { data: materials, loading: loadingMaterials } = useCollection(materialsQuery);

  const historyQuery = useMemoFirebase(
    () => query(collection(db, "opnam_harian"), orderBy("date", "desc")),
    [db]
  );
  const { data: opnameHistory, loading: loadingHistory } = useCollection(historyQuery);

  const warehouseHistoryQuery = useMemoFirebase(
    () => query(collection(db, "opnam_gudang"), orderBy("date", "desc")),
    [db]
  );
  const { data: warehouseHistory, loading: loadingWarehouseHistory } = useCollection(warehouseHistoryQuery);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const filteredMaterials = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (materials as BahanBaku[])?.filter((item) => {
      return (
        item.nama?.toLowerCase().includes(term) ||
        item.code?.toLowerCase().includes(term)
      );
    }) || [];
  }, [materials, searchTerm]);

  const materialMap = useMemo(() => {
    const map: Record<string, BahanBaku> = {};
    (materials as BahanBaku[])?.forEach((material) => {
      if (material?.id) map[material.id] = material;
      if (material?.code) map[material.code] = material;
    });
    return map;
  }, [materials]);

  const filteredContainerEntries = useMemo((): EnrichedContainerEntry[] => {
    return (opnameHistory as RawOpnameEntry[])
      ?.map((entry) => ({
        ...entry,
        entryDate: toDateValue(entry.date),
        items: (entry.items || []).map((item): EnrichedContainerItem => {
          const material = materialMap[item.id ?? ""] || materialMap[item.code ?? ""] || null;
          return {
            ...item,
            beforeBulk: Number(item.before?.qtyKontainerBesar || 0),
            beforeAktif: Number(item.before?.qtyKontainerKecil || 0),
            afterBulk: Number(item.after?.qtyKontainerBesar || 0),
            afterAktif: Number(item.after?.qtyKontainerKecil || 0),
            diffBulk: Number(item.after?.qtyKontainerBesar || 0) - Number(item.before?.qtyKontainerBesar || 0),
            diffAktif: Number(item.after?.qtyKontainerKecil || 0) - Number(item.before?.qtyKontainerKecil || 0),
            unitBulk: material?.satuanBesar ?? "",
            unitAktif: material?.satuanKecil ?? "",
          };
        }),
      }))
      .filter((entry) => {
        const isCreatedByAdmin = entry.note?.toLowerCase().includes("admin");
        if (opnameSource === "admin" && !isCreatedByAdmin) return false;
        if (opnameSource === "karyawan" && isCreatedByAdmin) return false;

        const date = entry.entryDate;
        if (selectedDate) {
          return date && date.toISOString().split("T")[0] === selectedDate;
        }
        if (selectedMonth) {
          return date && getMonthKey(date) === selectedMonth;
        }
        return true;
      }) || [];
  }, [opnameHistory, selectedDate, selectedMonth, materialMap, opnameSource]);

  const filteredWarehouseEntries = useMemo((): EnrichedWarehouseEntry[] => {
    return (warehouseHistory as RawOpnameEntry[])
      ?.map((entry) => ({
        ...entry,
        entryDate: toDateValue(entry.date),
        items: (entry.items || []).map((item): EnrichedWarehouseItem => {
          return {
            ...item,
            beforeQtyBesar: Number(item.beforeQtyBesar || 0),
            afterQtyBesar: Number(item.afterQtyBesar || 0),
            diffQtyBesar: Number(item.diffQtyBesar || 0),
            unitBesar: item.unitBesar || "",
          };
        }),
      }))
      .filter((entry) => {
        const isCreatedByAdmin = entry.note?.toLowerCase().includes("admin");
        if (opnameSource === "admin" && !isCreatedByAdmin) return false;
        if (opnameSource === "karyawan" && isCreatedByAdmin) return false;

        const date = entry.entryDate;
        if (selectedDate) {
          return date && date.toISOString().split("T")[0] === selectedDate;
        }
        if (selectedMonth) {
          return date && getMonthKey(date) === selectedMonth;
        }
        return true;
      }) || [];
  }, [warehouseHistory, selectedDate, selectedMonth, opnameSource]);

  const warehouseRows = useMemo(() => {
    return filteredMaterials.map((item) => ({
      id: item.id,
      code: item.code,
      nama: item.nama,
      qtyBesar: Number(item.qtyBesar || 0),
      satuanBesar: item.satuanBesar || "",
      qtyKontainerBesar: Number(item.qtyKontainerBesar || 0),
      qtyKontainerKecil: Number(item.qtyKontainerKecil || 0),
      satuanKecil: item.satuanKecil || "",
      total: Number(item.qtyBesar || 0) + Number(item.qtyKontainerBesar || 0),
    }));
  }, [filteredMaterials]);

  const resetFilters = () => {
    setSelectedDate("");
    setSelectedMonth("");
  };

  const handleExportExcel = () => {
    const warehouseRowsExport = filteredWarehouseEntries.flatMap((entry) =>
      (entry.items || []).map((item) => ({
        tanggal: formatDateLabel(entry.entryDate),
        kode: item.code,
        nama: item.nama,
        sebelum: item.beforeQtyBesar,
        sesudah: item.afterQtyBesar,
        selisih: `${item.diffQtyBesar >= 0 ? `+${item.diffQtyBesar}` : item.diffQtyBesar} ${item.unitBesar || ""}`.trim()
      }))
    );
    if (warehouseRowsExport.length === 0) {
      warehouseRowsExport.push({
        tanggal: "-",
        kode: "-",
        nama: "Belum ada data stock opname gudang",
        sebelum: 0,
        sesudah: 0,
        selisih: "-"
      };
    }

    const containerRowsExport = filteredContainerEntries.flatMap((entry) =>
      (entry.items || []).map((item) => ({
        tanggal: formatDateLabel(entry.entryDate),
        kode: item.code,
        nama: item.nama,
        sebelumBulk: item.beforeBulk,
        satuanBulk: item.unitBulk || "-",
        sebelumAktif: item.beforeAktif,
        satuanAktif: item.unitAktif || "-",
        sesudahBulk: item.afterBulk,
        sesudahAktif: item.afterAktif,
        selisih: formatCombinedDifference(item),
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warehouseRowsExport), "Gudang");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(containerRowsExport), "Kontainer");
    XLSX.writeFile(wb, `Laporan_Stock_Opname_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF("p", "mm", "a4");

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

    docPDF.setFontSize(16);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("LAPORAN STOCK OPNAME", 105, 20, { align: "center" });
    docPDF.setFontSize(10);
    docPDF.text(`Periode: ${selectedDate || selectedMonth || "Semua"}`, 105, 28, { align: "center" });
    docPDF.setDrawColor(203, 213, 225);
    docPDF.line(15, 34, 195, 34);

    docPDF.setFontSize(12);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("Stock Opname Gudang", 15, 42);

    const warehouseRowsPDF = filteredWarehouseEntries.flatMap((entry) =>
      (entry.items || []).map((item) => [
        formatDateLabel(entry.entryDate),
        item.code,
        item.nama,
        `${item.beforeQtyBesar} ${item.unitBesar || ""}`,
        `${item.afterQtyBesar} ${item.unitBesar || ""}`,
        `${item.diffQtyBesar >= 0 ? `+${item.diffQtyBesar}` : item.diffQtyBesar} ${item.unitBesar || ""}`
      ])
    );

    let startY = 48;
    if (warehouseRowsPDF.length > 0) {
      autoTable(docPDF, {
        head: [["Tanggal", "Kode", "Nama", "Sebelum", "Sesudah", "Selisih"]],
        body: warehouseRowsPDF,
        startY: startY,
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      startY = (docPDF as any).lastAutoTable.finalY + 12;
    } else {
      docPDF.setFontSize(9);
      docPDF.text("Belum ada data stock opname gudang untuk periode ini.", 15, startY + 4);
      startY += 12;
    }

    docPDF.setFontSize(12);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("Stock Opname Kontainer", 15, startY);

    autoTable(docPDF, {
      head: [["Tanggal", "Kode", "Nama", "Sebelum Bulk", "Sebelum Aktif", "Sesudah Bulk", "Sesudah Aktif", "Selisih"]],
      body: filteredContainerEntries.flatMap((entry) =>
        (entry.items || []).map((item) => [
          formatDateLabel(entry.entryDate),
          item.code,
          item.nama,
          `${item.beforeBulk} ${item.unitBulk || "-"}`,
          `${item.beforeAktif} ${item.unitAktif || "-"}`,
          `${item.afterBulk} ${item.unitBulk || "-"}`,
          `${item.afterAktif} ${item.unitAktif || "-"}`,
          formatCombinedDifference(item),
        ])
      ),
      startY: startY + 4,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });

    docPDF.save(`Laporan_Stock_Opname_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900 md:text-4xl">
            Laporan Stock Opnam
          </h1>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 md:text-xs">
            Rekap stok gudang dan hasil opname kontainer dari input harian karyawan
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"
          >
            <FileDown className="mr-2 h-4 w-4 text-primary" /> PDF
          </Button>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              Pilih Tanggal
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedMonth("");
              }}
              className="h-10 w-full min-w-[150px] rounded-xl border-none bg-slate-50 text-xs"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              Pilih Bulan
            </label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setSelectedDate("");
              }}
              className="h-10 w-full min-w-[150px] rounded-xl border-none bg-slate-50 text-xs"
            />
          </div>
          <Button
            variant="outline"
            onClick={resetFilters}
            className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest"
          >
            Reset Filter
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setOpnameSource("karyawan")}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              opnameSource === "karyawan" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Karyawan (Harian)
          </button>
          <button
            onClick={() => setOpnameSource("admin")}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              opnameSource === "admin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Admin (Berkala)
          </button>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Menampilkan data opname dari: <span className="text-slate-800 font-black">{opnameSource === "admin" ? "Admin" : "Karyawan"}</span>
        </p>
      </div>

      <Tabs defaultValue="kontainer" className="w-full">
        <TabsList className="mb-6 grid h-14 w-full max-w-2xl grid-cols-2 rounded-[2rem] border border-slate-100 bg-white p-2 shadow-sm">
          <TabsTrigger value="kontainer" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Layers className="mr-2 h-4 w-4" /> Stock Opname Kontainer
          </TabsTrigger>
          <TabsTrigger value="gudang" className="rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">
            <Archive className="mr-2 h-4 w-4" /> Stock Opname Gudang
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kontainer" className="space-y-4">
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">Stok Kontainer</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rekap hasil input opname harian karyawan
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {selectedDate ? `Tanggal: ${selectedDate}` : selectedMonth ? `Bulan: ${selectedMonth}` : "Semua periode"}
                </div>
              </div>
            </div>

            {loadingHistory ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                Memuat data opname kontainer...
              </div>
            ) : filteredContainerEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada data stock opname kontainer untuk filter ini.
              </div>
            ) : (
              <div className="space-y-4 p-4 md:p-6">
                {filteredContainerEntries.map((entry) => (
                  <div key={entry.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          Tanggal Opname
                        </p>
                        <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                      </div>
                      {entry.note && (
                        <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          {entry.note}
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left">
                        <thead className="bg-white/80">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sebelum Bulk</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sebelum Aktif</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sesudah Bulk</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sesudah Aktif</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.items.map((item) => (
                            <tr key={`${entry.id}-${item.id}`} className="border-t border-slate-100 bg-white/70">
                              <td className="px-3 py-3 text-sm font-black text-slate-700">{item.code}</td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-900">{item.nama}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.beforeBulk)} {item.unitBulk || ""}
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.beforeAktif)} {item.unitAktif || ""}
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.afterBulk)} {item.unitBulk || ""}
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.afterAktif)} {item.unitAktif || ""}
                              </td>
                              <td className={`px-3 py-3 text-right text-sm font-black ${item.diffBulk + item.diffAktif >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                <div className="flex items-center justify-end gap-1">
                                  {item.diffBulk + item.diffAktif >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                  {formatCombinedDifference(item)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gudang" className="space-y-4">
          <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <Box className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">Stok Gudang</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Data stok gudang sistem per bahan baku
                  </p>
                </div>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari bahan..."
                  className="w-full rounded-2xl border-none bg-white py-3 pl-12 pr-4 text-xs font-bold shadow-sm outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {loadingWarehouseHistory ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                  Memuat data opname gudang...
                </div>
              ) : filteredWarehouseEntries.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Belum ada hasil stock opname gudang untuk periode ini. Silakan lakukan stock opname gudang terlebih dahulu.
                </div>
              ) : (
                <div className="space-y-4 p-4 md:p-6">
                  {filteredWarehouseEntries.map((entry) => (
                    <div key={entry.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
                      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Tanggal Opname Gudang
                          </p>
                          <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                        </div>
                        {entry.note && (
                          <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                            {entry.note}
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left bg-white rounded-xl border border-slate-50">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Stok Sebelum</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Stok Sesudah</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Selisih</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {entry.items.map((item) => (
                              <tr key={`${entry.id}-${item.id}`} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-sm font-black text-slate-700">{item.code}</td>
                                <td className="px-4 py-3 text-sm font-bold text-slate-900 uppercase italic">{item.nama}</td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                  {formatNumber(item.beforeQtyBesar)} {item.unitBesar || ""}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                  {formatNumber(item.afterQtyBesar)} {item.unitBesar || ""}
                                </td>
                                <td className={`px-4 py-3 text-right text-sm font-black ${item.diffQtyBesar >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  <div className="flex items-center justify-end gap-1">
                                    {item.diffQtyBesar >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                    {item.diffQtyBesar >= 0 ? `+${item.diffQtyBesar}` : item.diffQtyBesar} {item.unitBesar || ""}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
