"use client";

import React, { useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  Layers,
  RefreshCcw,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCollection, useDoc, useFirestore, useMemoFirebase, collection, doc } from "@/firebase";
import { getStoreConfigDocId } from "@/lib/branch-helper";
import { orderBy, query, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
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
  grams?: number | string;
  before?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number };
  after?: { qtyKontainerBesar?: number; qtyKontainerKecil?: number; grams?: number | string };
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

const cleanNumber = (val: unknown): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const str = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

const formatNumber = (value: number | string | undefined) => {
  const num = cleanNumber(value);
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

const toDateValue = (value: FirestoreTimestamp | Date | string | number | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "object" && "seconds" in value && typeof (value as { seconds: number }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [opnameSource, setOpnameSource] = useState<"karyawan" | "admin">("karyawan");

  const [isUpdateStockOpen, setIsUpdateStockOpen] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [updateSearchTerm, setUpdateSearchTerm] = useState("");

  const materialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db]
  );
  const { data: materials } = useCollection(materialsQuery);

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

  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);



  const materialMap = useMemo(() => {
    const map: Record<string, BahanBaku> = {};
    (materials as BahanBaku[])?.forEach((material) => {
      if (material?.id) map[material.id] = material;
      if (material?.code) {
        map[material.code] = material;
        map[material.code.trim().toLowerCase()] = material;
      }
      if (material?.nama) {
        map[material.nama.trim().toLowerCase()] = material;
      }
    });
    return map;
  }, [materials]);

  const allContainerEntries = useMemo((): EnrichedContainerEntry[] => {
    const rawList = (opnameHistory as RawOpnameEntry[]) || [];
    return rawList
      ?.map((entry) => {
        return {
          ...entry,
          entryDate: toDateValue(entry.date),
          items: (entry.items || []).map((item): EnrichedContainerItem => {
            const material = materialMap[item.id ?? ""] || 
                             materialMap[String(item.code ?? "").trim().toLowerCase()] || 
                             materialMap[String(item.nama ?? "").trim().toLowerCase()] || 
                             null;

            // Stok bahan baku pada waktu/jam stock opname disimpan (Snapshot waktu opname, bukan realtime)
            const snapshotStockBulk = cleanNumber(item.before?.qtyKontainerBesar ?? material?.qtyKontainerBesar);
            const snapshotStockAktif = cleanNumber(item.before?.qtyKontainerKecil ?? material?.qtyKontainerKecil);

            // Hasil opname fisik pada waktu tersebut
            const opnameBulk = cleanNumber(item.after?.qtyKontainerBesar ?? item.before?.qtyKontainerBesar);

            let opnameAktif = 0;
            if (item.grams !== undefined && item.grams !== null) {
              opnameAktif = Math.max(0, cleanNumber(item.grams));
            } else if (item.after?.grams !== undefined && item.after?.grams !== null) {
              opnameAktif = Math.max(0, cleanNumber(item.after.grams));
            } else {
              // Pemulihan riwayat: jika angka tersimpan negatif (seperti 0 - 800 = -800) atau terpotong berat bungkus
              const rawSaved = cleanNumber(item.after?.qtyKontainerKecil ?? item.before?.qtyKontainerKecil);
              const beratBungkus = cleanNumber(material?.beratBungkusProduk);
              if (rawSaved < 0) {
                // Contoh rawSaved = -800 ml karena 0 - 800 di sistem lama, kembalikan ke 0
                opnameAktif = Math.max(0, rawSaved + beratBungkus);
              } else if (rawSaved === 0) {
                opnameAktif = 0;
              } else {
                opnameAktif = Math.max(0, rawSaved + beratBungkus);
              }
            }

            return {
              ...item,
              beforeBulk: snapshotStockBulk,
              beforeAktif: snapshotStockAktif,
              afterBulk: opnameBulk,
              afterAktif: opnameAktif,
              diffBulk: opnameBulk - snapshotStockBulk,
              diffAktif: opnameAktif - snapshotStockAktif,
              unitBulk: material?.satuanBesar ?? "",
              unitAktif: material?.satuanKecil ?? "",
            };
          }),
        };
      })
      .filter((entry) => {
        const noteStr = typeof entry.note === "string" ? entry.note : "";
        const isCreatedByAdmin = noteStr.toLowerCase().includes("admin");
        if (opnameSource === "admin" && !isCreatedByAdmin) return false;
        if (opnameSource === "karyawan" && isCreatedByAdmin) return false;
        return true;
      }) || [];
  }, [opnameHistory, materialMap, opnameSource]);

  const filteredContainerEntries = useMemo((): EnrichedContainerEntry[] => {
    if (selectedDate) {
      return allContainerEntries.filter((entry) => {
        const date = entry.entryDate;
        return date && date.toISOString().split("T")[0] === selectedDate;
      });
    }
    if (selectedMonth) {
      return allContainerEntries.filter((entry) => {
        const date = entry.entryDate;
        return date && getMonthKey(date) === selectedMonth;
      });
    }
    // Jika belum difilter, cukup tampilkan 1 riwayat opname terakhir
    return allContainerEntries.slice(0, 1);
  }, [allContainerEntries, selectedDate, selectedMonth]);

  const allWarehouseEntries = useMemo((): EnrichedWarehouseEntry[] => {
    const rawList = (warehouseHistory as RawOpnameEntry[]) || [];
    return rawList
      ?.map((entry, index) => {
        const prevEntry = rawList.slice(index + 1).find((e) => {
          const currNote = typeof entry.note === "string" ? entry.note : "";
          const prevNote = typeof e.note === "string" ? e.note : "";
          const isCurrAdmin = currNote.toLowerCase().includes("admin");
          const isPrevAdmin = prevNote.toLowerCase().includes("admin");
          return isCurrAdmin === isPrevAdmin;
        });

        const prevItemsMap: Record<string, number> = {};
        if (prevEntry && Array.isArray(prevEntry.items)) {
          prevEntry.items.forEach((pItem) => {
            const val = Number(pItem.afterQtyBesar ?? pItem.beforeQtyBesar ?? 0);
            if (pItem.id) prevItemsMap[pItem.id] = val;
            if (pItem.code) prevItemsMap[pItem.code] = val;
          });
        }

        return {
          ...entry,
          entryDate: toDateValue(entry.date),
          items: (entry.items || []).map((item): EnrichedWarehouseItem => {
            const prevVal = prevItemsMap[item.id ?? ""] ?? prevItemsMap[item.code ?? ""];
            const beforeQtyBesar = prevVal !== undefined ? Number(prevVal) : Number(item.beforeQtyBesar || 0);
            const afterQtyBesar = Number(item.afterQtyBesar || 0);
            return {
              ...item,
              beforeQtyBesar,
              afterQtyBesar,
              diffQtyBesar: afterQtyBesar - beforeQtyBesar,
              unitBesar: item.unitBesar || "",
            };
          }),
        };
      })
      .filter((entry) => {
        const noteStr = typeof entry.note === "string" ? entry.note : "";
        const isCreatedByAdmin = noteStr.toLowerCase().includes("admin");
        if (opnameSource === "admin" && !isCreatedByAdmin) return false;
        if (opnameSource === "karyawan" && isCreatedByAdmin) return false;
        return true;
      }) || [];
  }, [warehouseHistory, opnameSource]);

  const filteredWarehouseEntries = useMemo((): EnrichedWarehouseEntry[] => {
    if (selectedDate) {
      return allWarehouseEntries.filter((entry) => {
        const date = entry.entryDate;
        return date && date.toISOString().split("T")[0] === selectedDate;
      });
    }
    if (selectedMonth) {
      return allWarehouseEntries.filter((entry) => {
        const date = entry.entryDate;
        return date && getMonthKey(date) === selectedMonth;
      });
    }
    // Jika belum difilter, cukup tampilkan 1 riwayat opname terakhir
    return allWarehouseEntries.slice(0, 1);
  }, [allWarehouseEntries, selectedDate, selectedMonth]);



  const resetFilters = () => {
    setSelectedDate("");
    setSelectedMonth("");
  };

  // Latest Opname entries for syncing Master Bahan Baku
  const latestContainerEntry = useMemo(() => {
    return allContainerEntries[0] || null;
  }, [allContainerEntries]);

  const latestWarehouseEntry = useMemo(() => {
    return allWarehouseEntries[0] || null;
  }, [allWarehouseEntries]);

  const pendingStockUpdates = useMemo(() => {
    const map: Record<string, {
      id: string;
      code: string;
      nama: string;
      unitBulk: string;
      unitAktif: string;
      unitBesar: string;
      currentBulkKontainer: number;
      currentAktifKontainer: number;
      currentGudang: number;
      targetBulkKontainer?: number;
      targetAktifKontainer?: number;
      targetGudang?: number;
      hasContainerChange?: boolean;
      hasWarehouseChange?: boolean;
    }> = {};

    // 1. From latest container opname
    if (latestContainerEntry?.items) {
      latestContainerEntry.items.forEach((item) => {
        const mat = materialMap[item.id ?? ""] || 
                     materialMap[String(item.code ?? "").trim().toLowerCase()] || 
                     materialMap[String(item.nama ?? "").trim().toLowerCase()];
        const matId = mat?.id || item.id || item.code || "";
        if (!matId) return;

        if (!map[matId]) {
          map[matId] = {
            id: mat?.id || matId,
            code: item.code || mat?.code || "-",
            nama: item.nama || mat?.nama || "-",
            unitBulk: item.unitBulk || mat?.satuanBesar || "",
            unitAktif: item.unitAktif || mat?.satuanKecil || "",
            unitBesar: mat?.satuanBesar || item.unitBulk || "",
            currentBulkKontainer: cleanNumber(mat?.qtyKontainerBesar),
            currentAktifKontainer: cleanNumber(mat?.qtyKontainerKecil),
            currentGudang: cleanNumber(mat?.qtyBesar),
          };
        }

        const targetBulk = Math.max(0, Math.floor(cleanNumber(item.afterBulk)));
        const targetAktif = Math.max(0, cleanNumber(item.afterAktif));
        map[matId].targetBulkKontainer = targetBulk;
        map[matId].targetAktifKontainer = targetAktif;
        map[matId].hasContainerChange = targetBulk !== map[matId].currentBulkKontainer || targetAktif !== map[matId].currentAktifKontainer;
      });
    }

    // 2. From latest warehouse opname
    if (latestWarehouseEntry?.items) {
      latestWarehouseEntry.items.forEach((item) => {
        const mat = materialMap[item.id ?? ""] || 
                     materialMap[String(item.code ?? "").trim().toLowerCase()] || 
                     materialMap[String(item.nama ?? "").trim().toLowerCase()];
        const matId = mat?.id || item.id || item.code || "";
        if (!matId) return;

        if (!map[matId]) {
          map[matId] = {
            id: mat?.id || matId,
            code: item.code || mat?.code || "-",
            nama: item.nama || mat?.nama || "-",
            unitBulk: mat?.satuanBesar || "",
            unitAktif: mat?.satuanKecil || "",
            unitBesar: item.unitBesar || mat?.satuanBesar || "",
            currentBulkKontainer: cleanNumber(mat?.qtyKontainerBesar),
            currentAktifKontainer: cleanNumber(mat?.qtyKontainerKecil),
            currentGudang: cleanNumber(mat?.qtyBesar),
          };
        }

        const targetGudang = Math.max(0, Math.floor(cleanNumber(item.afterQtyBesar)));
        map[matId].targetGudang = targetGudang;
        map[matId].hasWarehouseChange = targetGudang !== map[matId].currentGudang;
      });
    }

    return Object.values(map);
  }, [latestContainerEntry, latestWarehouseEntry, materialMap]);

  const filteredPendingUpdates = useMemo(() => {
    const q = updateSearchTerm.trim().toLowerCase();
    if (!q) return pendingStockUpdates;
    return pendingStockUpdates.filter(
      (item) => item.nama.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)
    );
  }, [pendingStockUpdates, updateSearchTerm]);

  const handleUpdateStockBahanBaku = async () => {
    if (pendingStockUpdates.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak Ada Data Opname",
        description: "Belum ada hasil stock opname yang dapat diterapkan.",
      });
      return;
    }

    setIsUpdatingStock(true);
    try {
      const batch = writeBatch(db);
      let count = 0;

      pendingStockUpdates.forEach((item) => {
        if (!item.id) return;
        const ref = doc(db, "bahan-baku", item.id);
        const updatePayload: Record<string, number> = {};

        if (item.targetBulkKontainer !== undefined) {
          updatePayload.qtyKontainerBesar = item.targetBulkKontainer;
        }
        if (item.targetAktifKontainer !== undefined) {
          updatePayload.qtyKontainerKecil = item.targetAktifKontainer;
        }
        if (item.targetGudang !== undefined) {
          updatePayload.qtyBesar = item.targetGudang;
        }

        if (Object.keys(updatePayload).length > 0) {
          batch.update(ref, updatePayload);
          count++;
        }
      });

      await batch.commit();

      toast({
        title: "Stok Bahan Baku Berhasil Diperbarui",
        description: `${count} bahan baku di master stok telah disesuaikan dengan hasil opname terakhir.`,
      });
      setIsUpdateStockOpen(false);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat memperbarui stok.";
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui Stok",
        description: errMsg,
      });
    } finally {
      setIsUpdatingStock(false);
    }
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
      });
    }

    const containerRowsExport = filteredContainerEntries.flatMap((entry) =>
      (entry.items || []).map((item) => ({
        tanggal: formatDateLabel(entry.entryDate),
        kode: item.code,
        nama: item.nama,
        stokBulkBahanBaku: item.beforeBulk,
        satuanBulk: item.unitBulk || "-",
        stokAktifBahanBaku: item.beforeAktif,
        satuanAktif: item.unitAktif || "-",
        hasilOpnameBulk: item.afterBulk,
        hasilOpnameAktif: item.afterAktif,
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
      const lastAutoTable = (docPDF as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
      startY = (lastAutoTable?.finalY ?? startY) + 12;
    } else {
      docPDF.setFontSize(9);
      docPDF.text("Belum ada data stock opname gudang untuk periode ini.", 15, startY + 4);
      startY += 12;
    }

    docPDF.setFontSize(12);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("Stock Opname Kontainer", 15, startY);

    autoTable(docPDF, {
      head: [["Tanggal", "Kode", "Nama", "Bulk (Bahan Baku)", "Aktif (Bahan Baku)", "Bulk (Opname)", "Aktif (Opname)", "Selisih"]],
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
    <div className="space-y-4 md:space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* 1. Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-900 leading-tight">
            Laporan Stock Opnam
          </h1>
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-slate-500 mt-0.5">
            Rekap stok gudang dan hasil opname kontainer dari input harian
          </p>
        </div>

        {/* Compact action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setUpdateSearchTerm("");
              setIsUpdateStockOpen(true);
            }}
            className="h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase text-[10px] tracking-wider shadow-sm px-3.5 gap-1.5 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-950" />
            <span>Update Stock Bahan Baku</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-9 rounded-xl border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider gap-1.5 shadow-sm hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="h-9 rounded-xl border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider gap-1.5 shadow-sm hover:bg-slate-50"
          >
            <FileDown className="h-3.5 w-3.5 text-primary" />
            <span>PDF</span>
          </Button>
        </div>
      </div>

      {/* 2. Filter & Source Toolbar Card */}
      <Card className="rounded-2xl sm:rounded-3xl border border-slate-100 bg-white p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Source Toggle */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
            <button
              onClick={() => setOpnameSource("karyawan")}
              className={cn(
                "flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                opnameSource === "karyawan" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Karyawan (Harian)
            </button>
            <button
              onClick={() => setOpnameSource("admin")}
              className={cn(
                "flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                opnameSource === "admin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Admin (Berkala)
            </button>
          </div>

          {/* Date & Month Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tanggal:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedMonth("");
                }}
                className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Bulan:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSelectedDate("");
                }}
                className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>

            {(selectedDate || selectedMonth) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 px-2.5 rounded-xl text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1"
              >
                <X className="h-3.5 w-3.5" /> Reset Filter
              </Button>
            )}
          </div>
        </div>

        {/* Informative Status Badge */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100/80 text-[10px] font-bold">
          <div className="flex items-center gap-2">
            {!selectedDate && !selectedMonth ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60 font-black text-[9px] sm:text-[10px]">
                ✨ Menampilkan Opname Terakhir (Belum difilter)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-primary bg-primary/10 px-2.5 py-0.5 rounded-full font-black text-[9px] sm:text-[10px]">
                📅 Riwayat Filter: {selectedDate ? `Tanggal ${selectedDate}` : `Bulan ${selectedMonth}`}
              </span>
            )}
          </div>
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-black hidden sm:inline-block">
            Sumber: <span className="text-slate-700">{opnameSource === "admin" ? "Admin" : "Karyawan"}</span>
          </span>
        </div>
      </Card>

      <Tabs defaultValue="kontainer" className="w-full">
        <TabsList className="mb-4 md:mb-6 grid h-12 w-full max-w-md grid-cols-2 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm">
          <TabsTrigger value="kontainer" className="rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Opname Kontainer
          </TabsTrigger>
          <TabsTrigger value="gudang" className="rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
            <Archive className="mr-1.5 h-3.5 w-3.5" /> Opname Gudang
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
                      {entry.note ? (
                        <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          {String(entry.note)}
                        </div>
                      ) : null}
                    </div>

                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block">
                      <table className="min-w-full text-left">
                        <thead className="bg-white/80">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Bulk (Bahan Baku)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Aktif (Bahan Baku)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Bulk (Hasil Opname)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Aktif (Hasil Opname)</th>
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

                    {/* Mobile List Cards View */}
                    <div className="md:hidden space-y-3">
                      {entry.items.map((item) => (
                        <div key={`${entry.id}-${item.id}`} className="rounded-xl bg-white border border-slate-100 p-3.5 shadow-sm space-y-2 relative">
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1">
                              <span className="inline-flex px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[8px] font-bold text-primary">
                                {item.code}
                              </span>
                              <h4 className="text-xs font-black text-slate-900 uppercase italic">
                                {item.nama}
                              </h4>
                            </div>
                            <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${item.diffBulk + item.diffAktif >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                              {item.diffBulk + item.diffAktif >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              <span>{formatCombinedDifference(item)}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100/60 text-[9px] leading-tight">
                            <div className="bg-slate-50 p-2 rounded-lg flex flex-col justify-between">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Stok Bahan Baku</span>
                              <div className="text-slate-700 font-black">
                                <div>Bulk: {formatNumber(item.beforeBulk)} {item.unitBulk || ""}</div>
                                <div>Aktif: {formatNumber(item.beforeAktif)} {item.unitAktif || ""}</div>
                              </div>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg flex flex-col justify-between">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Hasil Opname</span>
                              <div className="text-slate-700 font-black">
                                <div>Bulk: {formatNumber(item.afterBulk)} {item.unitBulk || ""}</div>
                                <div>Aktif: {formatNumber(item.afterAktif)} {item.unitAktif || ""}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
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
                <Archive className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">Stok Gudang</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rekap hasil stock opname gudang
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

            {loadingWarehouseHistory ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                Memuat data opname gudang...
              </div>
            ) : filteredWarehouseEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada data stock opname gudang untuk filter ini.
              </div>
            ) : (
              <div className="space-y-4 p-4 md:p-6">
                {filteredWarehouseEntries.map((entry) => (
                  <div key={entry.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          Tanggal Opname
                        </p>
                        <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                      </div>
                      {entry.note ? (
                        <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          {String(entry.note)}
                        </div>
                      ) : null}
                    </div>

                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block">
                      <table className="min-w-full text-left">
                        <thead className="bg-white/80">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Stok Bahan Baku</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Hasil Opname</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.items.map((item) => (
                            <tr key={`${entry.id}-${item.id}`} className="border-t border-slate-100 bg-white/70">
                              <td className="px-3 py-3 text-sm font-black text-slate-700">{item.code}</td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-900">{item.nama}</td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.beforeQtyBesar)} {item.unitBesar || ""}
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">
                                {formatNumber(item.afterQtyBesar)} {item.unitBesar || ""}
                              </td>
                              <td className={`px-3 py-3 text-right text-sm font-black ${item.diffQtyBesar >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                <div className="flex items-center justify-end gap-1">
                                  {item.diffQtyBesar >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                  {item.diffQtyBesar >= 0 ? `+${formatNumber(item.diffQtyBesar)}` : formatNumber(item.diffQtyBesar)} {item.unitBesar || ""}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile List Cards View */}
                    <div className="md:hidden space-y-3">
                      {entry.items.map((item) => (
                        <div key={`${entry.id}-${item.id}`} className="rounded-xl bg-white border border-slate-100 p-3.5 shadow-sm space-y-2 relative">
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1">
                              <span className="inline-flex px-2 py-0.5 rounded bg-primary/5 border border-primary/10 text-[8px] font-bold text-primary">
                                {item.code}
                              </span>
                              <h4 className="text-xs font-black text-slate-900 uppercase italic">
                                {item.nama}
                              </h4>
                            </div>
                            <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${item.diffQtyBesar >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                              {item.diffQtyBesar >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              <span>{item.diffQtyBesar >= 0 ? `+${formatNumber(item.diffQtyBesar)}` : formatNumber(item.diffQtyBesar)} {item.unitBesar || ""}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100/60 text-[9px] leading-tight">
                            <div className="bg-slate-50 p-2 rounded-lg flex flex-col justify-between">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Stok Bahan Baku</span>
                              <div className="text-slate-700 font-black">
                                <div>{formatNumber(item.beforeQtyBesar)} {item.unitBesar || ""}</div>
                              </div>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg flex flex-col justify-between">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Hasil Opname</span>
                              <div className="text-slate-700 font-black">
                                <div>{formatNumber(item.afterQtyBesar)} {item.unitBesar || ""}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Update Stock Bahan Baku */}
      <Dialog open={isUpdateStockOpen} onOpenChange={setIsUpdateStockOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-[2rem] p-6 bg-white border-none shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
                <RefreshCcw className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black uppercase italic text-slate-900">
                  Update Stok Bahan Baku
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-bold mt-0.5">
                  Sinkronisasi Master Bahan Baku (<span className="font-mono text-amber-700">/stok/bahan-baku</span>) sesuai hasil stock opname terakhir.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1 flex-1 py-2 custom-scrollbar">
            {/* Sumber Data Terakhir Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Hasil Opname Kontainer Terakhir
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-black text-[9px]">
                    {latestContainerEntry ? `${latestContainerEntry.items?.length || 0} Item` : "Tidak Ada"}
                  </span>
                </div>
                <p className="text-sm font-black text-slate-800">
                  {latestContainerEntry ? formatDateLabel(latestContainerEntry.entryDate) : "Belum ada data"}
                </p>
                {latestContainerEntry?.note && (
                  <p className="text-[10px] text-slate-500 font-bold italic">
                    Catatan: {latestContainerEntry.note}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Hasil Opname Gudang Terakhir
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-black text-[9px]">
                    {latestWarehouseEntry ? `${latestWarehouseEntry.items?.length || 0} Item` : "Tidak Ada"}
                  </span>
                </div>
                <p className="text-sm font-black text-slate-800">
                  {latestWarehouseEntry ? formatDateLabel(latestWarehouseEntry.entryDate) : "Belum ada data"}
                </p>
                {latestWarehouseEntry?.note && (
                  <p className="text-[10px] text-slate-500 font-bold italic">
                    Catatan: {latestWarehouseEntry.note}
                  </p>
                )}
              </div>
            </div>

            {/* Warning Info */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/60 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-black uppercase tracking-wide">Pemberitahuan Sinkronisasi Stok</p>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Menekan tombol <strong>&ldquo;Perbarui Sekarang&rdquo;</strong> akan langsung menimpa stok pada menu <span className="underline font-bold">/stok/bahan-baku</span> dengan angka hasil opname di bawah ini.
                </p>
              </div>
            </div>

            {/* Search filter */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={updateSearchTerm}
                  onChange={(e) => setUpdateSearchTerm(e.target.value)}
                  placeholder="Cari bahan yang akan diupdate..."
                  className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-bold"
                />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
                Total {filteredPendingUpdates.length} Bahan Baku
              </span>
            </div>

            {/* Preview Table */}
            {filteredPendingUpdates.length === 0 ? (
              <div className="py-12 text-center text-sm font-bold text-slate-400">
                Tidak ada data bahan baku yang cocok untuk diperbarui.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3.5 py-3">Bahan Baku</th>
                      <th className="px-3.5 py-3 text-right">Stok Gudang</th>
                      <th className="px-3.5 py-3 text-right">Bulk Kontainer</th>
                      <th className="px-3.5 py-3 text-right">Aktif Kontainer</th>
                      <th className="px-3.5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredPendingUpdates.map((item) => {
                      const hasChange = item.hasContainerChange || item.hasWarehouseChange;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3.5 py-3">
                            <span className="font-mono text-[10px] font-bold text-slate-400 block">
                              {item.code}
                            </span>
                            <span className="font-black text-slate-900 uppercase">
                              {item.nama}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            {item.targetGudang !== undefined ? (
                              <div className="font-bold">
                                <span className="text-slate-400 line-through mr-1.5 text-[10px]">
                                  {formatNumber(item.currentGudang)}
                                </span>
                                <span className="font-black text-slate-900">
                                  {formatNumber(item.targetGudang)} {item.unitBesar}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Tetap ({formatNumber(item.currentGudang)})</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            {item.targetBulkKontainer !== undefined ? (
                              <div className="font-bold">
                                <span className="text-slate-400 line-through mr-1.5 text-[10px]">
                                  {formatNumber(item.currentBulkKontainer)}
                                </span>
                                <span className="font-black text-slate-900">
                                  {formatNumber(item.targetBulkKontainer)} {item.unitBulk}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Tetap ({formatNumber(item.currentBulkKontainer)})</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            {item.targetAktifKontainer !== undefined ? (
                              <div className="font-bold">
                                <span className="text-slate-400 line-through mr-1.5 text-[10px]">
                                  {formatNumber(item.currentAktifKontainer)}
                                </span>
                                <span className="font-black text-slate-900">
                                  {formatNumber(item.targetAktifKontainer)} {item.unitAktif}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Tetap ({formatNumber(item.currentAktifKontainer)})</span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            {hasChange ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                                Berubah
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-500">
                                Sama
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUpdateStockOpen(false)}
              disabled={isUpdatingStock}
              className="rounded-xl border-slate-200 text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleUpdateStockBahanBaku}
              disabled={isUpdatingStock || pendingStockUpdates.length === 0}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md shadow-amber-500/20"
            >
              {isUpdatingStock ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Perbarui Sekarang
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
