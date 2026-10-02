"use client";

import React, { useCallback, useMemo, useState } from "react";
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
  Pencil,
  Trash2,
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
import { useConsolidatedCollection, useConsolidatedWarehouseCollection, useDoc, useFirestore, useMemoFirebase, doc } from "@/firebase";
import { 
  getStoreConfigDocId, 
  useActiveBranch, 
  normalizeBranchId, 
  BRANCH_LIST, 
  WAREHOUSE_LIST, 
  isMaterialForBranchContainer,
  branchDoc,
  warehouseDoc,
  BranchId
} from "@/lib/branch-helper";
import { SHARED_MATERIAL_ALIASES } from "@/lib/material-mapping";
import { orderBy, query, writeBatch, updateDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

// --- Types ---
interface BranchPill {
  id: 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong';
  shortName: string;
  badgeColor: string;
}

interface MultiBranchEditBranchItem {
  entryId: string;
  branchId: BranchId;
  warehouseId?: 'gdm' | 'kedungreja' | 'gembong';
  branchName: string;
  badgeColor: string;
  materialId?: string;
  beforeBulk?: number;
  beforeAktif?: number;
  afterBulk: number;
  afterAktif: number;
  beforeQtyBesar?: number;
  afterQtyBesar: number;
  existsInOpname: boolean;
}

interface EditModalState {
  isOpen: boolean;
  type: "container" | "warehouse";
  materialId?: string;
  materialCode: string;
  materialNama: string;
  unitBulk?: string;
  unitAktif?: string;
  unitBesar?: string;
  entryDateLabel: string;
  branches: MultiBranchEditBranchItem[];
}

interface ConsolidatedContainerRow {
  key: string;
  code: string;
  nama: string;
  unitBulk: string;
  unitAktif: string;
  gdmBulk: number;
  gdmAktif: number;
  kdrjBulk: number;
  kdrjAktif: number;
  tehwargaBulk: number;
  tehwargaAktif: number;
  gembongBulk: number;
  gembongAktif: number;
  totalBulk: number;
  totalAktif: number;
  targetBranches: BranchPill[];
}

interface ConsolidatedWarehouseRow {
  key: string;
  code: string;
  nama: string;
  unitBesar: string;
  gdmQty: number;
  kdrjQty: number;
  gembongQty: number;
  totalQty: number;
}
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
  _branchId?: string;
  isFromTehWarga?: boolean;
  originalTwCode?: string;
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
  _branchId?: string;
  _branchName?: string;
  _warehouseId?: string;
  _warehouseName?: string;
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

/**
 * Natural comparator for material codes (BB001 < BB002 < ... < BB066, BB-001 < BB-002, etc.)
 */
const compareMaterialCode = (codeA?: string, codeB?: string, nameA?: string, nameB?: string) => {
  const cA = (codeA || "").trim();
  const cB = (codeB || "").trim();
  if (cA && cB && cA !== "-" && cB !== "-") {
    return cA.localeCompare(cB, undefined, { numeric: true, sensitivity: "base" });
  }
  return (nameA || "").localeCompare(nameB || "");
};

export default function LaporanStockOpnamePage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [opnameSource, setOpnameSource] = useState<"karyawan" | "admin">("karyawan");

  // Material filter states
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>("all");
  const [searchMaterial, setSearchMaterial] = useState<string>("");

  const [isUpdateStockOpen, setIsUpdateStockOpen] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [updateSearchTerm, setUpdateSearchTerm] = useState("");

  // State Edit Hasil Opname untuk Owner
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    type: "container",
    materialId: "",
    materialCode: "",
    materialNama: "",
    unitBulk: "",
    unitAktif: "",
    unitBesar: "",
    entryDateLabel: "",
    branches: [],
  });

  // State Konfirmasi Hapus Opnam
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<{
    id: string;
    type: "container" | "warehouse";
    branchId?: string;
    warehouseId?: string;
    note?: string;
    dateLabel?: string;
    itemCount?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: materials } = useConsolidatedCollection(
    db,
    "bahan-baku",
    (ref) => query(ref, orderBy("code", "asc"))
  );

  const { data: opnameHistory, loading: loadingHistory } = useConsolidatedCollection(
    db,
    "opnam_harian",
    (ref) => query(ref, orderBy("date", "desc"))
  );

  const { data: warehouseHistory, loading: loadingWarehouseHistory } = useConsolidatedWarehouseCollection(
    db,
    "opnam_gudang",
    (ref) => query(ref, orderBy("date", "desc"))
  );

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

  // Map to determine which store/branch uses each material
  const materialStoreUsageMap = useMemo(() => {
    const map: Record<string, Set<'gdm' | 'kedungreja' | 'tehwarga' | 'gembong'>> = {};

    const addUsage = (key: string, branch: 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong') => {
      const k = key.trim().toLowerCase();
      if (!k) return;
      if (!map[k]) map[k] = new Set();
      map[k].add(branch);
    };

    // 1. From master materials in all branch collections
    (materials as BahanBaku[])?.forEach((mat) => {
      const bId = (mat._branchId || 'gdm') as 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong';
      // For GDM and Gembong, exclude Teh Warga imported documents
      if ((bId === 'gdm' || bId === 'gembong') && (mat.isFromTehWarga || mat.originalTwCode || /^BB-0(0[1-9]|[1-4][0-9])$/i.test(mat.code || ''))) {
        return;
      }
      if (mat.nama) addUsage(mat.nama, bId);
      if (mat.code) addUsage(mat.code, bId);
    });

    // 2. From SHARED_MATERIAL_ALIASES (physical items shared across all outlets)
    SHARED_MATERIAL_ALIASES.forEach((alias) => {
      addUsage(alias.canonicalName, 'gdm');
      addUsage(alias.canonicalName, 'kedungreja');
      addUsage(alias.canonicalName, 'tehwarga');
      addUsage(alias.canonicalName, 'gembong');
      alias.aliases.forEach((a) => {
        addUsage(a, 'gdm');
        addUsage(a, 'kedungreja');
        addUsage(a, 'tehwarga');
        addUsage(a, 'gembong');
      });
      if (alias.gdmCode) {
        addUsage(alias.gdmCode, 'gdm');
        addUsage(alias.gdmCode, 'kedungreja');
        addUsage(alias.gdmCode, 'gembong');
      }
      if (alias.twCode) {
        addUsage(alias.twCode, 'tehwarga');
      }
    });

    return map;
  }, [materials]);

  const allContainerEntries = useMemo((): EnrichedContainerEntry[] => {
    const rawList = (opnameHistory as RawOpnameEntry[]) || [];
    return rawList
      ?.map((entry) => {
        const rawItems = entry.items || [];
        const filteredItems = activeBranch !== 'all' 
          ? rawItems.filter(item => isMaterialForBranchContainer(item, activeBranch))
          : rawItems;

        const enrichedItems: EnrichedContainerItem[] = filteredItems.map((item): EnrichedContainerItem => {
          const material = materialMap[item.id ?? ""] || 
                           materialMap[String(item.code ?? "").trim().toLowerCase()] || 
                           materialMap[String(item.nama ?? "").trim().toLowerCase()] || 
                           null;

          // Stok bahan baku pada waktu/jam stock opname disimpan (Snapshot waktu opname)
          const snapshotStockBulk = cleanNumber(item.before?.qtyKontainerBesar ?? material?.qtyKontainerBesar);
          const snapshotStockAktif = cleanNumber(item.before?.qtyKontainerKecil ?? material?.qtyKontainerKecil);

          // Hasil opname fisik pada waktu tersebut
          const opnameBulk = cleanNumber(item.after?.qtyKontainerBesar ?? item.afterBulk ?? item.before?.qtyKontainerBesar);

          let opnameAktif = 0;
          if (item.grams !== undefined && item.grams !== null) {
            opnameAktif = Math.max(0, cleanNumber(item.grams));
          } else if (item.after?.grams !== undefined && item.after?.grams !== null) {
            opnameAktif = Math.max(0, cleanNumber(item.after.grams));
          } else {
            const rawSaved = cleanNumber(item.after?.qtyKontainerKecil ?? item.afterAktif ?? item.before?.qtyKontainerKecil);
            opnameAktif = Math.max(0, rawSaved);
          }

          return {
            ...item,
            code: item.code || material?.code || "-",
            nama: item.nama || material?.nama || "-",
            beforeBulk: snapshotStockBulk,
            beforeAktif: snapshotStockAktif,
            afterBulk: opnameBulk,
            afterAktif: opnameAktif,
            diffBulk: opnameBulk - snapshotStockBulk,
            diffAktif: opnameAktif - snapshotStockAktif,
            unitBulk: material?.satuanBesar ?? "",
            unitAktif: material?.satuanKecil ?? "",
          };
        });

        // Urutkan bahan baku dari terkecil ke terbesar berdasarkan kode
        enrichedItems.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));

        return {
          ...entry,
          _branchId: entry._branchId || 'gdm',
          _branchName: entry._branchName || (entry._branchId ? BRANCH_LIST[entry._branchId as keyof typeof BRANCH_LIST]?.shortName : 'Zona GDM'),
          entryDate: toDateValue(entry.date),
          items: enrichedItems,
        };
      })
      .filter((entry) => {
        const noteStr = typeof entry.note === "string" ? entry.note : "";
        const isCreatedByAdmin = noteStr.toLowerCase().includes("admin");
        if (opnameSource === "admin" && !isCreatedByAdmin) return false;
        if (opnameSource === "karyawan" && isCreatedByAdmin) return false;
        return true;
      }) || [];
  }, [opnameHistory, materialMap, opnameSource, activeBranch]);

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
    return activeBranch === 'all' ? allContainerEntries.slice(0, 5) : allContainerEntries.slice(0, 1);
  }, [allContainerEntries, selectedDate, selectedMonth, activeBranch]);

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

        const enrichedItems: EnrichedWarehouseItem[] = (entry.items || []).map((item): EnrichedWarehouseItem => {
          const prevVal = prevItemsMap[item.id ?? ""] ?? prevItemsMap[item.code ?? ""];
          const beforeQtyBesar = prevVal !== undefined ? Number(prevVal) : Number(item.beforeQtyBesar || 0);
          const afterQtyBesar = Number(item.afterQtyBesar || 0);
          return {
            ...item,
            code: item.code || "-",
            nama: item.nama || "-",
            beforeQtyBesar,
            afterQtyBesar,
            diffQtyBesar: afterQtyBesar - beforeQtyBesar,
            unitBesar: item.unitBesar || "",
          };
        });

        // Urutkan bahan baku dari terkecil ke terbesar berdasarkan kode
        enrichedItems.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));

        return {
          ...entry,
          _warehouseId: entry._warehouseId || 'gdm',
          _warehouseName: entry._warehouseName || (entry._warehouseId ? WAREHOUSE_LIST[entry._warehouseId as keyof typeof WAREHOUSE_LIST]?.shortName : 'Gudang GDM'),
          entryDate: toDateValue(entry.date),
          items: enrichedItems,
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
    return activeBranch === 'all' ? allWarehouseEntries.slice(0, 5) : allWarehouseEntries.slice(0, 1);
  }, [allWarehouseEntries, selectedDate, selectedMonth, activeBranch]);

  const effectiveContainerEntries = useMemo(() => {
    if (activeBranch !== 'all') return filteredContainerEntries;
    if (selectedDate || selectedMonth) return filteredContainerEntries;
    
    // When activeBranch === 'all' and no date/month filter, take latest entry per branch
    const branchMap = new Map<string, EnrichedContainerEntry>();
    for (const entry of allContainerEntries) {
      const bId = normalizeBranchId(
        entry._branchId ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).branch ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).branchId ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).cabang
      );
      if (!branchMap.has(bId)) {
        branchMap.set(bId, entry);
      }
    }
    return Array.from(branchMap.values());
  }, [activeBranch, selectedDate, selectedMonth, filteredContainerEntries, allContainerEntries]);

  const consolidatedContainerMatrix = useMemo((): ConsolidatedContainerRow[] => {
    if (activeBranch !== 'all') return [];

    const map: Record<string, ConsolidatedContainerRow> = {};

    effectiveContainerEntries.forEach((entry) => {
      const bId = normalizeBranchId(
        entry._branchId ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).branch ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).branchId ||
        (entry as { branch?: string; branchId?: string; cabang?: string }).cabang
      );

      (entry.items || []).forEach((item) => {
        const key = String(item.nama || item.code || item.id || "").trim().toLowerCase();
        if (!key) return;

        if (!map[key]) {
          map[key] = {
            key,
            code: item.code || "-",
            nama: item.nama || "-",
            unitBulk: item.unitBulk || "",
            unitAktif: item.unitAktif || "",
            gdmBulk: 0,
            gdmAktif: 0,
            kdrjBulk: 0,
            kdrjAktif: 0,
            tehwargaBulk: 0,
            tehwargaAktif: 0,
            gembongBulk: 0,
            gembongAktif: 0,
            totalBulk: 0,
            totalAktif: 0,
            targetBranches: [],
          };
        }

        if (map[key].code === "-" && item.code) map[key].code = item.code;
        if (!map[key].unitBulk && item.unitBulk) map[key].unitBulk = item.unitBulk;
        if (!map[key].unitAktif && item.unitAktif) map[key].unitAktif = item.unitAktif;

        const bulkVal = cleanNumber(item.afterBulk);
        const aktifVal = cleanNumber(item.afterAktif);

        if (bId === "gdm") {
          map[key].gdmBulk += bulkVal;
          map[key].gdmAktif += aktifVal;
        } else if (bId === "kedungreja") {
          map[key].kdrjBulk += bulkVal;
          map[key].kdrjAktif += aktifVal;
        } else if (bId === "tehwarga") {
          map[key].tehwargaBulk += bulkVal;
          map[key].tehwargaAktif += aktifVal;
        } else if (bId === "gembong") {
          map[key].gembongBulk += bulkVal;
          map[key].gembongAktif += aktifVal;
        }
      });
    });

    const rows = Object.values(map);
    rows.forEach((r) => {
      r.totalBulk = r.gdmBulk + r.kdrjBulk + r.tehwargaBulk + r.gembongBulk;
      r.totalAktif = r.gdmAktif + r.kdrjAktif + r.tehwargaAktif + r.gembongAktif;

      // Determine Target Stores / Peruntukan Toko
      const storeSet = new Set<'gdm' | 'kedungreja' | 'tehwarga' | 'gembong'>();
      const normName = r.nama.trim().toLowerCase();
      const normCode = r.code.trim().toLowerCase();
      const normKey = r.key.trim().toLowerCase();

      const byName = materialStoreUsageMap[normName];
      const byKey = materialStoreUsageMap[normKey];
      const byCode = materialStoreUsageMap[normCode];

      if (byName) byName.forEach((b) => storeSet.add(b));
      if (byKey) byKey.forEach((b) => storeSet.add(b));
      if (byCode) byCode.forEach((b) => storeSet.add(b));

      // Check if recorded opname in specific store
      if (r.gdmBulk > 0 || r.gdmAktif > 0) storeSet.add('gdm');
      if (r.kdrjBulk > 0 || r.kdrjAktif > 0) storeSet.add('kedungreja');
      if (r.tehwargaBulk > 0 || r.tehwargaAktif > 0) storeSet.add('tehwarga');
      if (r.gembongBulk > 0 || r.gembongAktif > 0) storeSet.add('gembong');

      // Fallback based on code pattern
      if (storeSet.size === 0) {
        if (/^BB-0(0[1-9]|[1-4][0-9])$/i.test(r.code)) {
          storeSet.add('tehwarga');
        } else {
          storeSet.add('gdm');
          storeSet.add('kedungreja');
          storeSet.add('gembong');
        }
      }

      const branchOrder: Array<'gdm' | 'kedungreja' | 'tehwarga' | 'gembong'> = ['gdm', 'kedungreja', 'tehwarga', 'gembong'];
      r.targetBranches = branchOrder
        .filter((b) => storeSet.has(b))
        .map((b) => ({
          id: b,
          shortName: b === 'gdm' ? 'Zona GDM' : b === 'kedungreja' ? 'Zona Kedungreja' : b === 'gembong' ? 'Zona Gembong' : 'Teh Warga',
          badgeColor: BRANCH_LIST[b]?.badgeColor || ''
        }));
    });

    // Urutkan bahan baku terkecil ke terbesar secara natural (BB001 -> BB002 ... -> BB066, dll)
    return rows.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));
  }, [activeBranch, effectiveContainerEntries, materialStoreUsageMap]);

  const effectiveWarehouseEntries = useMemo(() => {
    if (activeBranch !== 'all') return filteredWarehouseEntries;
    if (selectedDate || selectedMonth) return filteredWarehouseEntries;
    
    const warehouseMap = new Map<string, EnrichedWarehouseEntry>();
    for (const entry of allWarehouseEntries) {
      const wId = entry._warehouseId || 'gdm';
      if (!warehouseMap.has(wId)) {
        warehouseMap.set(wId, entry);
      }
    }
    return Array.from(warehouseMap.values());
  }, [activeBranch, selectedDate, selectedMonth, filteredWarehouseEntries, allWarehouseEntries]);

  const consolidatedWarehouseMatrix = useMemo((): ConsolidatedWarehouseRow[] => {
    if (activeBranch !== 'all') return [];

    const map: Record<string, ConsolidatedWarehouseRow> = {};

    effectiveWarehouseEntries.forEach((entry) => {
      const wId = entry._warehouseId || "gdm";

      (entry.items || []).forEach((item) => {
        const key = String(item.nama || item.code || item.id || "").trim().toLowerCase();
        if (!key) return;

        if (!map[key]) {
          map[key] = {
            key,
            code: item.code || "-",
            nama: item.nama || "-",
            unitBesar: item.unitBesar || "",
            gdmQty: 0,
            kdrjQty: 0,
            gembongQty: 0,
            totalQty: 0,
          };
        }

        if (map[key].code === "-" && item.code) map[key].code = item.code;
        if (!map[key].unitBesar && item.unitBesar) map[key].unitBesar = item.unitBesar;

        const qtyVal = cleanNumber(item.afterQtyBesar);

        if (wId === "gdm") {
          map[key].gdmQty += qtyVal;
        } else if (wId === "kedungreja") {
          map[key].kdrjQty += qtyVal;
        } else if (wId === "gembong") {
          map[key].gembongQty += qtyVal;
        }
      });
    });

    const rows = Object.values(map);
    rows.forEach((r) => {
      r.totalQty = r.gdmQty + r.kdrjQty + r.gembongQty;
    });

    // Urutkan bahan baku terkecil ke terbesar secara natural
    return rows.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));
  }, [activeBranch, effectiveWarehouseEntries]);

  // Unique material names for dropdown filter
  const availableMaterialNames = useMemo(() => {
    const set = new Set<string>();
    (materials as BahanBaku[])?.forEach((m) => {
      if (m.nama && m.nama !== "-") set.add(m.nama);
    });
    allContainerEntries.forEach((entry) => {
      entry.items?.forEach((item) => {
        if (item.nama && item.nama !== "-") set.add(item.nama);
      });
    });
    allWarehouseEntries.forEach((entry) => {
      entry.items?.forEach((item) => {
        if (item.nama && item.nama !== "-") set.add(item.nama);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [materials, allContainerEntries, allWarehouseEntries]);

  const matchesMaterialFilter = useCallback((name?: string, code?: string) => {
    const n = (name || "").trim().toLowerCase();
    const c = (code || "").trim().toLowerCase();
    if (selectedMaterialName !== "all" && n !== selectedMaterialName.toLowerCase()) {
      return false;
    }
    if (searchMaterial.trim()) {
      const q = searchMaterial.trim().toLowerCase();
      return n.includes(q) || c.includes(q);
    }
    return true;
  }, [selectedMaterialName, searchMaterial]);

  const displayConsolidatedContainerMatrix = useMemo(() => {
    if (selectedMaterialName === "all" && !searchMaterial.trim()) {
      return consolidatedContainerMatrix;
    }
    return consolidatedContainerMatrix.filter((item) => matchesMaterialFilter(item.nama, item.code));
  }, [consolidatedContainerMatrix, selectedMaterialName, searchMaterial, matchesMaterialFilter]);

  const displayConsolidatedWarehouseMatrix = useMemo(() => {
    if (selectedMaterialName === "all" && !searchMaterial.trim()) {
      return consolidatedWarehouseMatrix;
    }
    return consolidatedWarehouseMatrix.filter((item) => matchesMaterialFilter(item.nama, item.code));
  }, [consolidatedWarehouseMatrix, selectedMaterialName, searchMaterial, matchesMaterialFilter]);

  const displayContainerEntries = useMemo(() => {
    if (selectedMaterialName === "all" && !searchMaterial.trim()) {
      return filteredContainerEntries;
    }
    return filteredContainerEntries
      .map((entry) => ({
        ...entry,
        items: (entry.items || []).filter((item) => matchesMaterialFilter(item.nama, item.code)),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [filteredContainerEntries, selectedMaterialName, searchMaterial, matchesMaterialFilter]);

  const displayWarehouseEntries = useMemo(() => {
    if (selectedMaterialName === "all" && !searchMaterial.trim()) {
      return filteredWarehouseEntries;
    }
    return filteredWarehouseEntries
      .map((entry) => ({
        ...entry,
        items: (entry.items || []).filter((item) => matchesMaterialFilter(item.nama, item.code)),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [filteredWarehouseEntries, selectedMaterialName, searchMaterial, matchesMaterialFilter]);

  const resetFilters = () => {
    setSelectedDate("");
    setSelectedMonth("");
    setSelectedMaterialName("all");
    setSearchMaterial("");
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

    const list = Object.values(map);
    return list.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));
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

  // --- Handlers Edit Hasil Opname Owner ---
  const handleOpenEditContainerSingle = (entry: EnrichedContainerEntry, item: EnrichedContainerItem) => {
    const bId = normalizeBranchId(entry._branchId || activeBranch);
    const branchName = BRANCH_LIST[bId]?.name || "Zona Waktu GDM";
    const badgeColor = BRANCH_LIST[bId]?.badgeColor || "";

    setEditModal({
      isOpen: true,
      type: "container",
      materialId: item.id || "",
      materialCode: item.code || "-",
      materialNama: item.nama || "-",
      unitBulk: item.unitBulk || "Pack",
      unitAktif: item.unitAktif || "Gram",
      entryDateLabel: formatDateLabel(entry.entryDate),
      branches: [
        {
          entryId: entry.id,
          branchId: bId,
          branchName: branchName,
          badgeColor: badgeColor,
          materialId: item.id || "",
          beforeBulk: item.beforeBulk,
          beforeAktif: item.beforeAktif,
          afterBulk: item.afterBulk,
          afterAktif: item.afterAktif,
          afterQtyBesar: 0,
          existsInOpname: true,
        }
      ]
    });
  };

  const handleOpenEditContainerMatrix = (row: ConsolidatedContainerRow) => {
    const targetBranches: Array<'gdm' | 'kedungreja' | 'tehwarga' | 'gembong'> = ['gdm', 'kedungreja', 'tehwarga', 'gembong'];
    const branchList: MultiBranchEditBranchItem[] = [];

    targetBranches.forEach((bId) => {
      const entry = effectiveContainerEntries.find((e) => normalizeBranchId(e._branchId) === bId);
      if (!entry) return;

      const matchItem = entry.items?.find((it) => 
        (it.code && it.code.trim().toLowerCase() === row.code.trim().toLowerCase()) ||
        (it.nama && it.nama.trim().toLowerCase() === row.nama.trim().toLowerCase()) ||
        (it.id && row.key && it.id.trim().toLowerCase() === row.key.trim().toLowerCase())
      );

      if (matchItem) {
        branchList.push({
          entryId: entry.id,
          branchId: bId,
          branchName: BRANCH_LIST[bId]?.name || bId,
          badgeColor: BRANCH_LIST[bId]?.badgeColor || "",
          materialId: matchItem.id || "",
          beforeBulk: matchItem.beforeBulk,
          beforeAktif: matchItem.beforeAktif,
          afterBulk: matchItem.afterBulk,
          afterAktif: matchItem.afterAktif,
          afterQtyBesar: 0,
          existsInOpname: true,
        });
      }
    });

    if (branchList.length === 0) {
      toast({
        variant: "destructive",
        title: "Data Opname Tidak Ditemukan",
        description: "Tidak ditemukan riwayat opname aktif untuk bahan baku ini.",
      });
      return;
    }

    setEditModal({
      isOpen: true,
      type: "container",
      materialId: "",
      materialCode: row.code,
      materialNama: row.nama,
      unitBulk: row.unitBulk || "Pack",
      unitAktif: row.unitAktif || "Gram",
      entryDateLabel: selectedDate ? `Tanggal ${selectedDate}` : "Opname Terakhir",
      branches: branchList
    });
  };

  const handleOpenEditWarehouseSingle = (entry: EnrichedWarehouseEntry, item: EnrichedWarehouseItem) => {
    const rawWId = entry._warehouseId || 'gdm';
    const wId = (rawWId === 'kedungreja' ? 'kedungreja' : rawWId === 'gembong' ? 'gembong' : 'gdm') as 'gdm' | 'kedungreja' | 'gembong';
    const whName = WAREHOUSE_LIST[wId]?.name || "Gudang Utama";
    const badgeColor = WAREHOUSE_LIST[wId]?.badgeColor || "";

    setEditModal({
      isOpen: true,
      type: "warehouse",
      materialId: item.id || "",
      materialCode: item.code || "-",
      materialNama: item.nama || "-",
      unitBesar: item.unitBesar || "Pack",
      entryDateLabel: formatDateLabel(entry.entryDate),
      branches: [
        {
          entryId: entry.id,
          branchId: wId === 'gembong' ? 'gembong' : 'gdm',
          warehouseId: wId,
          branchName: whName,
          badgeColor: badgeColor,
          materialId: item.id || "",
          beforeQtyBesar: item.beforeQtyBesar,
          afterQtyBesar: item.afterQtyBesar,
          afterBulk: 0,
          afterAktif: 0,
          existsInOpname: true,
        }
      ]
    });
  };

  const handleOpenEditWarehouseMatrix = (row: ConsolidatedWarehouseRow) => {
    const targetWarehouses: Array<'gdm' | 'kedungreja' | 'gembong'> = ['gdm', 'kedungreja', 'gembong'];
    const branchList: MultiBranchEditBranchItem[] = [];

    targetWarehouses.forEach((wId) => {
      const entry = effectiveWarehouseEntries.find((e) => (e._warehouseId || 'gdm') === wId);
      if (!entry) return;

      const matchItem = entry.items?.find((it) => 
        (it.code && it.code.trim().toLowerCase() === row.code.trim().toLowerCase()) ||
        (it.nama && it.nama.trim().toLowerCase() === row.nama.trim().toLowerCase()) ||
        (it.id && row.key && it.id.trim().toLowerCase() === row.key.trim().toLowerCase())
      );

      if (matchItem) {
        branchList.push({
          entryId: entry.id,
          branchId: wId === 'gembong' ? 'gembong' : 'gdm',
          warehouseId: wId,
          branchName: WAREHOUSE_LIST[wId]?.name || wId,
          badgeColor: WAREHOUSE_LIST[wId]?.badgeColor || "",
          materialId: matchItem.id || "",
          beforeQtyBesar: matchItem.beforeQtyBesar,
          afterQtyBesar: matchItem.afterQtyBesar,
          afterBulk: 0,
          afterAktif: 0,
          existsInOpname: true,
        });
      }
    });

    if (branchList.length === 0) {
      toast({
        variant: "destructive",
        title: "Data Opname Gudang Tidak Ditemukan",
        description: "Tidak ditemukan riwayat opname gudang untuk bahan baku ini.",
      });
      return;
    }

    setEditModal({
      isOpen: true,
      type: "warehouse",
      materialId: "",
      materialCode: row.code,
      materialNama: row.nama,
      unitBesar: row.unitBesar || "Pack",
      entryDateLabel: selectedDate ? `Tanggal ${selectedDate}` : "Opname Terakhir",
      branches: branchList
    });
  };

  const handleSaveEditOpname = async () => {
    if (editModal.branches.length === 0) return;
    setIsSavingEdit(true);

    try {
      let savedCount = 0;

      for (const br of editModal.branches) {
        if (!br.entryId || !br.existsInOpname) continue;

        if (editModal.type === "container") {
          const rawEntry = (opnameHistory as RawOpnameEntry[])?.find(
            (e) => e.id === br.entryId && normalizeBranchId(e._branchId) === br.branchId
          );
          if (!rawEntry) continue;

          const updatedItems = (rawEntry.items || []).map((it) => {
            const isMatch = 
              (it.id && br.materialId && it.id === br.materialId) ||
              (it.code && it.code.trim().toLowerCase() === editModal.materialCode.trim().toLowerCase()) ||
              (it.nama && it.nama.trim().toLowerCase() === editModal.materialNama.trim().toLowerCase());
            
            if (!isMatch) return it;

            const newBulk = cleanNumber(br.afterBulk);
            const newAktif = cleanNumber(br.afterAktif);
            const currentAfter = (it.after as Record<string, unknown>) || {};

            return {
              ...it,
              after: {
                ...currentAfter,
                qtyKontainerBesar: newBulk,
                qtyKontainerKecil: newAktif,
                grams: newAktif,
              },
              afterBulk: newBulk,
              afterAktif: newAktif,
              grams: newAktif,
            };
          });

          const docRef = branchDoc(db, "opnam_harian", br.entryId, br.branchId);
          await updateDoc(docRef, {
            items: updatedItems,
            updatedAt: serverTimestamp(),
            lastEditedBy: "Owner",
          });
          savedCount++;
        } else {
          // Warehouse
          const rawEntry = (warehouseHistory as RawOpnameEntry[])?.find(
            (e) => e.id === br.entryId && (e._warehouseId || 'gdm') === br.warehouseId
          );
          if (!rawEntry) continue;

          const updatedItems = (rawEntry.items || []).map((it) => {
            const isMatch = 
              (it.id && br.materialId && it.id === br.materialId) ||
              (it.code && it.code.trim().toLowerCase() === editModal.materialCode.trim().toLowerCase()) ||
              (it.nama && it.nama.trim().toLowerCase() === editModal.materialNama.trim().toLowerCase());
            
            if (!isMatch) return it;

            const newQty = cleanNumber(br.afterQtyBesar);
            const beforeQty = cleanNumber(it.beforeQtyBesar ?? 0);

            return {
              ...it,
              afterQtyBesar: newQty,
              diffQtyBesar: newQty - beforeQty,
            };
          });

          const docRef = warehouseDoc(db, "opnam_gudang", br.entryId, br.warehouseId);
          await updateDoc(docRef, {
            items: updatedItems,
            updatedAt: serverTimestamp(),
            lastEditedBy: "Owner",
          });
          savedCount++;
        }
      }

      toast({
        title: "Hasil Opname Berhasil Diperbarui",
        description: `Perubahan hasil opname untuk ${editModal.materialNama} (${savedCount} data) telah tersimpan dan laporan otomatis diperbarui.`,
      });
      setEditModal((prev) => ({ ...prev, isOpen: false }));
    } catch (err: unknown) {
      console.error("Error saving opname edit:", err);
      const errMsg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat menyimpan hasil opname.";
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Perubahan",
        description: errMsg,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteConfirmEntry) return;
    setIsDeleting(true);
    try {
      if (deleteConfirmEntry.type === "container") {
        const bId = normalizeBranchId(deleteConfirmEntry.branchId || activeBranch);
        const docRef = branchDoc(db, "opnam_harian", deleteConfirmEntry.id, bId);
        await deleteDoc(docRef);
        if (bId !== "gdm") {
          const legacyRef = branchDoc(db, "opnam_harian", deleteConfirmEntry.id, "gdm");
          await deleteDoc(legacyRef).catch(() => {});
        }
        toast({
          title: "Berhasil Dihapus",
          description: `Data opnam harian (${deleteConfirmEntry.dateLabel || ""}) berhasil dihapus. Histori opnam harian telah diperbarui.`,
        });
      } else {
        const wId = (deleteConfirmEntry.warehouseId || activeBranch || "gdm") as "gdm" | "kedungreja" | "gembong";
        const docRef = warehouseDoc(db, "opnam_gudang", deleteConfirmEntry.id, wId);
        await deleteDoc(docRef);
        toast({
          title: "Berhasil Dihapus",
          description: `Data opnam gudang (${deleteConfirmEntry.dateLabel || ""}) berhasil dihapus.`,
        });
      }
      setDeleteConfirmEntry(null);
    } catch (err: unknown) {
      console.error("Gagal menghapus opname:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus data opnam.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    if (activeBranch === "all") {
      const containerRowsExport = displayConsolidatedContainerMatrix.map((item, idx) => ({
        "No": idx + 1,
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Peruntukan Toko": item.targetBranches.map(b => b.shortName).join(", "),
        "Zona GDM - Bulk (Opname)": `${item.gdmBulk} ${item.unitBulk || ""}`.trim(),
        "Zona GDM - Aktif (Opname)": `${item.gdmAktif} ${item.unitAktif || ""}`.trim(),
        "Zona Kedungreja - Bulk (Opname)": `${item.kdrjBulk} ${item.unitBulk || ""}`.trim(),
        "Zona Kedungreja - Aktif (Opname)": `${item.kdrjAktif} ${item.unitAktif || ""}`.trim(),
        "Teh Warga GDM - Bulk (Opname)": `${item.tehwargaBulk} ${item.unitBulk || ""}`.trim(),
        "Teh Warga GDM - Aktif (Opname)": `${item.tehwargaAktif} ${item.unitAktif || ""}`.trim(),
        "Zona Gembong - Bulk (Opname)": `${item.gembongBulk} ${item.unitBulk || ""}`.trim(),
        "Zona Gembong - Aktif (Opname)": `${item.gembongAktif} ${item.unitAktif || ""}`.trim(),
        "Total - Bulk (Opname)": `${item.totalBulk} ${item.unitBulk || ""}`.trim(),
        "Total - Aktif (Opname)": `${item.totalAktif} ${item.unitAktif || ""}`.trim(),
      }));

      const warehouseRowsExport = displayConsolidatedWarehouseMatrix.map((item, idx) => ({
        "No": idx + 1,
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Gudang GDM (Opname)": `${item.gdmQty} ${item.unitBesar || ""}`.trim(),
        "Gudang Kedungreja (Opname)": `${item.kdrjQty} ${item.unitBesar || ""}`.trim(),
        "Gudang Gembong (Opname)": `${item.gembongQty} ${item.unitBesar || ""}`.trim(),
        "Total Gudang (Opname)": `${item.totalQty} ${item.unitBesar || ""}`.trim(),
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(containerRowsExport), "Kontainer (Semua Toko)");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warehouseRowsExport), "Gudang (Semua Toko)");
      XLSX.writeFile(wb, `Laporan_Stock_Opname_Semua_Toko_${new Date().toISOString().split("T")[0]}.xlsx`);
      return;
    }

    const warehouseRowsExport = displayWarehouseEntries.flatMap((entry) =>
      (entry.items || []).map((item, idx) => ({
        "No": idx + 1,
        "Tanggal": formatDateLabel(entry.entryDate),
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Stok Sistem": `${item.beforeQtyBesar} ${item.unitBesar || ""}`.trim(),
        "Hasil Opname": `${item.afterQtyBesar} ${item.unitBesar || ""}`.trim(),
        "Selisih": `${item.diffQtyBesar >= 0 ? `+${item.diffQtyBesar}` : item.diffQtyBesar} ${item.unitBesar || ""}`.trim()
      }))
    );

    const containerRowsExport = displayContainerEntries.flatMap((entry) =>
      (entry.items || []).map((item, idx) => ({
        "No": idx + 1,
        "Tanggal": formatDateLabel(entry.entryDate),
        "Kode": item.code,
        "Nama Bahan": item.nama,
        "Stok Bulk (Sistem)": `${item.beforeBulk} ${item.unitBulk || "-"}`.trim(),
        "Stok Aktif (Sistem)": `${item.beforeAktif} ${item.unitAktif || "-"}`.trim(),
        "Hasil Opname Bulk": `${item.afterBulk} ${item.unitBulk || "-"}`.trim(),
        "Hasil Opname Aktif": `${item.afterAktif} ${item.unitAktif || "-"}`.trim(),
        "Selisih": formatCombinedDifference(item),
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(warehouseRowsExport.length ? warehouseRowsExport : [{ "Keterangan": "Belum ada data" }]), "Gudang");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(containerRowsExport.length ? containerRowsExport : [{ "Keterangan": "Belum ada data" }]), "Kontainer");
    XLSX.writeFile(wb, `Laporan_Stock_Opname_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleExportPDF = async () => {
    const isLandscape = true;
    const docPDF = new jsPDF(isLandscape ? "l" : "p", "mm", "a4");

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

    const pageWidth = isLandscape ? 297 : 210;
    const centerX = pageWidth / 2;

    docPDF.setFontSize(16);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text(
      activeBranch === "all" ? "LAPORAN STOCK OPNAME (SEMUA TOKO)" : "LAPORAN STOCK OPNAME",
      centerX,
      18,
      { align: "center" }
    );
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(`Periode: ${selectedDate || selectedMonth || "Semua Periode"} • Dicetak: ${new Date().toLocaleDateString("id-ID")}`, centerX, 24, { align: "center" });
    docPDF.setDrawColor(203, 213, 225);
    docPDF.line(15, 28, pageWidth - 15, 28);

    let startY = 34;

    if (activeBranch === "all") {
      // PDF for SEMUA TOKO: Matrix Kontainer
      docPDF.setFontSize(11);
      docPDF.setTextColor(15, 23, 42);
      docPDF.text("Stock Opname Kontainer (Konsolidasi Semua Toko)", 15, startY);

      autoTable(docPDF, {
        head: [
          [
            "No",
            "Kode",
            "Nama Bahan",
            "Zona GDM\nBulk",
            "Zona GDM\nAktif",
            "Kedungreja\nBulk",
            "Kedungreja\nAktif",
            "Teh Warga\nBulk",
            "Teh Warga\nAktif",
            "Gembong\nBulk",
            "Gembong\nAktif",
            "TOTAL\nBulk",
            "TOTAL\nAktif",
            "Peruntukan Toko",
          ],
        ],
        body: displayConsolidatedContainerMatrix.map((item, idx) => [
          idx + 1,
          item.code,
          item.nama,
          `${formatNumber(item.gdmBulk)} ${item.unitBulk || ""}`.trim(),
          `${formatNumber(item.gdmAktif)} ${item.unitAktif || ""}`.trim(),
          `${formatNumber(item.kdrjBulk)} ${item.unitBulk || ""}`.trim(),
          `${formatNumber(item.kdrjAktif)} ${item.unitAktif || ""}`.trim(),
          `${formatNumber(item.tehwargaBulk)} ${item.unitBulk || ""}`.trim(),
          `${formatNumber(item.tehwargaAktif)} ${item.unitAktif || ""}`.trim(),
          `${formatNumber(item.gembongBulk)} ${item.unitBulk || ""}`.trim(),
          `${formatNumber(item.gembongAktif)} ${item.unitAktif || ""}`.trim(),
          `${formatNumber(item.totalBulk)} ${item.unitBulk || ""}`.trim(),
          `${formatNumber(item.totalAktif)} ${item.unitAktif || ""}`.trim(),
          item.targetBranches.map(b => b.shortName).join(", "),
        ]),
        startY: startY + 4,
        theme: "grid",
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fillColor: [15, 23, 42], halign: "center", fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 7, halign: "center" },
          1: { cellWidth: 15, fontStyle: "bold" },
          2: { cellWidth: 32 },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right" },
          10: { halign: "right" },
          11: { halign: "right", fontStyle: "bold" },
          12: { halign: "right", fontStyle: "bold" },
          13: { cellWidth: 30 },
        },
      });

      const lastAutoTable = (docPDF as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
      startY = (lastAutoTable?.finalY ?? startY) + 12;

      // Warehouse matrix in PDF
      if (startY > 165) {
        docPDF.addPage();
        startY = 20;
      }

      docPDF.setFontSize(11);
      docPDF.setTextColor(15, 23, 42);
      docPDF.text("Stock Opname Gudang (Konsolidasi Semua Gudang)", 15, startY);

      autoTable(docPDF, {
        head: [["No", "Kode", "Nama Bahan", "Gudang GDM", "Gudang Kedungreja", "Gudang Gembong", "Total Gudang"]],
        body: displayConsolidatedWarehouseMatrix.map((item, idx) => [
          idx + 1,
          item.code,
          item.nama,
          `${formatNumber(item.gdmQty)} ${item.unitBesar || ""}`.trim(),
          `${formatNumber(item.kdrjQty)} ${item.unitBesar || ""}`.trim(),
          `${formatNumber(item.gembongQty)} ${item.unitBesar || ""}`.trim(),
          `${formatNumber(item.totalQty)} ${item.unitBesar || ""}`.trim(),
        ]),
        startY: startY + 4,
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229], halign: "center" },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 25, fontStyle: "bold" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right", fontStyle: "bold" },
        },
      });

      docPDF.save(`Laporan_Stock_Opname_Semua_Toko_${new Date().toISOString().split("T")[0]}.pdf`);
      return;
    }

    // Single Store PDF
    docPDF.setFontSize(11);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("Stock Opname Kontainer", 15, startY);

    autoTable(docPDF, {
      head: [["No", "Tanggal", "Kode", "Nama Bahan", "Bulk (Sistem)", "Aktif (Sistem)", "Bulk (Opname)", "Aktif (Opname)", "Selisih"]],
      body: displayContainerEntries.flatMap((entry) =>
        (entry.items || []).map((item, idx) => [
          idx + 1,
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
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right", fontStyle: "bold" },
      }
    });

    const lastAutoTable = (docPDF as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    startY = (lastAutoTable?.finalY ?? startY) + 12;

    if (startY > 165) {
      docPDF.addPage();
      startY = 20;
    }

    docPDF.setFontSize(11);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("Stock Opname Gudang", 15, startY);

    const warehouseRowsPDF = displayWarehouseEntries.flatMap((entry) =>
      (entry.items || []).map((item, idx) => [
        idx + 1,
        formatDateLabel(entry.entryDate),
        item.code,
        item.nama,
        `${item.beforeQtyBesar} ${item.unitBesar || ""}`,
        `${item.afterQtyBesar} ${item.unitBesar || ""}`,
        `${item.diffQtyBesar >= 0 ? `+${item.diffQtyBesar}` : item.diffQtyBesar} ${item.unitBesar || ""}`
      ])
    );

    if (warehouseRowsPDF.length > 0) {
      autoTable(docPDF, {
        head: [["No", "Tanggal", "Kode", "Nama Bahan", "Sebelum", "Sesudah", "Selisih"]],
        body: warehouseRowsPDF,
        startY: startY + 4,
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right", fontStyle: "bold" },
        }
      });
    }

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

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setUpdateSearchTerm("");
              setIsUpdateStockOpen(true);
            }}
            className="h-9 sm:h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase text-[10px] tracking-wider shadow-sm px-3.5 gap-1.5 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-950" />
            <span>Update Stock Bahan Baku</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-9 sm:h-10 rounded-xl border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider gap-1.5 shadow-sm hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="h-9 sm:h-10 rounded-xl border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider gap-1.5 shadow-sm hover:bg-slate-50"
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

          {/* Date, Month & Material Filters */}
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

            {/* Filter Nama Bahan */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Bahan:</span>
              <select
                value={selectedMaterialName}
                onChange={(e) => setSelectedMaterialName(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer max-w-[160px] sm:max-w-[200px] truncate"
              >
                <option value="all">Semua Bahan ({availableMaterialNames.length})</option>
                {availableMaterialNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Quick Search Input */}
            <div className="relative min-w-[140px] sm:min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari kode/nama..."
                value={searchMaterial}
                onChange={(e) => setSearchMaterial(e.target.value)}
                className="pl-8 pr-7 h-8 rounded-xl border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-800"
              />
              {searchMaterial && (
                <button
                  type="button"
                  onClick={() => setSearchMaterial("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {(selectedDate || selectedMonth || selectedMaterialName !== "all" || searchMaterial.trim()) && (
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
                ✨ Menampilkan Opname Terakhir (Urut Kode Terkecil ke Terbesar)
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
          <Card className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">Stok Kontainer</h2>
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rekap hasil input opname harian outlet kontainer
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm self-start md:self-auto">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  {selectedDate ? `Tanggal: ${selectedDate}` : selectedMonth ? `Bulan: ${selectedMonth}` : "Semua periode"}
                </div>
              </div>
            </div>

            {loadingHistory ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                Memuat data opname kontainer...
              </div>
            ) : activeBranch === 'all' ? (
              displayConsolidatedContainerMatrix.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Tidak ada data stock opname kontainer untuk filter ini.
                </div>
              ) : (
                <div className="space-y-4 p-3 sm:p-4 md:p-6">
                  <div className="rounded-[1.25rem] sm:rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-3 sm:p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider">
                            Konsolidasi Semua Toko
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {effectiveContainerEntries.length} Data Toko
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold mt-1">
                          Matriks hasil opname fisik kontainer (Bulk & Aktif) beserta peruntukan toko masing-masing bahan
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Total {displayConsolidatedContainerMatrix.length} Bahan Baku
                      </span>
                    </div>

                    {/* Desktop Table View for SEMUA TOKO (Matrix) */}
                    <div className="overflow-x-auto hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                      <table className="w-full text-left border-collapse table-auto">
                        <thead>
                          {/* Row 1: Toko Grouping */}
                          <tr className="border-b border-slate-200 bg-slate-100/90 text-[9.5px] font-black uppercase tracking-wider text-slate-700">
                            <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 w-8 text-center bg-slate-200/70 text-slate-800">
                              No
                            </th>
                            <th rowSpan={2} className="px-2 py-2 border-r border-slate-200 w-20">
                              Kode
                            </th>
                            <th rowSpan={2} className="px-2.5 py-2 border-r border-slate-200">
                              Nama Bahan
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center border-r border-slate-200 bg-emerald-50 text-emerald-800 text-[9px]">
                              Zona Waktu GDM
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center border-r border-slate-200 bg-cyan-50 text-cyan-800 text-[9px]">
                              Zona Kedungreja
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center border-r border-slate-200 bg-amber-50 text-amber-800 text-[9px]">
                              Teh Warga GDM
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center border-r border-slate-200 bg-indigo-50 text-indigo-800 text-[9px]">
                              Zona Gembong
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center border-r border-slate-200 bg-slate-900 text-white font-black text-[9px]">
                              TOTAL (Semua Toko)
                            </th>
                            <th rowSpan={2} className="px-2 py-2 w-[140px] text-center bg-slate-100 text-slate-800 font-black text-[9px] border-r border-slate-200">
                              Peruntukan Toko
                            </th>
                            <th rowSpan={2} className="px-2 py-2 w-14 text-center bg-amber-50 text-amber-900 font-black text-[9px]">
                              Aksi
                            </th>
                          </tr>
                          {/* Row 2: Sub Columns */}
                          <tr className="border-b border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-wider text-slate-500">
                            <th className="px-1.5 py-1 text-right bg-emerald-50/50">Bulk</th>
                            <th className="px-1.5 py-1 text-right border-r border-slate-200 bg-emerald-50/50">Aktif</th>
                            <th className="px-1.5 py-1 text-right bg-cyan-50/50">Bulk</th>
                            <th className="px-1.5 py-1 text-right border-r border-slate-200 bg-cyan-50/50">Aktif</th>
                            <th className="px-1.5 py-1 text-right bg-amber-50/50">Bulk</th>
                            <th className="px-1.5 py-1 text-right border-r border-slate-200 bg-amber-50/50">Aktif</th>
                            <th className="px-1.5 py-1 text-right bg-indigo-50/50">Bulk</th>
                            <th className="px-1.5 py-1 text-right border-r border-slate-200 bg-indigo-50/50">Aktif</th>
                            <th className="px-1.5 py-1 text-right bg-slate-100 text-slate-900 font-black">Bulk</th>
                            <th className="px-1.5 py-1 text-right border-r border-slate-200 bg-slate-100 text-slate-900 font-black">Aktif</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {displayConsolidatedContainerMatrix.map((item, idx) => (
                            <tr key={item.key} className="hover:bg-slate-50/80 transition-colors">
                              {/* No Column */}
                              <td className="px-1.5 py-2 text-center font-bold text-slate-500 border-r border-slate-100 bg-slate-50/30 text-[10px]">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-2 font-mono font-bold text-indigo-600 border-r border-slate-100 text-[10px] whitespace-nowrap">
                                {item.code}
                              </td>
                              <td className="px-2.5 py-2 font-bold text-slate-900 uppercase border-r border-slate-100 text-[10.5px]">
                                {item.nama}
                              </td>
                              {/* Zona GDM */}
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 bg-emerald-50/20 whitespace-nowrap">
                                {item.gdmBulk > 0 ? (
                                  <span>{formatNumber(item.gdmBulk)} <span className="text-[9px] text-slate-400">{item.unitBulk}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 border-r border-slate-100 bg-emerald-50/20 whitespace-nowrap">
                                {item.gdmAktif > 0 ? (
                                  <span>{formatNumber(item.gdmAktif)} <span className="text-[9px] text-slate-400">{item.unitAktif}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Zona Kedungreja */}
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 bg-cyan-50/20 whitespace-nowrap">
                                {item.kdrjBulk > 0 ? (
                                  <span>{formatNumber(item.kdrjBulk)} <span className="text-[9px] text-slate-400">{item.unitBulk}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 border-r border-slate-100 bg-cyan-50/20 whitespace-nowrap">
                                {item.kdrjAktif > 0 ? (
                                  <span>{formatNumber(item.kdrjAktif)} <span className="text-[9px] text-slate-400">{item.unitAktif}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Teh Warga GDM */}
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 bg-amber-50/20 whitespace-nowrap">
                                {item.tehwargaBulk > 0 ? (
                                  <span>{formatNumber(item.tehwargaBulk)} <span className="text-[9px] text-slate-400">{item.unitBulk}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 border-r border-slate-100 bg-amber-50/20 whitespace-nowrap">
                                {item.tehwargaAktif > 0 ? (
                                  <span>{formatNumber(item.tehwargaAktif)} <span className="text-[9px] text-slate-400">{item.unitAktif}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Zona Gembong */}
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 bg-indigo-50/20 whitespace-nowrap">
                                {item.gembongBulk > 0 ? (
                                  <span>{formatNumber(item.gembongBulk)} <span className="text-[9px] text-slate-400">{item.unitBulk}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="px-1.5 py-2 text-right font-medium text-slate-700 border-r border-slate-100 bg-indigo-50/20 whitespace-nowrap">
                                {item.gembongAktif > 0 ? (
                                  <span>{formatNumber(item.gembongAktif)} <span className="text-[9px] text-slate-400">{item.unitAktif}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Total */}
                              <td className="px-1.5 py-2 text-right font-bold text-slate-950 bg-slate-50 whitespace-nowrap">
                                {formatNumber(item.totalBulk)} <span className="text-[9px] text-slate-500 font-medium">{item.unitBulk}</span>
                              </td>
                              <td className="px-1.5 py-2 text-right font-bold text-slate-950 border-r border-slate-100 bg-slate-50 whitespace-nowrap">
                                {formatNumber(item.totalAktif)} <span className="text-[9px] text-slate-500 font-medium">{item.unitAktif}</span>
                              </td>
                              {/* Peruntukan Toko (Teks Kecil Ringkas) */}
                              <td className="px-2 py-1.5 text-left bg-slate-50/40 border-r border-slate-100">
                                <div className="flex flex-wrap items-center gap-1">
                                  {item.targetBranches.map((br) => (
                                    <span
                                      key={br.id}
                                      className={cn(
                                        "inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-tight border leading-none",
                                        br.id === "gdm" && "bg-emerald-50 text-emerald-800 border-emerald-200/80",
                                        br.id === "kedungreja" && "bg-cyan-50 text-cyan-800 border-cyan-200/80",
                                        br.id === "tehwarga" && "bg-amber-50 text-amber-800 border-amber-200/80",
                                        br.id === "gembong" && "bg-indigo-50 text-indigo-800 border-indigo-200/80"
                                      )}
                                    >
                                      {br.id === "gdm" ? "Zona GDM" : br.id === "kedungreja" ? "Kedungreja" : br.id === "gembong" ? "Zona Gembong" : "Teh Warga"}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              {/* Aksi Edit */}
                              <td className="px-1.5 py-1.5 text-center bg-amber-50/30">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditContainerMatrix(item)}
                                  className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shadow-2xs transition-all"
                                  title="Edit Hasil Opname"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                  <span>Edit</span>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards for SEMUA TOKO */}
                    <div className="md:hidden space-y-3">
                      {displayConsolidatedContainerMatrix.map((item, idx) => (
                        <div key={item.key} className="rounded-2xl bg-white border border-slate-200/80 p-3.5 shadow-sm space-y-2.5">
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="inline-flex px-1.5 py-0.2 rounded bg-indigo-50 font-mono text-[9px] font-bold text-indigo-700">
                                  {item.code}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase">
                                  {item.nama}
                                </h4>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditContainerMatrix(item)}
                              className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shrink-0"
                            >
                              <Pencil className="h-2.5 w-2.5 text-amber-700" />
                              <span>Edit</span>
                            </Button>
                          </div>

                          {/* Peruntukan Toko on Mobile */}
                          <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0">Peruntukan:</span>
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {item.targetBranches.map((br) => (
                                <span
                                  key={br.id}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[8px] font-black uppercase border",
                                    br.id === "gdm" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                                    br.id === "kedungreja" && "bg-cyan-50 text-cyan-800 border-cyan-200",
                                    br.id === "tehwarga" && "bg-amber-50 text-amber-800 border-amber-200",
                                    br.id === "gembong" && "bg-indigo-50 text-indigo-800 border-indigo-200"
                                  )}
                                >
                                  {br.shortName}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-1.5 text-[10px]">
                            {/* GDM */}
                            <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
                              <span className="font-bold text-emerald-800">Zona GDM:</span>
                              <span className="font-black text-emerald-950">
                                {formatNumber(item.gdmBulk)} {item.unitBulk} / {formatNumber(item.gdmAktif)} {item.unitAktif}
                              </span>
                            </div>
                            {/* Kedungreja */}
                            <div className="p-2 rounded-xl bg-cyan-50/70 border border-cyan-100 flex items-center justify-between">
                              <span className="font-bold text-cyan-800">Kedungreja:</span>
                              <span className="font-black text-cyan-950">
                                {formatNumber(item.kdrjBulk)} {item.unitBulk} / {formatNumber(item.kdrjAktif)} {item.unitAktif}
                              </span>
                            </div>
                            {/* Teh Warga */}
                            <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-100 flex items-center justify-between">
                              <span className="font-bold text-amber-800">Teh Warga:</span>
                              <span className="font-black text-amber-950">
                                {formatNumber(item.tehwargaBulk)} {item.unitBulk} / {formatNumber(item.tehwargaAktif)} {item.unitAktif}
                              </span>
                            </div>
                            {/* Gembong */}
                            <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
                              <span className="font-bold text-indigo-800">Zona Gembong:</span>
                              <span className="font-black text-indigo-950">
                                {formatNumber(item.gembongBulk)} {item.unitBulk} / {formatNumber(item.gembongAktif)} {item.unitAktif}
                              </span>
                            </div>
                          </div>

                          {/* Total Row */}
                          <div className="p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between text-xs shadow-inner">
                            <span className="font-black uppercase tracking-wider text-[10px] text-slate-300">Total:</span>
                            <span className="font-black">
                              {formatNumber(item.totalBulk)} {item.unitBulk} | {formatNumber(item.totalAktif)} {item.unitAktif}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            ) : displayContainerEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada data stock opname kontainer untuk filter ini.
              </div>
            ) : (
              <div className="space-y-4 p-3 sm:p-4 md:p-6">
                {displayContainerEntries.map((entry) => (
                  <div key={entry.id} className="rounded-[1.25rem] sm:rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-3.5 sm:p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Tanggal Opname
                          </p>
                          <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-auto">
                        {entry.note ? (
                          <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                            {String(entry.note)}
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeleteConfirmEntry({
                              id: entry.id,
                              type: "container",
                              branchId: entry._branchId,
                              note: typeof entry.note === "string" ? entry.note : "Finalisasi Opnam Harian",
                              dateLabel: formatDateLabel(entry.entryDate),
                              itemCount: entry.items?.length || 0,
                            })
                          }
                          className="h-7 rounded-full border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors flex items-center gap-1.5 shadow-sm"
                          title="Hapus opnam harian ini"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus</span>
                        </Button>
                      </div>
                    </div>

                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                      <table className="min-w-full text-left">
                        <thead className="bg-slate-100/90 text-slate-700">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-center w-12 border-r border-slate-200">No</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-200">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-200">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right">Bulk (Sistem)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right border-r border-slate-200">Aktif (Sistem)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right">Bulk (Hasil Opname)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right border-r border-slate-200">Aktif (Hasil Opname)</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right bg-slate-200/50 border-r border-slate-200">Selisih</th>
                            <th className="px-2 py-3 text-[10px] font-black uppercase tracking-widest text-center w-14 bg-amber-50 text-amber-900">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {entry.items.map((item, idx) => (
                            <tr key={`${entry.id}-${item.id}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2.5 text-center font-black text-slate-500 border-r border-slate-100 bg-slate-50/30">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-indigo-600 border-r border-slate-100">{item.code}</td>
                              <td className="px-3 py-2.5 font-black text-slate-900 uppercase border-r border-slate-100">{item.nama}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-600">
                                {formatNumber(item.beforeBulk)} <span className="text-[10px] text-slate-400">{item.unitBulk || ""}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-600 border-r border-slate-100">
                                {formatNumber(item.beforeAktif)} <span className="text-[10px] text-slate-400">{item.unitAktif || ""}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                                {formatNumber(item.afterBulk)} <span className="text-[10px] text-slate-400">{item.unitBulk || ""}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-slate-900 border-r border-slate-100">
                                {formatNumber(item.afterAktif)} <span className="text-[10px] text-slate-400">{item.unitAktif || ""}</span>
                              </td>
                              <td className={`px-3 py-2.5 text-right font-black border-r border-slate-100 ${item.diffBulk + item.diffAktif >= 0 ? "text-emerald-600 bg-emerald-50/30" : "text-rose-600 bg-rose-50/30"}`}>
                                <div className="flex items-center justify-end gap-1">
                                  {item.diffBulk + item.diffAktif >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                  {formatCombinedDifference(item)}
                                </div>
                              </td>
                              <td className="px-1.5 py-1.5 text-center bg-amber-50/30">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditContainerSingle(entry, item)}
                                  className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shadow-2xs transition-all"
                                  title="Edit Hasil Opname"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                  <span>Edit</span>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile List Cards View */}
                    <div className="md:hidden space-y-3">
                      {entry.items.map((item, idx) => (
                        <div key={`${entry.id}-${item.id}`} className="rounded-2xl bg-white border border-slate-100 p-3.5 shadow-sm space-y-2.5 relative">
                          <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-[10px] font-black text-white shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="inline-flex px-1.5 py-0.2 rounded bg-primary/10 font-mono text-[9px] font-bold text-primary">
                                  {item.code}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase">
                                  {item.nama}
                                </h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${item.diffBulk + item.diffAktif >= 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"}`}>
                                {item.diffBulk + item.diffAktif >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                <span>{formatCombinedDifference(item)}</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditContainerSingle(entry, item)}
                                className="h-6 px-1.5 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shrink-0"
                              >
                                <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                <span>Edit</span>
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-slate-50 p-2 rounded-xl flex flex-col justify-between border border-slate-100">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Stok Bahan Baku</span>
                              <div className="text-slate-700 font-black">
                                <div>Bulk: {formatNumber(item.beforeBulk)} {item.unitBulk || ""}</div>
                                <div>Aktif: {formatNumber(item.beforeAktif)} {item.unitAktif || ""}</div>
                              </div>
                            </div>
                            <div className="bg-indigo-50/50 p-2 rounded-xl flex flex-col justify-between border border-indigo-100">
                              <span className="text-indigo-500 font-bold uppercase tracking-wider block mb-1">Hasil Opname</span>
                              <div className="text-indigo-950 font-black">
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
          <Card className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">Stok Gudang</h2>
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rekap hasil stock opname fisik gudang
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm self-start md:self-auto">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                  {selectedDate ? `Tanggal: ${selectedDate}` : selectedMonth ? `Bulan: ${selectedMonth}` : "Semua periode"}
                </div>
              </div>
            </div>

            {loadingWarehouseHistory ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-primary opacity-20" />
                Memuat data opname gudang...
              </div>
            ) : activeBranch === 'all' ? (
              displayConsolidatedWarehouseMatrix.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Tidak ada data stock opname gudang untuk filter ini.
                </div>
              ) : (
                <div className="space-y-4 p-3 sm:p-4 md:p-6">
                  <div className="rounded-[1.25rem] sm:rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-3 sm:p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-900 text-white text-[9px] font-black uppercase tracking-wider">
                            Konsolidasi Semua Gudang
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {effectiveWarehouseEntries.length} Data Gudang
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold mt-1">
                          Matriks hasil opname fisik gudang seluruh lokasi
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Total {displayConsolidatedWarehouseMatrix.length} Bahan Baku
                      </span>
                    </div>

                    {/* Desktop Table View for SEMUA GUDANG */}
                    <div className="overflow-x-auto hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                      <table className="min-w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100/90 text-[10px] font-black uppercase tracking-wider text-slate-700">
                            <th className="px-3 py-3 border-r border-slate-200 w-12 text-center bg-slate-200/70 text-slate-800">No</th>
                            <th className="px-3 py-3 border-r border-slate-200 w-24">Kode</th>
                            <th className="px-3 py-3 border-r border-slate-200 min-w-[200px]">Nama Bahan</th>
                            <th className="px-3 py-3 text-right border-r border-slate-200 bg-emerald-50 text-emerald-800">
                              Gudang GDM (Opname)
                            </th>
                            <th className="px-3 py-3 text-right border-r border-slate-200 bg-cyan-50 text-cyan-800">
                              Gudang Kedungreja (Opname)
                            </th>
                            <th className="px-3 py-3 text-right border-r border-slate-200 bg-indigo-50 text-indigo-800">
                              Gudang Gembong (Opname)
                            </th>
                            <th className="px-3 py-3 text-right bg-slate-900 text-white font-black border-r border-slate-200">
                              Total Gudang
                            </th>
                            <th className="px-2 py-3 text-center w-14 bg-amber-50 text-amber-900 font-black">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {displayConsolidatedWarehouseMatrix.map((item, idx) => (
                            <tr key={item.key} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2.5 text-center font-black text-slate-500 border-r border-slate-100 bg-slate-50/30">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-indigo-600 border-r border-slate-100">{item.code}</td>
                              <td className="px-3 py-2.5 font-black text-slate-900 uppercase border-r border-slate-100">{item.nama}</td>
                              {/* Gudang GDM */}
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700 border-r border-slate-100 bg-emerald-50/20">
                                {item.gdmQty > 0 ? (
                                  <span>{formatNumber(item.gdmQty)} <span className="text-[10px] text-slate-400">{item.unitBesar}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Gudang Kedungreja */}
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700 border-r border-slate-100 bg-cyan-50/20">
                                {item.kdrjQty > 0 ? (
                                  <span>{formatNumber(item.kdrjQty)} <span className="text-[10px] text-slate-400">{item.unitBesar}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Gudang Gembong */}
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700 border-r border-slate-100 bg-indigo-50/20">
                                {item.gembongQty > 0 ? (
                                  <span>{formatNumber(item.gembongQty)} <span className="text-[10px] text-slate-400">{item.unitBesar}</span></span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              {/* Total */}
                              <td className="px-3 py-2.5 text-right font-black text-slate-950 bg-slate-50 border-r border-slate-100">
                                {formatNumber(item.totalQty)} <span className="text-[10px] text-slate-500 font-bold">{item.unitBesar}</span>
                              </td>
                              {/* Aksi */}
                              <td className="px-1.5 py-1.5 text-center bg-amber-50/30">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditWarehouseMatrix(item)}
                                  className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shadow-2xs transition-all"
                                  title="Edit Hasil Opname"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                  <span>Edit</span>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards for SEMUA GUDANG */}
                    <div className="md:hidden space-y-3">
                      {displayConsolidatedWarehouseMatrix.map((item, idx) => (
                        <div key={item.key} className="rounded-2xl bg-white border border-slate-200/80 p-3.5 shadow-sm space-y-2.5">
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-900 text-[10px] font-black text-white shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="inline-flex px-1.5 py-0.2 rounded bg-indigo-50 font-mono text-[9px] font-bold text-indigo-700">
                                  {item.code}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase">
                                  {item.nama}
                                </h4>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditWarehouseMatrix(item)}
                              className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shrink-0"
                            >
                              <Pencil className="h-2.5 w-2.5 text-amber-700" />
                              <span>Edit</span>
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                            <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100 flex flex-col justify-between">
                              <span className="font-bold text-emerald-800 text-[9px] uppercase">Gudang GDM</span>
                              <span className="font-black text-emerald-950 text-xs mt-0.5">
                                {formatNumber(item.gdmQty)} {item.unitBesar}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-cyan-50/70 border border-cyan-100 flex flex-col justify-between">
                              <span className="font-bold text-cyan-800 text-[9px] uppercase">Gudang Kedungreja</span>
                              <span className="font-black text-cyan-950 text-xs mt-0.5">
                                {formatNumber(item.kdrjQty)} {item.unitBesar}
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-100 flex flex-col justify-between">
                              <span className="font-bold text-indigo-800 text-[9px] uppercase">Gudang Gembong</span>
                              <span className="font-black text-indigo-950 text-xs mt-0.5">
                                {formatNumber(item.gembongQty)} {item.unitBesar}
                              </span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between text-xs shadow-inner">
                            <span className="font-black uppercase tracking-wider text-[10px] text-slate-300">Total Gudang:</span>
                            <span className="font-black">
                              {formatNumber(item.totalQty)} {item.unitBesar}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            ) : displayWarehouseEntries.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada data stock opname gudang untuk filter ini.
              </div>
            ) : (
              <div className="space-y-4 p-3 sm:p-4 md:p-6">
                {displayWarehouseEntries.map((entry) => (
                  <div key={entry.id} className="rounded-[1.25rem] sm:rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-3.5 sm:p-4">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Tanggal Opname
                          </p>
                          <p className="text-sm font-black text-slate-900">{formatDateLabel(entry.entryDate)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-auto">
                        {entry.note ? (
                          <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                            {String(entry.note)}
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDeleteConfirmEntry({
                              id: entry.id,
                              type: "warehouse",
                              warehouseId: entry._warehouseId,
                              note: typeof entry.note === "string" ? entry.note : "Opname Gudang",
                              dateLabel: formatDateLabel(entry.entryDate),
                              itemCount: entry.items?.length || 0,
                            })
                          }
                          className="h-7 rounded-full border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors flex items-center gap-1.5 shadow-sm"
                          title="Hapus opname gudang ini"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus</span>
                        </Button>
                      </div>
                    </div>

                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                      <table className="min-w-full text-left">
                        <thead className="bg-slate-100/90 text-slate-700">
                          <tr>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-center w-12 border-r border-slate-200">No</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-200">Kode</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-200">Nama Bahan</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right">Stok Bahan Baku</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right border-r border-slate-200">Hasil Opname</th>
                            <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-right bg-slate-200/50 border-r border-slate-200">Selisih</th>
                            <th className="px-2 py-3 text-[10px] font-black uppercase tracking-widest text-center w-14 bg-amber-50 text-amber-900">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {entry.items.map((item, idx) => (
                            <tr key={`${entry.id}-${item.id}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-3 py-2.5 text-center font-black text-slate-500 border-r border-slate-100 bg-slate-50/30">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-indigo-600 border-r border-slate-100">{item.code}</td>
                              <td className="px-3 py-2.5 font-black text-slate-900 uppercase border-r border-slate-100">{item.nama}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                                {formatNumber(item.beforeQtyBesar)} <span className="text-[10px] text-slate-400">{item.unitBesar || ""}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-slate-900 border-r border-slate-100">
                                {formatNumber(item.afterQtyBesar)} <span className="text-[10px] text-slate-400">{item.unitBesar || ""}</span>
                              </td>
                              <td className={`px-3 py-2.5 text-right font-black border-r border-slate-100 ${item.diffQtyBesar >= 0 ? "text-emerald-600 bg-emerald-50/30" : "text-rose-600 bg-rose-50/30"}`}>
                                <div className="flex items-center justify-end gap-1">
                                  {item.diffQtyBesar >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                  {item.diffQtyBesar >= 0 ? `+${formatNumber(item.diffQtyBesar)}` : formatNumber(item.diffQtyBesar)} {item.unitBesar || ""}
                                </div>
                              </td>
                              <td className="px-1.5 py-1.5 text-center bg-amber-50/30">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditWarehouseSingle(entry, item)}
                                  className="h-6 px-2 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shadow-2xs transition-all"
                                  title="Edit Hasil Opname"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                  <span>Edit</span>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile List Cards View */}
                    <div className="md:hidden space-y-3">
                      {entry.items.map((item, idx) => (
                        <div key={`${entry.id}-${item.id}`} className="rounded-2xl bg-white border border-slate-100 p-3.5 shadow-sm space-y-2.5 relative">
                          <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-900 text-[10px] font-black text-white shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="inline-flex px-1.5 py-0.2 rounded bg-indigo-50 font-mono text-[9px] font-bold text-indigo-700">
                                  {item.code}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 uppercase">
                                  {item.nama}
                                </h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${item.diffQtyBesar >= 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"}`}>
                                {item.diffQtyBesar >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                <span>{item.diffQtyBesar >= 0 ? `+${formatNumber(item.diffQtyBesar)}` : formatNumber(item.diffQtyBesar)} {item.unitBesar || ""}</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditWarehouseSingle(entry, item)}
                                className="h-6 px-1.5 text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1 border border-amber-300/80 shrink-0"
                              >
                                <Pencil className="h-2.5 w-2.5 text-amber-700" />
                                <span>Edit</span>
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-slate-50 p-2 rounded-xl flex flex-col justify-between border border-slate-100">
                              <span className="text-slate-400 font-bold uppercase tracking-wider block mb-1">Stok Bahan Baku</span>
                              <div className="text-slate-700 font-black">
                                <div>{formatNumber(item.beforeQtyBesar)} {item.unitBesar || ""}</div>
                              </div>
                            </div>
                            <div className="bg-indigo-50/50 p-2 rounded-xl flex flex-col justify-between border border-indigo-100">
                              <span className="text-indigo-500 font-bold uppercase tracking-wider block mb-1">Hasil Opname</span>
                              <div className="text-indigo-950 font-black">
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
              <div className="rounded-2xl border border-slate-100 overflow-x-auto shadow-sm">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3.5 py-3 text-center w-12 border-r border-slate-200">No</th>
                      <th className="px-3.5 py-3">Bahan Baku</th>
                      <th className="px-3.5 py-3 text-right">Stok Gudang</th>
                      <th className="px-3.5 py-3 text-right">Bulk Kontainer</th>
                      <th className="px-3.5 py-3 text-right">Aktif Kontainer</th>
                      <th className="px-3.5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredPendingUpdates.map((item, idx) => {
                      const hasChange = item.hasContainerChange || item.hasWarehouseChange;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3.5 py-3 text-center font-black text-slate-400 border-r border-slate-100">
                            {idx + 1}
                          </td>
                          <td className="px-3.5 py-3">
                            <span className="font-mono text-[10px] font-bold text-indigo-600 block">
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

      {/* Dialog Edit Hasil Opname Owner */}
      <Dialog 
        open={editModal.isOpen} 
        onOpenChange={(open) => {
          if (!isSavingEdit) {
            setEditModal((prev) => ({ ...prev, isOpen: open }));
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-[2rem] p-6 bg-white border-none shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
                <Pencil className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black uppercase italic text-slate-900">
                  Edit Hasil Stock Opname
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-bold mt-0.5">
                  Koreksi hasil opname fisik secara langsung oleh Owner &bull; {editModal.type === "container" ? "Opname Kontainer" : "Opname Gudang"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-1 flex-1 py-2 custom-scrollbar">
            {/* Material Info Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="inline-flex px-2 py-0.5 rounded-lg bg-indigo-50 font-mono text-[10px] font-bold text-indigo-700 border border-indigo-200">
                  {editModal.materialCode}
                </span>
                <h3 className="text-sm sm:text-base font-black uppercase text-slate-900 mt-1">
                  {editModal.materialNama}
                </h3>
              </div>
              <div className="text-right sm:self-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Periode Opname
                </span>
                <span className="text-xs font-black text-slate-700">
                  {editModal.entryDateLabel}
                </span>
              </div>
            </div>

            {/* Edit Form per Branch */}
            <div className="space-y-3">
              {editModal.branches.map((br, index) => {
                const isContainer = editModal.type === "container";
                const diffBulk = (br.afterBulk || 0) - (br.beforeBulk || 0);
                const diffAktif = (br.afterAktif || 0) - (br.beforeAktif || 0);
                const diffGudang = (br.afterQtyBesar || 0) - (br.beforeQtyBesar || 0);

                return (
                  <div 
                    key={index}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-white shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border",
                          br.badgeColor || "bg-slate-100 text-slate-800 border-slate-200"
                        )}>
                          {br.branchName}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 font-bold">
                        ID: {br.entryId ? `${br.entryId.substring(0, 10)}...` : "-"}
                      </span>
                    </div>

                    {isContainer ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Bulk Input */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                              Bulk (Hasil Opname)
                            </label>
                            <span className="text-[9px] font-bold text-slate-400">
                              Sistem: {formatNumber(br.beforeBulk)} {editModal.unitBulk}
                            </span>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={br.afterBulk}
                              onChange={(e) => {
                                const val = cleanNumber(e.target.value);
                                setEditModal((prev) => {
                                  const newBranches = [...prev.branches];
                                  newBranches[index] = { ...newBranches[index], afterBulk: val };
                                  return { ...prev, branches: newBranches };
                                });
                              }}
                              className="h-10 rounded-xl bg-white border-slate-200 text-sm font-black text-slate-900 pr-14"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                              {editModal.unitBulk}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-bold">Selisih:</span>
                            <span className={cn(
                              "font-black",
                              diffBulk > 0 ? "text-emerald-600" : diffBulk < 0 ? "text-rose-600" : "text-slate-500"
                            )}>
                              {diffBulk > 0 ? `+${formatNumber(diffBulk)}` : formatNumber(diffBulk)} {editModal.unitBulk}
                            </span>
                          </div>
                        </div>

                        {/* Aktif Input */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                              Aktif (Hasil Opname)
                            </label>
                            <span className="text-[9px] font-bold text-slate-400">
                              Sistem: {formatNumber(br.beforeAktif)} {editModal.unitAktif}
                            </span>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={br.afterAktif}
                              onChange={(e) => {
                                const val = cleanNumber(e.target.value);
                                setEditModal((prev) => {
                                  const newBranches = [...prev.branches];
                                  newBranches[index] = { ...newBranches[index], afterAktif: val };
                                  return { ...prev, branches: newBranches };
                                });
                              }}
                              className="h-10 rounded-xl bg-white border-slate-200 text-sm font-black text-slate-900 pr-14"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                              {editModal.unitAktif}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 font-bold">Selisih:</span>
                            <span className={cn(
                              "font-black",
                              diffAktif > 0 ? "text-emerald-600" : diffAktif < 0 ? "text-rose-600" : "text-slate-500"
                            )}>
                              {diffAktif > 0 ? `+${formatNumber(diffAktif)}` : formatNumber(diffAktif)} {editModal.unitAktif}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Warehouse Input */
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                            Hasil Opname Gudang
                          </label>
                          <span className="text-[9px] font-bold text-slate-400">
                            Sistem: {formatNumber(br.beforeQtyBesar)} {editModal.unitBesar}
                          </span>
                        </div>
                        <div className="relative">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={br.afterQtyBesar}
                            onChange={(e) => {
                              const val = cleanNumber(e.target.value);
                              setEditModal((prev) => {
                                const newBranches = [...prev.branches];
                                newBranches[index] = { ...newBranches[index], afterQtyBesar: val };
                                return { ...prev, branches: newBranches };
                              });
                            }}
                            className="h-10 rounded-xl bg-white border-slate-200 text-sm font-black text-slate-900 pr-14"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                            {editModal.unitBesar}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-bold">Selisih:</span>
                          <span className={cn(
                            "font-black",
                            diffGudang > 0 ? "text-emerald-600" : diffGudang < 0 ? "text-rose-600" : "text-slate-500"
                          )}>
                            {diffGudang > 0 ? `+${formatNumber(diffGudang)}` : formatNumber(diffGudang)} {editModal.unitBesar}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
              disabled={isSavingEdit}
              className="rounded-xl border-slate-200 text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSaveEditOpname}
              disabled={isSavingEdit}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md shadow-amber-500/20"
            >
              {isSavingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Simpan Hasil Opname
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus Opnam */}
      <Dialog open={!!deleteConfirmEntry} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteConfirmEntry(null); }}>
        <DialogContent className="max-w-md rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-inner">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-slate-900">
                  Apakah anda yakin menghapus ini?
                </DialogTitle>
                <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
                  Data opnam tanggal <span className="font-black text-slate-800">{deleteConfirmEntry?.dateLabel || "-"}</span> ({deleteConfirmEntry?.note || "Finalisasi Opnam Harian"}) akan dihapus secara permanen.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 text-xs font-medium text-slate-600 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold">Kategori Opnam</span>
              <span className="font-black uppercase text-slate-800">
                {deleteConfirmEntry?.type === "container" ? "Stok Kontainer Harian" : "Stok Gudang"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold">Tanggal</span>
              <span className="font-black text-slate-800">{deleteConfirmEntry?.dateLabel || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold">Total Bahan Baku</span>
              <span className="font-black text-slate-800">{deleteConfirmEntry?.itemCount || 0} Bahan</span>
            </div>
            <div className="pt-2 border-t border-slate-200/60 text-[11px] text-amber-700 font-bold">
              ⚠️ Riwayat penyimpanan di menu Karyawan (<span className="font-mono text-[10px]">/employee/opnam-harian</span>) juga akan ikut terhapus.
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmEntry(null)}
              disabled={isDeleting}
              className="rounded-xl border-slate-200 text-xs font-bold px-5"
            >
              Tidak
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteEntry}
              disabled={isDeleting}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-6 shadow-md shadow-rose-500/20"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menghapus...
                </>
              ) : (
                "Iya"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
