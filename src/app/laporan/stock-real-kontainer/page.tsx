"use client";

import React, { useState, useMemo } from "react";
import { 
  Boxes, 
  Calendar as CalendarIcon, 
  Search, 
  RotateCcw, 
  FileSpreadsheet, 
  FileDown, 
  PackageCheck, 
  Truck, 
  ShoppingBag, 
  Clock, 
  RefreshCw,
  Info
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  useFirestore, 
  useConsolidatedCollection, 
  useConsolidatedWarehouseCollection,
  useDoc, 
  useMemoFirebase, 
  doc 
} from "@/firebase";
import { 
  useActiveBranch, 
  BRANCH_LIST, 
  normalizeBranchId, 
  filterContainerMaterials,
  getStoreConfigDocId,
  BranchId
} from "@/lib/branch-helper";
import { SHARED_MATERIAL_ALIASES, normalizeMaterialName } from "@/lib/material-mapping";
import { query, orderBy } from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyBesar?: number | string;
  qtyGudangKecil?: number | string;
  qtyKecil?: number | string;
  qtyKontainerBesar?: number | string;
  qtyKontainerKecil?: number | string;
  currentPrice?: number | string;
  hargaBeliSatuanBesar?: number | string;
  _branchId?: string;
  _branchName?: string;
  _warehouseId?: string;
  _warehouseName?: string;
  isFromTehWarga?: boolean;
  originalTwCode?: string;
  metodePembelian?: string;
  [key: string]: unknown;
}

interface BranchPill {
  id: 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong';
  shortName: string;
  badgeColor: string;
}

interface StockRealRow {
  key: string;
  id: string;
  code: string;
  nama: string;
  satuanBesar: string;
  satuanKecil: string;
  konversi: number;
  // Col 3: Opname Hari Sebelumnya
  opnamePrevBulk: number;
  opnamePrevAktif: number;
  opnamePrevDateStr: string;
  // Col 4: Pengambilan Gudang Utama
  ambilGudangBulk: number;
  ambilGudangAktif: number;
  ambilGudangNotaCount: number;
  // Col 5: Belanja Rute (Karyawan & Owner)
  belanjaRuteBulk: number;
  belanjaRuteAktif: number;
  belanjaRuteNotaCount: number;
  // Real-Time Total (Kontainer)
  estimasiBulk: number;
  estimasiAktif: number;
  // Current Master Stock
  currentMasterBulk: number;
  currentMasterAktif: number;
  // Stok Gudang Utama
  gudangBulk: number;
  gudangKecil: number;
  // Total Gudang + Container
  totalBulk: number;
  totalKecil: number;
  // Target branches
  targetBranches: BranchPill[];
}

const adjustNegativeSmallStock = (qtyBulk: number, qtyKecilVal: number, konversi: number) => {
  if (qtyKecilVal < 0 && qtyBulk > 0) {
    const totalKecilEquivalent = (qtyBulk * konversi) + qtyKecilVal;
    if (totalKecilEquivalent >= 0) {
      const adjustedBulk = Math.floor(totalKecilEquivalent / konversi);
      const adjustedKecil = Math.round((totalKecilEquivalent - (adjustedBulk * konversi)) * 100) / 100;
      return { bulk: adjustedBulk, kecil: adjustedKecil };
    } else {
      return { bulk: 0, kecil: Math.round(totalKecilEquivalent * 100) / 100 };
    }
  }
  return { bulk: qtyBulk, kecil: qtyKecilVal };
};

interface RawOpnameItem {
  id?: string;
  code?: string;
  nama?: string;
  grams?: number | string;
  before?: { qtyKontainerBesar?: number | string; qtyKontainerKecil?: number | string };
  after?: { qtyKontainerBesar?: number | string; qtyKontainerKecil?: number | string; grams?: number | string };
  afterBulk?: number | string;
  afterAktif?: number | string;
}

interface RawOpnameDoc {
  id?: string;
  date?: unknown;
  items?: RawOpnameItem[];
  _branchId?: string;
  _branchName?: string;
  branch?: string;
  branchId?: string;
  cabang?: string;
}

interface RawLogItem {
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  id?: string;
  code?: string;
  nama?: string;
  qty?: number | string;
  qtyKecil?: number | string;
  totalQtyKecil?: number | string;
  unit?: string;
}

interface RawLogDoc {
  id?: string;
  tanggal?: string;
  createdAt?: unknown;
  type?: string;
  purchaseType?: string;
  items?: RawLogItem[];
  _branchId?: string;
  branchId?: string;
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

const parseDateString = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") {
    if (value.includes("T")) return value.split("T")[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as { toDate?: () => Date; seconds?: number };
    if (typeof obj.toDate === "function") {
      const d = obj.toDate();
      return d.toISOString().split("T")[0];
    }
    if (typeof obj.seconds === "number") {
      const d = new Date(obj.seconds * 1000);
      return d.toISOString().split("T")[0];
    }
  }
  return "";
};

const compareMaterialCode = (codeA?: string, codeB?: string, nameA?: string, nameB?: string) => {
  const cA = (codeA || "").trim();
  const cB = (codeB || "").trim();
  if (cA && cB && cA !== "-" && cB !== "-") {
    return cA.localeCompare(cB, undefined, { numeric: true, sensitivity: "base" });
  }
  return (nameA || "").localeCompare(nameB || "");
};

export default function LaporanStockRealKontainerPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();

  // Date Filter (default today)
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>("all");

  // 1. Fetch Materials across active branch or all stores
  const { data: rawMaterials, loading: loadingMaterials } = useConsolidatedCollection(
    db,
    "bahan-baku",
    (ref) => query(ref, orderBy("code", "asc"))
  );

  // 2. Fetch Opname History
  const { data: rawOpnames, loading: loadingOpnames } = useConsolidatedCollection(
    db,
    "opnam_harian",
    (ref) => query(ref, orderBy("date", "desc"))
  );

  // 3. Fetch Purchase & Transfer Logs (log_pembelian_bahan)
  const { data: rawLogs, loading: loadingLogs } = useConsolidatedCollection(
    db,
    "log_pembelian_bahan",
    (ref) => query(ref, orderBy("createdAt", "desc"))
  );

  // 4. Fetch Gudang Utama Materials (data /stok/bahan-baku - Gudang Utama)
  const { data: rawWarehouseMaterials, loading: loadingWarehouse } = useConsolidatedWarehouseCollection<BahanBaku>(
    db,
    "bahan-baku",
    (ref) => query(ref, orderBy("code", "asc"))
  );

  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);

  // Gudang Utama Stock Mapping
  const warehouseStockMap = useMemo(() => {
    const map: Record<string, { bulk: number; kecil: number; konversi: number }> = {};
    if (!rawWarehouseMaterials) return map;

    (rawWarehouseMaterials as BahanBaku[]).forEach((mat) => {
      const konversi = Number(mat.qtyKecil || 1);
      const rawBulk = Number(mat.qtyBesar || 0);
      const rawKecil = Number(mat.qtyGudangKecil || 0);

      const adjusted = adjustNegativeSmallStock(rawBulk, rawKecil, konversi);
      const bulk = adjusted.bulk;
      const kecil = adjusted.kecil;

      const idKey = String(mat.id || "").trim().toLowerCase();
      const codeKey = String(mat.code || "").trim().toLowerCase();
      const nameKey = normalizeMaterialName(mat.nama || "");

      const addStock = (k: string) => {
        if (!k) return;
        if (!map[k]) {
          map[k] = { bulk, kecil, konversi };
        } else {
          if (activeBranch === "all") {
            map[k].bulk += bulk;
            map[k].kecil += kecil;
          } else {
            map[k] = { bulk, kecil, konversi };
          }
        }
      };

      if (idKey) addStock(idKey);
      if (codeKey && codeKey !== "-") addStock(codeKey);
      if (nameKey && nameKey !== "-") addStock(nameKey);
    });

    return map;
  }, [rawWarehouseMaterials, activeBranch]);

  // Store Usage Map (Peruntukan Toko)
  const materialStoreUsageMap = useMemo(() => {
    const map: Record<string, Set<'gdm' | 'kedungreja' | 'tehwarga' | 'gembong'>> = {};

    const addUsage = (key: string, branch: 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong') => {
      const k = key.trim().toLowerCase();
      if (!k) return;
      if (!map[k]) map[k] = new Set();
      map[k].add(branch);
    };

    (rawMaterials as BahanBaku[])?.forEach((mat) => {
      const bId = normalizeBranchId(mat._branchId || 'gdm') as 'gdm' | 'kedungreja' | 'tehwarga' | 'gembong';
      if ((bId === 'gdm' || bId === 'gembong') && (mat.isFromTehWarga || mat.originalTwCode || /^BB-0(0[1-9]|[1-4][0-9])$/i.test(mat.code || ''))) {
        return;
      }
      if (mat.nama) addUsage(mat.nama, bId);
      if (mat.code) addUsage(mat.code, bId);
    });

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
  }, [rawMaterials]);

  // Filtered Materials based on Active Branch
  const filteredMaterials = useMemo((): BahanBaku[] => {
    const list = (rawMaterials as BahanBaku[]) || [];
    if (activeBranch === 'all') {
      return list;
    }
    if (activeBranch === 'kedungreja' || activeBranch === 'tehwarga' || activeBranch === 'gembong') {
      return list;
    }
    // For GDM container, isolate Zona Waktu materials (filter out Teh Warga items)
    return filterContainerMaterials(list, 'gdm');
  }, [rawMaterials, activeBranch]);

  // Unique material names for dropdown filter
  const allUniqueMaterialNames = useMemo(() => {
    const set = new Set<string>();
    filteredMaterials.forEach((mat) => {
      if (mat.nama && mat.nama !== "-") {
        set.add(mat.nama);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredMaterials]);

  // Aggregate Previous Opname Data (Strictly prior to selectedDate, or latest available prior opname per branch)
  const previousOpnameMap = useMemo(() => {
    const map: Record<string, { bulk: number; aktif: number; dateStr: string }> = {};
    if (!rawOpnames) return map;

    // Find the latest prior opname entry per branch (before selectedDate)
    const latestPriorOpnamePerBranch: Record<string, RawOpnameDoc> = {};

    (rawOpnames as RawOpnameDoc[]).forEach((opDoc) => {
      const opDate = parseDateString(opDoc.date);
      if (!opDate || opDate >= selectedDate) return;
      const bId = normalizeBranchId(opDoc._branchId || opDoc.branch || opDoc.branchId || opDoc.cabang || 'gdm');

      if (activeBranch !== 'all' && bId !== activeBranch) return;

      if (!latestPriorOpnamePerBranch[bId]) {
        latestPriorOpnamePerBranch[bId] = opDoc;
      } else {
        const existingDate = parseDateString(latestPriorOpnamePerBranch[bId].date);
        if (opDate > existingDate) {
          latestPriorOpnamePerBranch[bId] = opDoc;
        }
      }
    });

    // If no opname strictly before selectedDate was found, fall back to the latest opname document in history for that branch
    const targetBranchesToInspect: BranchId[] = 
      activeBranch === 'all' 
        ? ['gdm', 'kedungreja', 'tehwarga', 'gembong'] 
        : [activeBranch];

    targetBranchesToInspect.forEach((bId) => {
      if (!latestPriorOpnamePerBranch[bId]) {
        const fallback = (rawOpnames as RawOpnameDoc[]).find((opDoc) => normalizeBranchId(opDoc._branchId || opDoc.branch || opDoc.branchId || opDoc.cabang || 'gdm') === bId);
        if (fallback) {
          latestPriorOpnamePerBranch[bId] = fallback;
        }
      }
    });

    // Populate previousOpnameMap from the selected opnames
    Object.values(latestPriorOpnamePerBranch).forEach((opDoc: RawOpnameDoc) => {
      const opDate = parseDateString(opDoc.date);
      const items = opDoc.items || [];
      items.forEach((item: RawOpnameItem) => {
        const idKey = String(item.id || "").trim().toLowerCase();
        const codeKey = String(item.code || "").trim().toLowerCase();
        const nameKey = String(item.nama || "").trim().toLowerCase();

        const bulkVal = cleanNumber(item.after?.qtyKontainerBesar ?? item.afterBulk ?? item.before?.qtyKontainerBesar ?? 0);
        let aktifVal = 0;
        if (item.grams !== undefined && item.grams !== null) {
          aktifVal = Math.max(0, cleanNumber(item.grams));
        } else if (item.after?.grams !== undefined && item.after?.grams !== null) {
          aktifVal = Math.max(0, cleanNumber(item.after.grams));
        } else {
          aktifVal = cleanNumber(item.after?.qtyKontainerKecil ?? item.afterAktif ?? 0);
        }

        const assignOrAccumulate = (k: string) => {
          if (!k) return;
          if (!map[k]) {
            map[k] = { bulk: bulkVal, aktif: aktifVal, dateStr: opDate };
          } else {
            // When in 'all' mode, accumulate quantities from multiple branches
            if (activeBranch === 'all') {
              map[k].bulk += bulkVal;
              map[k].aktif += aktifVal;
            } else {
              map[k] = { bulk: bulkVal, aktif: aktifVal, dateStr: opDate };
            }
          }
        };

        if (idKey) assignOrAccumulate(idKey);
        if (codeKey && codeKey !== "-") assignOrAccumulate(codeKey);
        if (nameKey && nameKey !== "-") assignOrAccumulate(nameKey);
      });
    });

    return map;
  }, [rawOpnames, selectedDate, activeBranch]);

  // Aggregate Pengambilan Gudang & Belanja Rute on Selected Date
  const { pengambilanGudangMap, belanjaRuteMap, totalAmbilCount, totalBelanjaCount } = useMemo(() => {
    const ambilMap: Record<string, { bulk: number; aktif: number; count: number }> = {};
    const belanjaMap: Record<string, { bulk: number; aktif: number; count: number }> = {};
    let ambilCnt = 0;
    let belanjaCnt = 0;

    if (rawLogs) {
      (rawLogs as RawLogDoc[]).forEach((log) => {
        const logDate = parseDateString(log.tanggal || log.createdAt);
        if (logDate !== selectedDate) return;

        const logBranch = normalizeBranchId(log._branchId || log.branchId || 'gdm');
        if (activeBranch !== 'all' && logBranch !== activeBranch) return;

        const isAmbilGudang = 
          log.type === "ambil-gudang" || 
          log.type === "transfer_gudang_ke_kontainer";

        const isBelanja = 
          log.type === "belanja" || 
          log.type === "beli-sendiri" || 
          log.type === "supplier" || 
          log.type === "belanja-pasar" || 
          log.purchaseType === "belanja" || 
          log.purchaseType === "beli-sendiri";

        const items = log.items || [];

        if (isAmbilGudang) {
          ambilCnt++;
          items.forEach((it: RawLogItem) => {
            const idKey = String(it.materialId || it.id || "").trim().toLowerCase();
            const codeKey = String(it.materialCode || it.code || "").trim().toLowerCase();
            const nameKey = String(it.materialName || it.nama || "").trim().toLowerCase();
            const qty = cleanNumber(it.qty);

            const addAmbil = (k: string) => {
              if (!k) return;
              if (!ambilMap[k]) ambilMap[k] = { bulk: 0, aktif: 0, count: 0 };
              ambilMap[k].bulk += qty;
              ambilMap[k].count += 1;
            };

            if (idKey) addAmbil(idKey);
            if (codeKey && codeKey !== "-") addAmbil(codeKey);
            if (nameKey && nameKey !== "-") addAmbil(nameKey);
          });
        } else if (isBelanja) {
          belanjaCnt++;
          items.forEach((it: RawLogItem) => {
            const idKey = String(it.materialId || it.id || "").trim().toLowerCase();
            const codeKey = String(it.materialCode || it.code || "").trim().toLowerCase();
            const nameKey = String(it.materialName || it.nama || "").trim().toLowerCase();
            const qtyBulk = cleanNumber(it.qty);
            const qtyAktif = cleanNumber(it.totalQtyKecil ?? it.qtyKecil ?? 0);

            const addBelanja = (k: string) => {
              if (!k) return;
              if (!belanjaMap[k]) belanjaMap[k] = { bulk: 0, aktif: 0, count: 0 };
              belanjaMap[k].bulk += qtyBulk;
              belanjaMap[k].aktif += qtyAktif;
              belanjaMap[k].count += 1;
            };

            if (idKey) addBelanja(idKey);
            if (codeKey && codeKey !== "-") addBelanja(codeKey);
            if (nameKey && nameKey !== "-") addBelanja(nameKey);
          });
        }
      });
    }

    return { 
      pengambilanGudangMap: ambilMap, 
      belanjaRuteMap: belanjaMap,
      totalAmbilCount: ambilCnt,
      totalBelanjaCount: belanjaCnt
    };
  }, [rawLogs, selectedDate, activeBranch]);

  // Combine rows into consolidated Real-Time Stock Matrix
  const tableRows = useMemo((): StockRealRow[] => {
    const groupedMap: Record<string, StockRealRow> = {};

    filteredMaterials.forEach((mat) => {
      // In single branch mode, use unique material id/code as key
      // In 'all' mode, group by canonical material name/key
      const key = activeBranch === 'all' 
        ? String(mat.nama || mat.code || mat.id || "").trim().toLowerCase()
        : String(mat.id || mat.code || mat.nama || "").trim().toLowerCase();
        
      if (!key) return;

      const matIdKey = String(mat.id || "").trim().toLowerCase();
      const matCodeKey = String(mat.code || "").trim().toLowerCase();
      const matNameKey = String(mat.nama || "").trim().toLowerCase();

      // Lookups
      const prevOpname = 
        previousOpnameMap[matIdKey] || 
        previousOpnameMap[matCodeKey] || 
        previousOpnameMap[matNameKey] || 
        { bulk: 0, aktif: 0, dateStr: "-" };

      const ambilGudang = 
        pengambilanGudangMap[matIdKey] || 
        pengambilanGudangMap[matCodeKey] || 
        pengambilanGudangMap[matNameKey] || 
        { bulk: 0, aktif: 0, count: 0 };

      const belanjaRute = 
        belanjaRuteMap[matIdKey] || 
        belanjaRuteMap[matCodeKey] || 
        belanjaRuteMap[matNameKey] || 
        { bulk: 0, aktif: 0, count: 0 };

      const curBulk = cleanNumber(mat.qtyKontainerBesar);
      const curAktif = cleanNumber(mat.qtyKontainerKecil);

      // Look up Gudang Utama Stock (/stok/bahan-baku - Gudang Utama)
      const normMatName = normalizeMaterialName(mat.nama || "");
      const matCodeLower = (mat.code || "").trim().toLowerCase();
      const matIdLower = (mat.id || "").trim().toLowerCase();

      const alias = SHARED_MATERIAL_ALIASES.find(a => 
        normalizeMaterialName(a.canonicalName) === normMatName ||
        a.aliases.some(al => normalizeMaterialName(al) === normMatName) ||
        (a.twCode && a.twCode.toLowerCase() === matCodeLower) ||
        (a.gdmCode && a.gdmCode.toLowerCase() === matCodeLower)
      );

      let whStock = warehouseStockMap[matIdLower] 
        || (matCodeLower && matCodeLower !== "-" ? warehouseStockMap[matCodeLower] : undefined)
        || (normMatName ? warehouseStockMap[normMatName] : undefined);

      if (!whStock && alias) {
        whStock = warehouseStockMap[normalizeMaterialName(alias.canonicalName)]
          || (alias.gdmCode ? warehouseStockMap[alias.gdmCode.toLowerCase()] : undefined);
      }

      const gdBulk = whStock ? whStock.bulk : 0;
      const gdKecil = whStock ? whStock.kecil : 0;
      const konversi = Number(mat.qtyKecil || whStock?.konversi || 1);

      if (!groupedMap[key]) {
        groupedMap[key] = {
          key,
          id: mat.id,
          code: mat.code || "-",
          nama: mat.nama || "-",
          satuanBesar: mat.satuanBesar || "",
          satuanKecil: mat.satuanKecil || "",
          konversi,
          opnamePrevBulk: prevOpname.bulk,
          opnamePrevAktif: prevOpname.aktif,
          opnamePrevDateStr: prevOpname.dateStr,
          ambilGudangBulk: ambilGudang.bulk,
          ambilGudangAktif: ambilGudang.aktif,
          ambilGudangNotaCount: ambilGudang.count,
          belanjaRuteBulk: belanjaRute.bulk,
          belanjaRuteAktif: belanjaRute.aktif,
          belanjaRuteNotaCount: belanjaRute.count,
          estimasiBulk: 0,
          estimasiAktif: 0,
          currentMasterBulk: curBulk,
          currentMasterAktif: curAktif,
          gudangBulk: gdBulk,
          gudangKecil: gdKecil,
          totalBulk: 0,
          totalKecil: 0,
          targetBranches: [],
        };
      } else {
        // Accumulate for same materials across multiple branches in 'all' mode
        groupedMap[key].opnamePrevBulk += prevOpname.bulk;
        groupedMap[key].opnamePrevAktif += prevOpname.aktif;
        groupedMap[key].ambilGudangBulk += ambilGudang.bulk;
        groupedMap[key].ambilGudangAktif += ambilGudang.aktif;
        groupedMap[key].belanjaRuteBulk += belanjaRute.bulk;
        groupedMap[key].belanjaRuteAktif += belanjaRute.aktif;
        groupedMap[key].currentMasterBulk += curBulk;
        groupedMap[key].currentMasterAktif += curAktif;
        if (groupedMap[key].gudangBulk === 0 && gdBulk > 0) {
          groupedMap[key].gudangBulk = gdBulk;
          groupedMap[key].gudangKecil = gdKecil;
        }
        if (konversi > 1 && groupedMap[key].konversi <= 1) {
          groupedMap[key].konversi = konversi;
        }
      }
    });

    let result = Object.values(groupedMap);
    result.forEach((r) => {
      // Calculate real-time estimated stock (container)
      r.estimasiBulk = r.opnamePrevBulk + r.ambilGudangBulk + r.belanjaRuteBulk;
      r.estimasiAktif = r.opnamePrevAktif + r.belanjaRuteAktif;

      // Calculate Total Gudang + Container (Estimasi Stok Real-Time + Stok Gudang Utama)
      const konv = r.konversi > 0 ? r.konversi : 1;
      const rawBulk = r.estimasiBulk + r.gudangBulk;
      const rawKecil = r.estimasiAktif + r.gudangKecil;

      if (konv > 1) {
        const totalKecilEquivalent = (rawBulk * konv) + rawKecil;
        if (totalKecilEquivalent >= 0) {
          r.totalBulk = Math.floor(totalKecilEquivalent / konv);
          r.totalKecil = Math.round((totalKecilEquivalent % konv) * 100) / 100;
        } else {
          r.totalBulk = 0;
          r.totalKecil = Math.round(totalKecilEquivalent * 100) / 100;
        }
      } else {
        r.totalBulk = rawBulk;
        r.totalKecil = rawKecil;
      }

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
          shortName: b === 'gdm' ? 'Zona GDM' : b === 'kedungreja' ? 'Kedungreja' : b === 'gembong' ? 'Zona Gembong' : 'Teh Warga',
          badgeColor: BRANCH_LIST[b]?.badgeColor || ''
        }));
    });

    // Filter by Selected Material Name
    if (selectedMaterialName !== "all") {
      result = result.filter(
        (r) => r.nama.toLowerCase() === selectedMaterialName.toLowerCase()
      );
    }

    // Filter by Search Term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) => r.nama.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    }

    // Sort ascending by Material Code (BB001 -> BB002 ... -> BB066, etc.)
    return result.sort((a, b) => compareMaterialCode(a.code, b.code, a.nama, b.nama));
  }, [
    filteredMaterials, 
    previousOpnameMap, 
    pengambilanGudangMap, 
    belanjaRuteMap, 
    warehouseStockMap,
    materialStoreUsageMap, 
    selectedMaterialName,
    searchTerm,
    activeBranch
  ]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = tableRows.map((r, idx) => ({
      "No": idx + 1,
      "Kode": r.code,
      "Nama Bahan": r.nama,
      "Opname Kemarin (Bulk)": `${r.opnamePrevBulk} ${r.satuanBesar || ""}`.trim(),
      "Opname Kemarin (Aktif)": `${r.opnamePrevAktif} ${r.satuanKecil || ""}`.trim(),
      "Pengambilan Gudang (Bulk)": `${r.ambilGudangBulk} ${r.satuanBesar || ""}`.trim(),
      "Belanja Rute (Bulk)": `${r.belanjaRuteBulk} ${r.satuanBesar || ""}`.trim(),
      "Belanja Rute (Aktif)": `${r.belanjaRuteAktif} ${r.satuanKecil || ""}`.trim(),
      "Estimasi Stok Real-Time (Bulk)": `${r.estimasiBulk} ${r.satuanBesar || ""}`.trim(),
      "Estimasi Stok Real-Time (Aktif)": `${r.estimasiAktif} ${r.satuanKecil || ""}`.trim(),
      "Stok Master Sistem Saat Ini": `${r.currentMasterBulk} ${r.satuanBesar} / ${r.currentMasterAktif} ${r.satuanKecil}`,
      "Stok Gudang Utama": `${r.gudangBulk} ${r.satuanBesar}${r.gudangKecil > 0 ? ` / ${r.gudangKecil} ${r.satuanKecil}` : ""}`,
      "Total Gudang + Container": `${r.totalBulk} ${r.satuanBesar}${r.totalKecil > 0 ? ` / ${r.totalKecil} ${r.satuanKecil}` : ""}`,
      "Peruntukan Toko": r.targetBranches.map((b) => b.shortName).join(", "),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Real Kontainer");
    XLSX.writeFile(wb, `Laporan_Stock_Real_Kontainer_${BRANCH_LIST[activeBranch]?.shortName || "Semua_Toko"}_${selectedDate || "today"}.xlsx`);
  };

  // Export to PDF
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

    const pageWidth = 297;
    const centerX = pageWidth / 2;

    docPDF.setFontSize(15);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("LAPORAN STOCK REAL KONTAINER (REAL-TIME)", centerX, 18, { align: "center" });
    
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(
      `Tanggal Pantau: ${selectedDate} • Cabang: ${BRANCH_LIST[activeBranch]?.name || "Semua Cabang"} • Dicetak: ${new Date().toLocaleDateString("id-ID")}`,
      centerX,
      24,
      { align: "center" }
    );
    docPDF.setDrawColor(203, 213, 225);
    docPDF.line(15, 28, pageWidth - 15, 28);

    autoTable(docPDF, {
      head: [
        [
          "No",
          "Kode",
          "Nama Bahan",
          "Opname Kemarin\n(Bulk / Aktif)",
          "Ambil Gudang\n(Bulk)",
          "Belanja Rute\n(Bulk / Aktif)",
          "Estimasi Real-Time\n(Bulk / Aktif)",
          "Stok Sistem\n(Master)",
          "Stok Gudang\n(Utama)",
          "Total Gudang\n+ Kontainer",
          "Peruntukan",
        ],
      ],
      body: tableRows.map((r, idx) => [
        idx + 1,
        r.code,
        r.nama,
        `${formatNumber(r.opnamePrevBulk)} ${r.satuanBesar} / ${formatNumber(r.opnamePrevAktif)} ${r.satuanKecil}`,
        r.ambilGudangBulk > 0 ? `+${formatNumber(r.ambilGudangBulk)} ${r.satuanBesar}` : "-",
        r.belanjaRuteBulk > 0 || r.belanjaRuteAktif > 0 
          ? `+${formatNumber(r.belanjaRuteBulk)} ${r.satuanBesar} / +${formatNumber(r.belanjaRuteAktif)} ${r.satuanKecil}` 
          : "-",
        `${formatNumber(r.estimasiBulk)} ${r.satuanBesar} / ${formatNumber(r.estimasiAktif)} ${r.satuanKecil}`,
        `${formatNumber(r.currentMasterBulk)} ${r.satuanBesar} / ${formatNumber(r.currentMasterAktif)} ${r.satuanKecil}`,
        `${formatNumber(r.gudangBulk)} ${r.satuanBesar}${r.gudangKecil > 0 ? ` / ${formatNumber(r.gudangKecil)} ${r.satuanKecil}` : ""}`,
        `${formatNumber(r.totalBulk)} ${r.satuanBesar}${r.totalKecil > 0 ? ` / ${formatNumber(r.totalKecil)} ${r.satuanKecil}` : ""}`,
        r.targetBranches.map((b) => b.shortName).join(", "),
      ]),
      startY: 34,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], halign: "center", fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 7, halign: "center" },
        1: { cellWidth: 14, fontStyle: "bold" },
        2: { cellWidth: 36 },
        3: { cellWidth: 24, halign: "right" },
        4: { cellWidth: 20, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        7: { cellWidth: 24, halign: "right" },
        8: { cellWidth: 24, halign: "right" },
        9: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        10: { cellWidth: 26 },
      },
    });

    docPDF.save(`Laporan_Stock_Real_Kontainer_${BRANCH_LIST[activeBranch]?.shortName || "Semua_Toko"}_${selectedDate}.pdf`);
  };

  const isLoading = loadingMaterials || loadingOpnames || loadingLogs || loadingWarehouse;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* 1. Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 mb-1">
            <Boxes className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Real-Time Stock Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-slate-900 leading-tight">
            Stock Real Kontainer
          </h1>
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-slate-500 mt-0.5">
            Monitoring posisi stok real-time (Opname Sebelumnya + Ambil Gudang + Belanja Rute) • {BRANCH_LIST[activeBranch]?.name || "Semua Toko"}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
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

      {/* 2. Filter & Toolbar Card */}
      <Card className="rounded-2xl sm:rounded-3xl border border-slate-100 bg-white p-3.5 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick Date Picker & Date Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tanggal Pantau:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>

            <Button
              variant={selectedDate === todayStr ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDate(todayStr)}
              className={cn(
                "h-9 rounded-xl text-[9px] font-black uppercase tracking-wider px-3",
                selectedDate === todayStr ? "bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              Hari Ini
            </Button>

            {selectedDate !== todayStr && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDate(todayStr)}
                className="h-9 px-2.5 rounded-xl text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset ke Hari Ini
              </Button>
            )}
          </div>

          {/* Material Name Filter & Search Box */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Dropdown Nama Bahan */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Nama Bahan:</span>
              <select
                value={selectedMaterialName}
                onChange={(e) => setSelectedMaterialName(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer max-w-[200px] truncate"
              >
                <option value="all">Semua Bahan Baku ({allUniqueMaterialNames.length})</option>
                {allUniqueMaterialNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Quick Search */}
            <div className="relative flex-1 min-w-[200px] lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Cari kode atau nama bahan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-7 h-9 rounded-xl border-slate-200 bg-slate-50/50 text-xs font-bold text-slate-800 focus-visible:ring-primary"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {(selectedMaterialName !== "all" || searchTerm.trim()) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedMaterialName("all");
                  setSearchTerm("");
                }}
                className="h-9 px-2.5 rounded-xl text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 gap-1"
              >
                Reset Filter
              </Button>
            )}
          </div>
        </div>

        {/* Informative Banner */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[10.5px] text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span>
              Stok Real-Time: <strong>Opname Kemarin</strong> + <strong>Ambil Gudang</strong> + <strong>Belanja Rute</strong> • <strong>Total Gudang + Kontainer</strong> = <strong>Estimasi Real-Time + Stok Gudang Utama</strong>.
            </span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 hidden sm:inline-block">
            {tableRows.length} Bahan Terpantau ({BRANCH_LIST[activeBranch]?.shortName || "Semua Cabang"})
          </span>
        </div>
      </Card>

      {/* 3. Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rounded-2xl sm:rounded-3xl border-none bg-white p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 truncate">Total Bahan</p>
            <p className="text-lg font-black text-slate-900">{tableRows.length} Item</p>
          </div>
        </Card>

        <Card className="rounded-2xl sm:rounded-3xl border-none bg-white p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 truncate">Ambil Gudang Hari Ini</p>
            <p className="text-lg font-black text-indigo-950">{totalAmbilCount} Mutasi</p>
          </div>
        </Card>

        <Card className="rounded-2xl sm:rounded-3xl border-none bg-white p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 truncate">Belanja Rute Masuk</p>
            <p className="text-lg font-black text-amber-950">{totalBelanjaCount} Transaksi</p>
          </div>
        </Card>

        <Card className="rounded-2xl sm:rounded-3xl border-none bg-white p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 truncate">Mode Pemantauan</p>
            <p className="text-lg font-black text-emerald-950">Real-Time</p>
          </div>
        </Card>
      </div>

      {/* 4. Main Matrix Table View (Desktop) & Cards (Mobile) */}
      <Card className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-50 bg-slate-50/40 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase italic text-slate-900">
                Matriks Stok Real Kontainer
              </h2>
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Posisi barang opname sebelumnya, pasokan gudang & belanja rute • {BRANCH_LIST[activeBranch]?.name || "Semua Toko"}
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-white px-3.5 py-2 sm:px-4 sm:py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 shadow-sm self-start md:self-auto">
            Tanggal Pantau: {selectedDate}
          </div>
        </div>

        {isLoading ? (
          <div className="px-6 py-20 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary opacity-30" />
            <span>Memuat data stok real kontainer...</span>
          </div>
        ) : tableRows.length === 0 ? (
          <div className="px-6 py-20 text-center text-sm text-slate-500">
            Tidak ada data bahan baku untuk cabang dan filter ini.
          </div>
        ) : (
          <div className="p-3 sm:p-4 md:p-6 space-y-4">
            {/* Desktop Table View */}
            <div className="overflow-x-auto hidden md:block rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <table className="w-full text-left border-collapse table-auto">
                <thead>
                  {/* Row 1: Header Grouping */}
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-[9px] font-black uppercase tracking-wider text-slate-700">
                    <th rowSpan={2} className="px-1.5 py-1.5 border-r border-slate-200 w-7 text-center align-middle bg-slate-200/70 text-slate-800">
                      No
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 border-r border-slate-200 w-14 text-center align-middle">
                      Kode
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 border-r border-slate-200 min-w-[120px] max-w-[150px] leading-tight align-middle text-left">
                      Nama<br />Bahan
                    </th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-blue-50 text-blue-900 text-[8.5px] leading-tight">
                      Opname<br />Kemarin
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center align-middle border-r border-slate-200 bg-indigo-50 text-indigo-900 font-black text-[8.5px] w-20 leading-tight">
                      Ambil<br />Gudang
                    </th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-amber-50 text-amber-900 text-[8.5px] leading-tight">
                      Belanja<br />Rute
                    </th>
                    <th colSpan={2} className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-emerald-900 text-white font-black text-[8.5px] leading-tight">
                      Estimasi<br />Real-Time
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center align-middle border-r border-slate-200 bg-slate-100 text-slate-800 font-black text-[8.5px] w-18 leading-tight">
                      Stok<br />Sistem
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center align-middle border-r border-slate-200 bg-cyan-100/90 text-cyan-950 font-black text-[8.5px] w-20 leading-tight">
                      Stok Gudang<br />Utama
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 text-center align-middle border-r border-slate-200 bg-emerald-100 text-emerald-950 font-black text-[8.5px] w-22 leading-tight">
                      Total Gudang<br />+ Container
                    </th>
                    <th rowSpan={2} className="px-1.5 py-1.5 w-[90px] text-center align-middle bg-slate-100 text-slate-800 font-black text-[8.5px] leading-tight">
                      Peruntukan<br />Toko
                    </th>
                  </tr>
                  {/* Row 2: Sub Columns */}
                  <tr className="border-b border-slate-200 bg-slate-50 text-[7.5px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-1 py-1 text-right bg-blue-50/50">Bulk</th>
                    <th className="px-1 py-1 text-right border-r border-slate-200 bg-blue-50/50">Aktif</th>
                    <th className="px-1 py-1 text-right bg-amber-50/50">Bulk</th>
                    <th className="px-1 py-1 text-right border-r border-slate-200 bg-amber-50/50">Aktif</th>
                    <th className="px-1 py-1 text-right bg-emerald-800 text-white">Bulk</th>
                    <th className="px-1 py-1 text-right border-r border-slate-200 bg-emerald-800 text-white">Aktif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10.5px]">
                  {tableRows.map((r, idx) => (
                    <tr key={r.key} className="hover:bg-slate-50/80 transition-colors">
                      {/* No Column */}
                      <td className="px-1.5 py-1.5 text-center font-bold text-slate-500 border-r border-slate-100 bg-slate-50/30 text-[9.5px]">
                        {idx + 1}
                      </td>
                      {/* Kode */}
                      <td className="px-1.5 py-1.5 text-center font-mono font-bold text-indigo-600 border-r border-slate-100 text-[9.5px] whitespace-nowrap">
                        {r.code}
                      </td>
                      {/* Nama Bahan */}
                      <td className="px-2 py-1.5 font-bold text-slate-900 uppercase border-r border-slate-100 text-[10px] max-w-[160px] truncate" title={r.nama}>
                        {r.nama}
                      </td>
                      {/* Opname Kemarin: Bulk */}
                      <td className="px-1 py-1.5 text-right font-medium text-slate-700 bg-blue-50/20 whitespace-nowrap">
                        {r.opnamePrevBulk > 0 ? (
                          <span>{formatNumber(r.opnamePrevBulk)} <span className="text-[8.5px] text-slate-400">{r.satuanBesar}</span></span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Opname Kemarin: Aktif */}
                      <td className="px-1 py-1.5 text-right font-medium text-slate-700 border-r border-slate-100 bg-blue-50/20 whitespace-nowrap">
                        {r.opnamePrevAktif > 0 ? (
                          <span>{formatNumber(r.opnamePrevAktif)} <span className="text-[8.5px] text-slate-400">{r.satuanKecil}</span></span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Ambil Gudang Utama */}
                      <td className="px-1.5 py-1.5 text-right font-bold text-indigo-900 border-r border-slate-100 bg-indigo-50/20 whitespace-nowrap">
                        {r.ambilGudangBulk > 0 ? (
                          <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded text-[9.5px]">
                            +{formatNumber(r.ambilGudangBulk)} <span className="text-[8.5px] text-indigo-400 font-normal">{r.satuanBesar}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Belanja Rute: Bulk */}
                      <td className="px-1 py-1.5 text-right font-medium text-amber-900 bg-amber-50/20 whitespace-nowrap">
                        {r.belanjaRuteBulk > 0 ? (
                          <span className="text-amber-700 font-bold">
                            +{formatNumber(r.belanjaRuteBulk)} <span className="text-[8.5px] text-amber-500 font-normal">{r.satuanBesar}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Belanja Rute: Aktif */}
                      <td className="px-1 py-1.5 text-right font-medium text-amber-900 border-r border-slate-100 bg-amber-50/20 whitespace-nowrap">
                        {r.belanjaRuteAktif > 0 ? (
                          <span className="text-amber-700 font-bold">
                            +{formatNumber(r.belanjaRuteAktif)} <span className="text-[8.5px] text-amber-500 font-normal">{r.satuanKecil}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Estimasi Stok Real-Time: Bulk */}
                      <td className="px-1.5 py-1.5 text-right font-black text-emerald-950 bg-emerald-50/40 whitespace-nowrap">
                        {formatNumber(r.estimasiBulk)} <span className="text-[8.5px] text-emerald-600 font-medium">{r.satuanBesar}</span>
                      </td>
                      {/* Estimasi Stok Real-Time: Aktif */}
                      <td className="px-1.5 py-1.5 text-right font-black text-emerald-950 border-r border-slate-100 bg-emerald-50/40 whitespace-nowrap">
                        {formatNumber(r.estimasiAktif)} <span className="text-[8.5px] text-emerald-600 font-medium">{r.satuanKecil}</span>
                      </td>
                      {/* Stok Master Sistem */}
                      <td className="px-1.5 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-100 bg-slate-50/50 whitespace-nowrap">
                        <span>{formatNumber(r.currentMasterBulk)} <span className="text-[8.5px] text-slate-400">{r.satuanBesar}</span></span>
                        {r.currentMasterAktif > 0 && (
                          <span className="text-[8.5px] text-slate-500 block leading-tight">
                            {formatNumber(r.currentMasterAktif)} {r.satuanKecil}
                          </span>
                        )}
                      </td>
                      {/* Stok Gudang Utama */}
                      <td className="px-2 py-1.5 text-right font-bold text-cyan-950 border-r border-slate-100 bg-cyan-50/30 whitespace-nowrap">
                        {r.gudangBulk > 0 || r.gudangKecil > 0 ? (
                          <div>
                            <span className="text-[10px]">{formatNumber(r.gudangBulk)} <span className="text-[8.5px] text-cyan-700 font-normal">{r.satuanBesar}</span></span>
                            {r.gudangKecil > 0 && (
                              <span className="text-[8.5px] text-cyan-700 block leading-tight font-semibold">
                                +{formatNumber(r.gudangKecil)} {r.satuanKecil}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {/* Total Gudang + Container */}
                      <td className="px-2 py-1.5 text-right font-black text-emerald-950 border-r border-slate-100 bg-emerald-50/40 whitespace-nowrap">
                        {r.totalBulk > 0 || r.totalKecil > 0 ? (
                          <div>
                            <span className="text-[10.5px]">{formatNumber(r.totalBulk)} <span className="text-[8.5px] text-emerald-700 font-semibold">{r.satuanBesar}</span></span>
                            {r.totalKecil > 0 && (
                              <span className="text-[8.5px] text-emerald-800 block leading-tight font-black">
                                +{formatNumber(r.totalKecil)} {r.satuanKecil}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">0 {r.satuanBesar}</span>
                        )}
                      </td>
                      {/* Peruntukan Toko */}
                      <td className="px-1.5 py-1.5 text-left bg-slate-50/40">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.targetBranches.map((br) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {tableRows.map((r, idx) => (
                <div key={r.key} className="rounded-2xl bg-white border border-slate-200/80 p-3.5 shadow-sm space-y-2.5">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-800 text-[10px] font-black text-white shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="inline-flex px-1.5 py-0.2 rounded bg-indigo-50 font-mono text-[9px] font-bold text-indigo-700">
                          {r.code}
                        </span>
                        <h4 className="text-xs font-black text-slate-900 uppercase">
                          {r.nama}
                        </h4>
                      </div>
                    </div>
                  </div>

                  {/* Peruntukan Toko */}
                  <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0">Peruntukan:</span>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {r.targetBranches.map((br) => (
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

                  {/* Movement Breakdown */}
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {/* Opname Kemarin */}
                    <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col justify-between">
                      <span className="font-bold text-blue-800 text-[8.5px] uppercase">Opname Kemarin</span>
                      <span className="font-black text-blue-950 mt-0.5">
                        {formatNumber(r.opnamePrevBulk)} {r.satuanBesar} / {formatNumber(r.opnamePrevAktif)} {r.satuanKecil}
                      </span>
                    </div>

                    {/* Ambil Gudang */}
                    <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-100 flex flex-col justify-between">
                      <span className="font-bold text-indigo-800 text-[8.5px] uppercase">Ambil Gudang</span>
                      <span className="font-black text-indigo-950 mt-0.5">
                        {r.ambilGudangBulk > 0 ? `+${formatNumber(r.ambilGudangBulk)} ${r.satuanBesar}` : "-"}
                      </span>
                    </div>

                    {/* Belanja Rute */}
                    <div className="col-span-2 p-2 rounded-xl bg-amber-50/70 border border-amber-100 flex items-center justify-between">
                      <span className="font-bold text-amber-800 text-[8.5px] uppercase">Belanja Rute:</span>
                      <span className="font-black text-amber-950">
                        {r.belanjaRuteBulk > 0 || r.belanjaRuteAktif > 0 
                          ? `+${formatNumber(r.belanjaRuteBulk)} ${r.satuanBesar} / +${formatNumber(r.belanjaRuteAktif)} ${r.satuanKecil}`
                          : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Estimasi Real-Time Total */}
                  <div className="p-2.5 rounded-xl bg-emerald-900 text-white flex items-center justify-between text-xs shadow-inner">
                    <span className="font-black uppercase tracking-wider text-[9px] text-emerald-200">Estimasi Real-Time:</span>
                    <span className="font-black">
                      {formatNumber(r.estimasiBulk)} {r.satuanBesar} | {formatNumber(r.estimasiAktif)} {r.satuanKecil}
                    </span>
                  </div>

                  {/* Stok Gudang Utama & Total Gudang + Container */}
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <div className="p-2 rounded-xl bg-cyan-50/70 border border-cyan-100 flex flex-col justify-between">
                      <span className="font-bold text-cyan-800 text-[8.5px] uppercase">Stok Gudang Utama</span>
                      <span className="font-bold text-cyan-950 mt-0.5">
                        {formatNumber(r.gudangBulk)} {r.satuanBesar}
                        {r.gudangKecil > 0 && ` +${formatNumber(r.gudangKecil)} ${r.satuanKecil}`}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                      <span className="font-bold text-emerald-800 text-[8.5px] uppercase">Total Gudang + Kontainer</span>
                      <span className="font-black text-emerald-950 mt-0.5">
                        {formatNumber(r.totalBulk)} {r.satuanBesar}
                        {r.totalKecil > 0 && ` +${formatNumber(r.totalKecil)} ${r.satuanKecil}`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
