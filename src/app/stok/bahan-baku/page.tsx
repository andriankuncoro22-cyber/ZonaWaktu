"use client";

import React, { useState, useMemo } from "react";
import { 
  Search, 
  ArrowRightLeft, 
  Loader2, 
  Save, 
  FileDown, 
  FileSpreadsheet, 
  Edit2, 
  Trash2, 
  Upload,
  Building2,
  Store,
  Truck,
  Plus,
  ArrowRight,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  collection, 
  doc,
  useActiveBranch,
  setActiveBranch,
  WarehouseId,
  BranchId,
  WAREHOUSE_LIST,
  BRANCH_LIST,
  getWarehouseForBranch,
  warehouseCollection,
  warehouseDoc,
  branchDoc, 
  branchCollection,
  filterContainerMaterials
} from "@/firebase";
import { findTargetMaterialInBranch, GenericMaterial } from "@/lib/material-mapping";
import { query, orderBy, writeBatch, increment, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BahanBaku {
  id: string;
  code?: string;
  nama?: string;
  qtyBesar?: number;
  qtyGudangKecil?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  qtyKecil?: number;
  satuanBesar?: string;
  satuanKecil?: string;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  qtyMinGudang?: number;
  qtyMinKontainer?: number;
  qtyMin?: number;
  currentPrice?: number;
  hargaSatuanKecil?: number;
  avgPrice?: number;
  stockValue?: number;
  metodePembelian?: string;
  [key: string]: unknown;
}

type MigrationMode = "gudang_ke_kontainer" | "kontainer_ke_gudang" | "antar_gudang" | "antar_kontainer";

interface MigrationItemRow {
  materialId: string;
  qty: number;
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

export default function StokBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const activeBranch = useActiveBranch();
  
  const [activeTab, setActiveTab] = useState<"kontainer" | "gudang">("kontainer");
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseId>(() => getWarehouseForBranch(activeBranch));
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync default warehouse if activeBranch changes
  React.useEffect(() => {
    queueMicrotask(() => {
      setSelectedWarehouse(getWarehouseForBranch(activeBranch));
    });
  }, [activeBranch]);

  // Queries for Displaying Stock Table
  const warehouseMaterialsQuery = useMemoFirebase(
    () => query(warehouseCollection(db, "bahan-baku", selectedWarehouse), orderBy("code", "asc")),
    [db, selectedWarehouse]
  );
  const { data: warehouseMaterials, loading: loadingWarehouse } = useCollection(warehouseMaterialsQuery);

  const containerMaterialsQuery = useMemoFirebase(
    () => query(collection(db, "bahan-baku"), orderBy("code", "asc")),
    [db, activeBranch]
  );
  const { data: containerMaterials, loading: loadingContainer } = useCollection(containerMaterialsQuery);

  const rawGudangMaterials = (warehouseMaterials as BahanBaku[]) || [];
  const rawContainerMaterials = (containerMaterials as BahanBaku[]) || [];
  const materials = activeTab === "gudang" 
    ? rawGudangMaterials.filter(item => item.metodePembelian !== "Pembuatan Sendiri") 
    : filterContainerMaterials(rawContainerMaterials, activeBranch);
  const loading = activeTab === "gudang" ? loadingWarehouse : loadingContainer;

  // Edit Stock State
  const [editingItem, setEditingItem] = useState<BahanBaku | null>(null);

  // ==========================================
  // DEDICATED MIGRATION & TRANSFER HUB STATE
  // ==========================================
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);
  const [migrationMode, setMigrationMode] = useState<MigrationMode>("gudang_ke_kontainer");
  const [sourceWarehouse, setSourceWarehouse] = useState<WarehouseId>(() => getWarehouseForBranch(activeBranch));
  const [targetWarehouse, setTargetWarehouse] = useState<WarehouseId>(() => (getWarehouseForBranch(activeBranch) === "gdm" ? "kedungreja" : "gdm"));
  const [sourceBranch, setSourceBranch] = useState<BranchId>(activeBranch);
  const [targetBranch, setTargetBranch] = useState<BranchId>(() => (activeBranch === "gdm" ? "tehwarga" : "gdm"));
  const [nomorBukti, setNomorBukti] = useState<string>("");
  const [migrationCatatan, setMigrationCatatan] = useState<string>("");
  const [migrationItems, setMigrationItems] = useState<MigrationItemRow[]>([
    { materialId: "", qty: 0 }
  ]);
  const [executingMigration, setExecutingMigration] = useState(false);

  // Pre-fetch all inventories for the Migration Hub
  const qWhGdm = useMemoFirebase(() => query(warehouseCollection(db, "bahan-baku", "gdm"), orderBy("nama", "asc")), [db]);
  const qWhKdrj = useMemoFirebase(() => query(warehouseCollection(db, "bahan-baku", "kedungreja"), orderBy("nama", "asc")), [db]);
  const qWhGmb = useMemoFirebase(() => query(warehouseCollection(db, "bahan-baku", "gembong"), orderBy("nama", "asc")), [db]);
  const qBrGdm = useMemoFirebase(() => query(branchCollection(db, "bahan-baku", "gdm"), orderBy("nama", "asc")), [db]);
  const qBrTw = useMemoFirebase(() => query(branchCollection(db, "bahan-baku", "tehwarga"), orderBy("nama", "asc")), [db]);
  const qBrKdrj = useMemoFirebase(() => query(branchCollection(db, "bahan-baku", "kedungreja"), orderBy("nama", "asc")), [db]);
  const qBrGmb = useMemoFirebase(() => query(branchCollection(db, "bahan-baku", "gembong"), orderBy("nama", "asc")), [db]);

  const { data: rawWhGdm } = useCollection(qWhGdm);
  const { data: rawWhKdrj } = useCollection(qWhKdrj);
  const { data: rawWhGmb } = useCollection(qWhGmb);
  const { data: rawBrGdm } = useCollection(qBrGdm);
  const { data: rawBrTw } = useCollection(qBrTw);
  const { data: rawBrKdrj } = useCollection(qBrKdrj);
  const { data: rawBrGmb } = useCollection(qBrGmb);

  // Get active source inventory list based on selected mode and source location
  const currentSourceMaterials = useMemo((): BahanBaku[] => {
    let list: BahanBaku[] = [];
    if (migrationMode === "gudang_ke_kontainer" || migrationMode === "antar_gudang") {
      list = (sourceWarehouse === "gdm" ? rawWhGdm : sourceWarehouse === "kedungreja" ? rawWhKdrj : rawWhGmb) as BahanBaku[] || [];
      return list.filter(m => m.metodePembelian !== "Pembuatan Sendiri");
    } else {
      // Source is container
      if (sourceBranch === "gdm") list = (rawBrGdm as BahanBaku[]) || [];
      else if (sourceBranch === "tehwarga") list = (rawBrTw as BahanBaku[]) || [];
      else if (sourceBranch === "kedungreja") list = (rawBrKdrj as BahanBaku[]) || [];
      else list = (rawBrGmb as BahanBaku[]) || [];
      return list;
    }
  }, [migrationMode, sourceWarehouse, sourceBranch, rawWhGdm, rawWhKdrj, rawWhGmb, rawBrGdm, rawBrTw, rawBrKdrj, rawBrGmb]);

  // Auto-generate reference number when migration modal opens
  const openMigrationHub = (initialMode?: MigrationMode) => {
    if (initialMode) setMigrationMode(initialMode);
    const now = new Date();
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    setNomorBukti(`MIG-${timeStr}`);
    setMigrationCatatan("");
    setMigrationItems([{ materialId: "", qty: 0 }]);
    setIsMigrationOpen(true);
  };

  const handleAddMigrationItem = () => {
    setMigrationItems(prev => [...prev, { materialId: "", qty: 0 }]);
  };

  const handleRemoveMigrationItem = (idx: number) => {
    if (migrationItems.length <= 1) return;
    setMigrationItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleMigrationItemChange = (idx: number, field: keyof MigrationItemRow, val: string | number) => {
    setMigrationItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  // Helper to calculate available stock in source location
  const getSourceAvailableStock = (mat?: BahanBaku): number => {
    if (!mat) return 0;
    if (migrationMode === "gudang_ke_kontainer" || migrationMode === "antar_gudang") {
      return Math.floor(Number(mat.qtyBesar || 0));
    } else {
      return Math.floor(Number(mat.qtyKontainerBesar || 0));
    }
  };

  // Helper to format source location label
  const getSourceLocationLabel = () => {
    if (migrationMode === "gudang_ke_kontainer" || migrationMode === "antar_gudang") {
      return WAREHOUSE_LIST[sourceWarehouse].name;
    }
    return BRANCH_LIST[sourceBranch].name;
  };

  // Helper to format target location label
  const getTargetLocationLabel = () => {
    if (migrationMode === "kontainer_ke_gudang" || migrationMode === "antar_gudang") {
      return WAREHOUSE_LIST[targetWarehouse].name;
    }
    return BRANCH_LIST[targetBranch].name;
  };

  // ==========================================
  // EXECUTE FULL MIGRATION & WRITE DUAL LOGS
  // ==========================================
  const handleExecuteMigration = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanProof = nomorBukti.trim();
    if (!cleanProof) {
      toast({ variant: "destructive", title: "Nomor Bukti Wajib Diisi", description: "Masukkan nomor bukti/referensi pemindahan." });
      return;
    }

    const validItems = migrationItems.filter(it => it.materialId && Number(it.qty) > 0);
    if (validItems.length === 0) {
      toast({ variant: "destructive", title: "Item Masih Kosong", description: "Pilih minimal 1 bahan dengan jumlah lebih dari 0." });
      return;
    }

    // Check stock availability
    for (const it of validItems) {
      const sourceMat = currentSourceMaterials.find(m => m.id === it.materialId);
      const avail = getSourceAvailableStock(sourceMat);
      if (it.qty > avail) {
        toast({
          variant: "destructive",
          title: "Stok Asal Tidak Mencukupi",
          description: `Bahan "${sourceMat?.nama || 'Terpilih'}" hanya memiliki stok ${avail} ${sourceMat?.satuanBesar || 'unit'}, tidak cukup untuk memindahkan ${it.qty}.`
        });
        return;
      }
    }

    // Check same source and destination
    if (migrationMode === "antar_gudang" && sourceWarehouse === targetWarehouse) {
      toast({ variant: "destructive", title: "Lokasi Sama", description: "Gudang asal dan gudang tujuan tidak boleh sama." });
      return;
    }
    if (migrationMode === "antar_kontainer" && sourceBranch === targetBranch) {
      toast({ variant: "destructive", title: "Lokasi Sama", description: "Kontainer asal dan kontainer tujuan tidak boleh sama." });
      return;
    }

    setExecutingMigration(true);
    try {
      const batch = writeBatch(db);
      const sourceIsGudang = migrationMode === "gudang_ke_kontainer" || migrationMode === "antar_gudang";
      const targetIsGudang = migrationMode === "kontainer_ke_gudang" || migrationMode === "antar_gudang";

      // Target collection materials list for smart mapping
      let targetMaterialsList: BahanBaku[] = [];
      if (targetIsGudang) {
        targetMaterialsList = (targetWarehouse === "gdm" ? rawWhGdm : targetWarehouse === "kedungreja" ? rawWhKdrj : rawWhGmb) as BahanBaku[] || [];
      } else {
        if (targetBranch === "gdm") targetMaterialsList = (rawBrGdm as BahanBaku[]) || [];
        else if (targetBranch === "tehwarga") targetMaterialsList = (rawBrTw as BahanBaku[]) || [];
        else if (targetBranch === "kedungreja") targetMaterialsList = (rawBrKdrj as BahanBaku[]) || [];
        else targetMaterialsList = (rawBrGmb as BahanBaku[]) || [];
      }

      const logItemsPayload: Array<Record<string, unknown>> = [];
      let totalMigrationNominal = 0;

      for (const it of validItems) {
        const sourceMat = currentSourceMaterials.find(m => m.id === it.materialId);
        if (!sourceMat) continue;

        const transferQty = Math.floor(Number(it.qty));
        const unitPrice = Number(sourceMat.currentPrice || sourceMat.avgPrice || 0);
        const subtotal = transferQty * unitPrice;
        totalMigrationNominal += subtotal;

        // 1. POTONG STOK ASAL
        if (sourceIsGudang) {
          const sRef = warehouseDoc(db, "bahan-baku", sourceMat.id, sourceWarehouse);
          batch.update(sRef, {
            qtyBesar: increment(-transferQty)
          });
        } else {
          const sRef = branchDoc(db, "bahan-baku", sourceMat.id, sourceBranch);
          batch.update(sRef, {
            qtyKontainerBesar: increment(-transferQty)
          });
        }

        // 2. SMART MAPPING UNTUK TUJUAN
        let targetDocRef = targetIsGudang
          ? warehouseDoc(db, "bahan-baku", sourceMat.id, targetWarehouse)
          : branchDoc(db, "bahan-baku", sourceMat.id, targetBranch);
        
        let targetMatName = sourceMat.nama || "-";
        let targetMatCode = sourceMat.code || "-";

        if (!targetIsGudang) {
          // If destination is container, smart match across branch aliases
          const matchedTarget = findTargetMaterialInBranch(
            sourceMat as unknown as GenericMaterial,
            targetMaterialsList as unknown as GenericMaterial[],
            targetBranch
          );
          if (matchedTarget) {
            targetDocRef = branchDoc(db, "bahan-baku", matchedTarget.id, targetBranch);
            targetMatName = matchedTarget.nama || sourceMat.nama || "-";
            targetMatCode = matchedTarget.code || sourceMat.code || "-";
            batch.update(targetDocRef, {
              qtyKontainerBesar: increment(transferQty),
              currentPrice: unitPrice > 0 ? unitPrice : (matchedTarget.currentPrice || 0)
            });
          } else {
            // Check if document exists
            const snap = await getDoc(targetDocRef);
            if (snap.exists()) {
              batch.update(targetDocRef, {
                qtyKontainerBesar: increment(transferQty),
                currentPrice: unitPrice > 0 ? unitPrice : (snap.data().currentPrice || 0)
              });
            } else {
              const newCode = (sourceMat.originalTwCode && targetBranch === "tehwarga") 
                ? String(sourceMat.originalTwCode) 
                : (sourceMat.code || "-");
              batch.set(targetDocRef, {
                ...sourceMat,
                code: newCode,
                qtyBesar: 0,
                qtyGudangKecil: 0,
                qtyKontainerBesar: transferQty,
                qtyKontainerKecil: 0,
                currentPrice: unitPrice
              });
            }
          }
        } else {
          // Target is Gudang
          const snap = await getDoc(targetDocRef);
          if (snap.exists()) {
            batch.update(targetDocRef, {
              qtyBesar: increment(transferQty),
              currentPrice: unitPrice > 0 ? unitPrice : (snap.data().currentPrice || 0)
            });
          } else {
            batch.set(targetDocRef, {
              ...sourceMat,
              qtyBesar: transferQty,
              qtyGudangKecil: 0,
              qtyKontainerBesar: 0,
              qtyKontainerKecil: 0,
              currentPrice: unitPrice
            });
          }
        }

        logItemsPayload.push({
          materialId: sourceMat.id,
          materialCode: sourceMat.code || "-",
          materialName: sourceMat.nama || "-",
          targetMaterialCode: targetMatCode,
          targetMaterialName: targetMatName,
          qty: transferQty,
          unit: sourceMat.satuanBesar || "-",
          satuanKecil: sourceMat.satuanKecil || "-",
          qtyKecilPerUnit: Number(sourceMat.qtyKecil || 1),
          totalQtyKecil: transferQty * Number(sourceMat.qtyKecil || 1),
          price: unitPrice,
          subtotal: subtotal,
          isBeliSendiri: sourceMat.metodePembelian === "Beli Sendiri"
        });
      }

      // 3. CATAT KE LOG PEMBELIAN BAHAN (Agar Histori Belanja Ikut Masuk ke Laporan Belanja & Pemindahan)
      const nowStr = new Date().toISOString().split("T")[0];
      const logType = migrationMode === "gudang_ke_kontainer"
        ? "ambil-gudang"
        : migrationMode === "kontainer_ke_gudang"
        ? "kembali-gudang"
        : migrationMode === "antar_kontainer"
        ? "transfer_antar_kontainer"
        : "transfer_antar_gudang";

      const commonLogData = {
        nomorNota: cleanProof,
        type: logType,
        location: targetIsGudang ? "gudang" : "kontainer",
        sourceLocation: getSourceLocationLabel(),
        targetLocation: getTargetLocationLabel(),
        sourceType: sourceIsGudang ? "gudang" : "kontainer",
        targetType: targetIsGudang ? "gudang" : "kontainer",
        sourceWarehouse: sourceIsGudang ? sourceWarehouse : null,
        targetWarehouse: targetIsGudang ? targetWarehouse : null,
        sourceBranch: !sourceIsGudang ? sourceBranch : null,
        targetBranch: !targetIsGudang ? targetBranch : null,
        totalItems: validItems.length,
        totalNominal: totalMigrationNominal,
        catatan: migrationCatatan.trim(),
        tanggal: nowStr,
        createdAt: serverTimestamp(),
        items: logItemsPayload
      };

      // Tulis log di target scoped collection
      const targetLogRef = targetIsGudang
        ? doc(warehouseCollection(db, "log_pembelian_bahan", targetWarehouse))
        : doc(branchCollection(db, "log_pembelian_bahan", targetBranch));
      batch.set(targetLogRef, commonLogData);

      // Tulis juga di root log_pembelian_bahan agar Laporan Operasional & Laporan Pemindahan Barang langsung menangkap
      const rootLogRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(rootLogRef, commonLogData);

      // Tulis di log_pemindahan_barang
      const transferLogRef = doc(collection(db, "log_pemindahan_barang"));
      batch.set(transferLogRef, commonLogData);

      await batch.commit();

      toast({
        title: "Pemindahan Berhasil",
        description: `Berhasil memindahkan ${validItems.length} bahan (${getSourceLocationLabel()} ➔ ${getTargetLocationLabel()}). Histori belanja dan mutasi telah disinkronkan ke laporan.`
      });

      setIsMigrationOpen(false);
      setMigrationItems([{ materialId: "", qty: 0 }]);
    } catch (err) {
      console.error("Gagal melakukan migrasi bahan:", err);
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat memproses pemindahan.";
      toast({
        variant: "destructive",
        title: "Gagal Memindahkan Bahan",
        description: msg
      });
    } finally {
      setExecutingMigration(false);
    }
  };

  // ==========================================
  // OTHER EXISTING HANDLERS (EXCEL, EDIT, RESET)
  // ==========================================
  const filteredMaterials = (materials || [])?.filter(item => 
    item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMinStockGudang = (item: BahanBaku) => Number(item.qtyMinGudang ?? item.qtyMin ?? 5);
  const getMinStockKontainer = (item: BahanBaku) => Number(item.qtyMinKontainer ?? item.qtyMin ?? 5);
  
  const getGudangTotal = (item: BahanBaku) => {
    const qtyBulk = Math.floor(Number(item.qtyBesar || 0));
    const qtyKecil = Number(item.qtyGudangKecil || 0);
    const konversi = Number(item.qtyKecil || 1);
    return qtyBulk + (qtyKecil / (konversi || 1));
  };

  const getKontainerTotal = (item: BahanBaku) => {
    const qtyBulk = Math.floor(Number(item.qtyKontainerBesar || 0));
    const qtyAktif = Number(item.qtyKontainerKecil || 0);
    const konversi = Number(item.qtyKecil || 1);
    return qtyBulk + (qtyAktif / (konversi || 1));
  };

  const getStatusLabel = (value: number, threshold: number) => {
    const isCritical = value <= threshold;
    return {
      label: isCritical ? "Kritis" : "Aman",
      color: isCritical ? "text-rose-600 bg-rose-50 border-rose-100" : "text-emerald-700 bg-emerald-50 border-emerald-100"
    };
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const excelData = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        if (!excelData || excelData.length === 0) {
          toast({ variant: "destructive", title: "Berkas Kosong", description: "Berkas Excel tidak memiliki data." });
          return;
        }

        const allMaterials = materials || [];
        const cleanStr = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        const getRowVal = (row: Record<string, unknown>, primaryKeywords: string[], secondaryKeywords: string[] = []) => {
          const keys = Object.keys(row);
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

        const updates: { id: string; data: Record<string, unknown> }[] = [];

        excelData.forEach((row) => {
          const codeVal = getRowVal(row, ["kode", "kodebahan", "code", "materialcode"]);
          const nameVal = getRowVal(row, ["namabahan", "nama", "name", "materialname"]);

          let match = allMaterials.find((m) => {
            if (codeVal && m.code) {
              return cleanStr(m.code) === cleanStr(codeVal);
            }
            return false;
          });

          if (!match && nameVal) {
            match = allMaterials.find((m) => {
              if (m.nama) {
                return cleanStr(m.nama) === cleanStr(nameVal);
              }
              return false;
            });
          }

          if (match) {
            const updatePayload: Record<string, unknown> = {};
            const conversionRate = Number(match.qtyKecil || 1);

            const bulkGudangRaw = getRowVal(row, ["stokgudangbesar", "gudangbesar", "stokgudang"]);
            const smallGudangRaw = getRowVal(row, ["stokgudangkecil", "gudangkecil", "stokkecilgudang"]);

            const bulkKontainerRaw = getRowVal(row, ["bulkkontainer", "stokkontainerbesar", "kontainerbesar"]);
            const smallKontainerRaw = getRowVal(row, ["aktifkontainer", "stokkontainerkecil", "kontainerkecil"]);

            if (activeTab === "gudang") {
              if (bulkGudangRaw !== undefined) {
                const num = Number(bulkGudangRaw) || 0;
                const intPart = Math.floor(num);
                const decPart = (num - intPart) * conversionRate;
                updatePayload.qtyBesar = intPart;
                if (smallGudangRaw === undefined && decPart > 0) {
                  updatePayload.qtyGudangKecil = Math.round(decPart * 100) / 100;
                }
              }
              if (smallGudangRaw !== undefined) {
                updatePayload.qtyGudangKecil = Number(smallGudangRaw) || 0;
              }
            } else {
              if (bulkKontainerRaw !== undefined) {
                const num = Number(bulkKontainerRaw) || 0;
                const intPart = Math.floor(num);
                const decPart = (num - intPart) * conversionRate;
                updatePayload.qtyKontainerBesar = intPart;
                if (smallKontainerRaw === undefined && decPart > 0) {
                  updatePayload.qtyKontainerKecil = Math.round(decPart * 100) / 100;
                }
              }
              if (smallKontainerRaw !== undefined) {
                updatePayload.qtyKontainerKecil = Number(smallKontainerRaw) || 0;
              }
            }

            if (Object.keys(updatePayload).length > 0) {
              updates.push({ id: match.id, data: updatePayload });
            }
          }
        });

        if (updates.length === 0) {
          toast({
            variant: "destructive",
            title: "Tidak Ada Kecocokan",
            description: "Tidak ada baris bahan baku yang cocok dengan master data sistem.",
          });
          return;
        }

        const isConfirmed = window.confirm(
          `Ditemukan ${updates.length} bahan baku yang cocok pada ${activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[activeBranch].name}. Lanjutkan impor dan perbarui stok?`
        );

        if (!isConfirmed) return;

        setImporting(true);
        const batchSize = 400;
        for (let i = 0; i < updates.length; i += batchSize) {
          const chunk = updates.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            const ref = activeTab === "gudang" 
              ? warehouseDoc(db, "bahan-baku", item.id, selectedWarehouse)
              : branchDoc(db, "bahan-baku", item.id, activeBranch);
            batch.update(ref, item.data);
          });
          await batch.commit();
        }

        toast({
          title: "Impor Berhasil",
          description: `Berhasil menimpa ${updates.length} data stok bahan baku dari Excel.`,
        });
      } catch (err) {
        console.error("Error importing excel to bahan baku:", err);
        toast({
          variant: "destructive",
          title: "Gagal Impor",
          description: "Terjadi kesalahan saat membaca berkas Excel atau menimpa data.",
        });
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleResetAllStock = async () => {
    const locName = activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[activeBranch].name;
    if (!confirm(`Semua stok bahan baku pada ${locName} akan diatur menjadi 0. Lanjutkan?`)) return;

    setResetting(true);
    try {
      const batch = writeBatch(db);
      (materials || []).forEach((item) => {
        const ref = activeTab === "gudang"
          ? warehouseDoc(db, "bahan-baku", item.id, selectedWarehouse)
          : branchDoc(db, "bahan-baku", item.id, activeBranch);
        
        if (activeTab === "gudang") {
          batch.update(ref, { qtyBesar: 0, qtyGudangKecil: 0 });
        } else {
          batch.update(ref, { qtyKontainerBesar: 0, qtyKontainerKecil: 0 });
        }
      });

      await batch.commit();
      toast({
        title: "Stok Dikosongkan",
        description: `Seluruh stok pada ${locName} telah diatur menjadi 0.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal Mengosongkan Stok",
        description: "Terjadi kesalahan sistem.",
      });
    } finally {
      setResetting(false);
    }
  };

  const cleanNumber = (val: unknown): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setUpdating(true);
    try {
      const materialRef = activeTab === "gudang"
        ? warehouseDoc(db, "bahan-baku", editingItem.id, selectedWarehouse)
        : branchDoc(db, "bahan-baku", editingItem.id, activeBranch);

      const conversionRate = Number(editingItem.qtyKecil || 1);
      
      const rawGudangBesar = Number(editingItem.qtyBesar || 0);
      const intGudangBesar = Math.floor(rawGudangBesar);
      const gudangDecimalRemainder = (rawGudangBesar - intGudangBesar) * conversionRate;

      const rawKontainerBesar = Number(editingItem.qtyKontainerBesar || 0);
      const intKontainerBesar = Math.floor(rawKontainerBesar);
      const kontainerDecimalRemainder = (rawKontainerBesar - intKontainerBesar) * conversionRate;

      const currentGudangSmall = Number(editingItem.qtyGudangKecil || 0);
      const finalGudangSmall = Math.round((currentGudangSmall + gudangDecimalRemainder) * 100) / 100;

      const currentKontainerSmall = Number(editingItem.qtyKontainerKecil || 0);
      const finalKontainerSmall = Math.round((currentKontainerSmall + kontainerDecimalRemainder) * 100) / 100;

      const updateData: Record<string, unknown> = {
        qtyMin: Number(editingItem.qtyMinGudang ?? editingItem.qtyMin ?? 5),
        qtyMinGudang: Number(editingItem.qtyMinGudang ?? editingItem.qtyMin ?? 5),
        qtyMinKontainer: Number(editingItem.qtyMinKontainer ?? editingItem.qtyMin ?? 5)
      };

      if (activeTab === "gudang") {
        updateData.qtyBesar = intGudangBesar;
        updateData.qtyGudangKecil = finalGudangSmall;
      } else {
        updateData.qtyKontainerBesar = intKontainerBesar;
        updateData.qtyKontainerKecil = finalKontainerSmall;
      }

      await updateDoc(materialRef, updateData);
      
      toast({ 
        title: "Stok Diperbarui", 
        description: "Stok berhasil disinkronisasi." 
      });
      setIsEditOpen(false);
      setEditingItem(null);
    } catch {
      toast({ variant: "destructive", title: "Gagal Update", description: "Terjadi kesalahan sistem." });
    } finally {
      setUpdating(false);
    }
  };

  const handleExportExcel = () => {
    const tableData = (filteredMaterials || []).map((item) => {
      const adjustedGudang = adjustNegativeSmallStock(
        Number(item.qtyBesar || 0),
        Number(item.qtyGudangKecil || 0),
        Number(item.qtyKecil || 1)
      );
      const adjustedKontainer = adjustNegativeSmallStock(
        Number(item.qtyKontainerBesar || 0),
        Number(item.qtyKontainerKecil || 0),
        Number(item.qtyKecil || 1)
      );

      return {
        "KODE": item.code || "",
        "NAMA BAHAN": item.nama || "",
        "STOK GUDANG (BESAR)": adjustedGudang.bulk,
        "SATUAN BESAR": item.satuanBesar || "",
        "STOK KECIL GUDANG": adjustedGudang.kecil,
        "SATUAN KECIL": item.satuanKecil || "",
        "BULK KONTAINER": adjustedKontainer.bulk,
        "AKTIF KONTAINER": adjustedKontainer.kecil,
        "STATUS STOK": getStatusLabel(
          activeTab === "gudang" ? getGudangTotal(item) : getKontainerTotal(item),
          activeTab === "gudang" ? getMinStockGudang(item) : getMinStockKontainer(item)
        ).label,
      };
    });

    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    const sheetTitle = activeTab === "gudang" 
      ? `Gudang_${selectedWarehouse}` 
      : `Kontainer_${activeBranch}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 30));
    XLSX.writeFile(wb, `Stok_Bahan_Baku_${sheetTitle}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const docPDF = new jsPDF();
    const locTitle = activeTab === "gudang" 
      ? WAREHOUSE_LIST[selectedWarehouse].name 
      : BRANCH_LIST[activeBranch].name;

    docPDF.setFontSize(18);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text("LAPORAN MONITORING STOK BAHAN BAKU", 105, 15, { align: 'center' });
    docPDF.setFontSize(10);
    docPDF.setTextColor(100);
    docPDF.text(`Lokasi: ${locTitle} • Mode: ${activeTab === "gudang" ? "Gudang Utama" : "Area Kontainer"}`, 105, 22, { align: 'center' });
    docPDF.setDrawColor(200);
    docPDF.line(15, 28, 195, 28);
    
    const tableData = (filteredMaterials || []).map(item => {
      const adjustedGudang = adjustNegativeSmallStock(
        Number(item.qtyBesar || 0),
        Number(item.qtyGudangKecil || 0),
        Number(item.qtyKecil || 1)
      );
      const adjustedKontainer = adjustNegativeSmallStock(
        Number(item.qtyKontainerBesar || 0),
        Number(item.qtyKontainerKecil || 0),
        Number(item.qtyKecil || 1)
      );
      return [
        item.code || "",
        item.nama || "",
        adjustedGudang.bulk,
        item.satuanBesar || "",
        adjustedGudang.kecil,
        item.satuanKecil || "",
        adjustedKontainer.bulk,
        adjustedKontainer.kecil,
      ];
    });

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG (B)", "SAT B", "GUDANG (K)", "SAT K", "BULK KONTAINER", "AKTIF KONTAINER"]],
      body: tableData,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 }
    });

    docPDF.save(`Monitoring_Stok_${activeTab === "gudang" ? selectedWarehouse : activeBranch}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header & Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Monitoring Stok
          </h1>
          <p className="text-[10px] md:text-xs text-slate-600 font-black uppercase tracking-[0.2em]">
            Gudang Utama Terpadu & Area Kontainer Toko
          </p>
        </div>
        
        {/* Compact, responsive action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx, .xls"
            onChange={handleImportExcel}
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-xl border-slate-200 px-3 h-9 font-black uppercase tracking-wider text-[9px] sm:text-[10px] gap-1.5 bg-white hover:text-indigo-600 hover:bg-slate-50 shadow-sm"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <Upload className="h-3.5 w-3.5 text-indigo-600" />}
            <span>Impor</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportExcel}
            className="rounded-xl border-slate-200 px-3 h-9 font-black uppercase tracking-wider text-[9px] sm:text-[10px] gap-1.5 bg-white shadow-sm"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> 
            <span>Excel</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportPDF}
            className="rounded-xl border-slate-200 px-3 h-9 font-black uppercase tracking-wider text-[9px] sm:text-[10px] gap-1.5 bg-white shadow-sm"
          >
            <FileDown className="h-3.5 w-3.5 text-primary" /> 
            <span>PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAllStock}
            disabled={resetting}
            className="rounded-xl border-rose-200 bg-rose-50 px-3 h-9 font-black uppercase tracking-wider text-[9px] sm:text-[10px] gap-1.5 text-rose-600 hover:bg-rose-100 shadow-sm"
          >
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span>Hapus Stok</span>
          </Button>
          
          {/* Tombol Tampilan Tersendiri: Pusat Ambil & Migrasi Bahan Baku */}
          <Button 
            size="sm" 
            onClick={() => openMigrationHub()}
            className="rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 hover:from-slate-800 hover:to-indigo-900 text-white px-4 h-9 font-black uppercase tracking-wider text-[9px] sm:text-[10px] gap-2 shadow-md hover:shadow-indigo-500/20 transition-all"
          >
            <Truck className="h-3.5 w-3.5 text-amber-400" />
            <span>Ambil / Migrasi Barang</span>
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DIALOG PUSAT AMBIL & MIGRASI BAHAN BAKU (DEDICATED HUB)    */}
      {/* ============================================================ */}
      <Dialog open={isMigrationOpen} onOpenChange={setIsMigrationOpen}>
        <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-5 sm:p-8 max-w-3xl max-h-[92vh] overflow-y-auto mx-auto bg-white">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black uppercase italic text-slate-900">
                  Pusat Ambil & Migrasi Bahan Baku
                </DialogTitle>
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wide">
                  Mutasi stok real-time antar Gudang & Kontainer dengan sinkronisasi otomatis ke Laporan Belanja
                </p>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleExecuteMigration} className="space-y-6 mt-3">
            {/* 1. Pemilihan Mode Perpindahan (4 Mode) */}
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                1. Pilih Jenis & Arah Pemindahan
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setMigrationMode("gudang_ke_kontainer")}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5",
                    migrationMode === "gudang_ke_kontainer"
                      ? "bg-indigo-50/80 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Building2 className={cn("h-4 w-4", migrationMode === "gudang_ke_kontainer" ? "text-indigo-600" : "text-slate-500")} />
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <Store className={cn("h-4 w-4", migrationMode === "gudang_ke_kontainer" ? "text-indigo-600" : "text-slate-500")} />
                  </div>
                  <span className="text-[11px] font-black leading-tight text-slate-900">Gudang ➔ Kontainer</span>
                  <span className="text-[9px] font-bold text-slate-500">Ambil untuk Toko</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMigrationMode("kontainer_ke_gudang")}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5",
                    migrationMode === "kontainer_ke_gudang"
                      ? "bg-emerald-50/80 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Store className={cn("h-4 w-4", migrationMode === "kontainer_ke_gudang" ? "text-emerald-600" : "text-slate-500")} />
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <Building2 className={cn("h-4 w-4", migrationMode === "kontainer_ke_gudang" ? "text-emerald-600" : "text-slate-500")} />
                  </div>
                  <span className="text-[11px] font-black leading-tight text-slate-900">Kontainer ➔ Gudang</span>
                  <span className="text-[9px] font-bold text-slate-500">Retur Sisa ke Gudang</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMigrationMode("antar_gudang")}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5",
                    migrationMode === "antar_gudang"
                      ? "bg-amber-50/80 border-amber-500 shadow-sm ring-2 ring-amber-500/20"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Building2 className={cn("h-4 w-4", migrationMode === "antar_gudang" ? "text-amber-600" : "text-slate-500")} />
                    <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                    <Building2 className={cn("h-4 w-4", migrationMode === "antar_gudang" ? "text-amber-600" : "text-slate-500")} />
                  </div>
                  <span className="text-[11px] font-black leading-tight text-slate-900">Antar Gudang</span>
                  <span className="text-[9px] font-bold text-slate-500">GDM ⟷ Kedungreja</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMigrationMode("antar_kontainer")}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5",
                    migrationMode === "antar_kontainer"
                      ? "bg-purple-50/80 border-purple-500 shadow-sm ring-2 ring-purple-500/20"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Store className={cn("h-4 w-4", migrationMode === "antar_kontainer" ? "text-purple-600" : "text-slate-500")} />
                    <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                    <Store className={cn("h-4 w-4", migrationMode === "antar_kontainer" ? "text-purple-600" : "text-slate-500")} />
                  </div>
                  <span className="text-[11px] font-black leading-tight text-slate-900">Antar Kontainer</span>
                  <span className="text-[9px] font-bold text-slate-500">Mutasi Antar Toko</span>
                </button>
              </div>
            </div>

            {/* 2. Pemilihan Lokasi Asal & Tujuan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-3xl">
              {/* Asal Lokasi */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  Lokasi Asal (Stok Berkurang)
                </Label>
                {migrationMode === "gudang_ke_kontainer" || migrationMode === "antar_gudang" ? (
                  <Select 
                    value={sourceWarehouse} 
                    onValueChange={(v: WarehouseId) => {
                      setSourceWarehouse(v);
                      if (migrationMode === "antar_gudang") {
                        setTargetWarehouse(v === "gdm" ? "kedungreja" : "gdm");
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-white border-slate-200 font-bold text-xs">
                      <SelectValue placeholder="Pilih Gudang Asal" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl font-bold">
                      <SelectItem value="gdm">Gudang Gandrungmangu (GDM)</SelectItem>
                      <SelectItem value="kedungreja">Gudang Kedungreja</SelectItem>
                      <SelectItem value="gembong">Gudang Gembong (Mandiri)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select 
                    value={sourceBranch} 
                    onValueChange={(v: BranchId) => {
                      setSourceBranch(v);
                      if (migrationMode === "antar_kontainer" && targetBranch === v) {
                        setTargetBranch(v === "gdm" ? "tehwarga" : "gdm");
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-white border-slate-200 font-bold text-xs">
                      <SelectValue placeholder="Pilih Kontainer Asal" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl font-bold">
                      <SelectItem value="gdm">Zona Waktu - Gandrungmangu</SelectItem>
                      <SelectItem value="tehwarga">Teh Warga - Gandrungmangu</SelectItem>
                      <SelectItem value="kedungreja">Zona Waktu - Kedungreja</SelectItem>
                      <SelectItem value="gembong">Zona Waktu - Gembong</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Tujuan Lokasi */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Lokasi Tujuan (Stok Bertambah)
                </Label>
                {migrationMode === "kontainer_ke_gudang" || migrationMode === "antar_gudang" ? (
                  <Select 
                    value={targetWarehouse} 
                    onValueChange={(v: WarehouseId) => setTargetWarehouse(v)}
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-white border-slate-200 font-bold text-xs">
                      <SelectValue placeholder="Pilih Gudang Tujuan" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl font-bold">
                      <SelectItem value="gdm">Gudang Gandrungmangu (GDM)</SelectItem>
                      <SelectItem value="kedungreja">Gudang Kedungreja</SelectItem>
                      <SelectItem value="gembong">Gudang Gembong (Mandiri)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select 
                    value={targetBranch} 
                    onValueChange={(v: BranchId) => setTargetBranch(v)}
                  >
                    <SelectTrigger className="h-10 rounded-2xl bg-white border-slate-200 font-bold text-xs">
                      <SelectValue placeholder="Pilih Kontainer Tujuan" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl font-bold">
                      <SelectItem value="gdm" disabled={migrationMode === "antar_kontainer" && sourceBranch === "gdm"}>
                        Zona Waktu - Gandrungmangu
                      </SelectItem>
                      <SelectItem value="tehwarga" disabled={migrationMode === "antar_kontainer" && sourceBranch === "tehwarga"}>
                        Teh Warga - Gandrungmangu
                      </SelectItem>
                      <SelectItem value="kedungreja" disabled={migrationMode === "antar_kontainer" && sourceBranch === "kedungreja"}>
                        Zona Waktu - Kedungreja
                      </SelectItem>
                      <SelectItem value="gembong" disabled={migrationMode === "antar_kontainer" && sourceBranch === "gembong"}>
                        Zona Waktu - Gembong
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* 3. Nomor Bukti & Catatan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500">Nomor Bukti / Referensi</Label>
                <Input
                  value={nomorBukti}
                  onChange={(e) => setNomorBukti(e.target.value)}
                  placeholder="Contoh: MIG-20260911-001"
                  required
                  className="h-10 rounded-2xl font-black text-xs uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500">Catatan / Alasan Pemindahan</Label>
                <Input
                  value={migrationCatatan}
                  onChange={(e) => setMigrationCatatan(e.target.value)}
                  placeholder="Misal: Suplai harian outlet, bantuan bahan, dll."
                  className="h-10 rounded-2xl font-medium text-xs"
                />
              </div>
            </div>

            {/* 4. Daftar Bahan Baku yang Dipindahkan (Multi-Item) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  2. Pilih Bahan Baku yang Dipindahkan ({migrationItems.length} Item)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddMigrationItem}
                  className="h-7 rounded-xl border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 text-[10px] font-black uppercase gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tambah Bahan</span>
                </Button>
              </div>

              <div className="space-y-2.5 max-h-[36vh] overflow-y-auto pr-1">
                {migrationItems.map((item, idx) => {
                  const selectedMat = currentSourceMaterials.find(m => m.id === item.materialId);
                  const availableStock = getSourceAvailableStock(selectedMat);
                  const unitPrice = Number(selectedMat?.currentPrice || selectedMat?.avgPrice || 0);
                  const subtotal = (item.qty || 0) * unitPrice;

                  return (
                    <div key={idx} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Pilih Bahan Baku */}
                        <div className="flex-1 min-w-0">
                          <Select
                            value={item.materialId}
                            onValueChange={(val) => handleMigrationItemChange(idx, "materialId", val)}
                          >
                            <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs font-bold">
                              <SelectValue placeholder="-- Pilih Bahan Baku Asal --" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl max-h-64">
                              {currentSourceMaterials.map((m) => {
                                const stock = getSourceAvailableStock(m);
                                return (
                                  <SelectItem key={m.id} value={m.id} className="text-xs font-bold">
                                    <div className="flex items-center justify-between gap-4 w-full">
                                      <span>{m.nama} ({m.code})</span>
                                      <span className={cn(
                                        "text-[10px] px-2 py-0.5 rounded-full font-black",
                                        stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                                      )}>
                                        Stok: {stock} {m.satuanBesar || 'Unit'}
                                      </span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Input Kuantitas */}
                        <div className="w-28 shrink-0">
                          <Input
                            type="number"
                            min="1"
                            max={availableStock > 0 ? availableStock : 999999}
                            value={item.qty || ""}
                            onChange={(e) => handleMigrationItemChange(idx, "qty", Math.max(0, parseInt(e.target.value) || 0))}
                            placeholder="Qty"
                            className="h-9 rounded-xl text-xs font-black text-center"
                          />
                        </div>

                        {/* Hapus Baris */}
                        {migrationItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMigrationItem(idx)}
                            className="h-9 w-9 p-0 rounded-xl text-rose-500 hover:bg-rose-50 shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Detail Info Baris (Stok & Nilai Belanja HPP) */}
                      {selectedMat && (
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                          <span>
                            Satuan: <strong className="text-slate-800">{selectedMat.satuanBesar || 'Pack'}</strong> • Stok Asal: <strong className={cn(availableStock < item.qty ? "text-rose-600" : "text-slate-800")}>{availableStock}</strong>
                          </span>
                          <span>
                            Nilai HPP: <strong className="text-slate-900">Rp {subtotal.toLocaleString("id-ID")}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Informasi Sinkronisasi Laporan */}
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-[10px] text-slate-600 leading-relaxed">
                <strong className="text-indigo-900 block font-black">Otomatis Sinkron ke Laporan Belanja & Stock Loss</strong>
                Nilai HPP dan kuantitas bahan yang dipindahkan otomatis tercatat ke <span className="font-bold text-indigo-700">Laporan Belanja Bahan</span> unit tujuan dan teragregasi pada <span className="font-bold text-indigo-700">Laporan Pemindahan Barang</span>.
              </div>
            </div>

            {/* 6. Tombol Aksi */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsMigrationOpen(false)}
                disabled={executingMigration}
                className="h-10 rounded-2xl font-black uppercase text-xs px-4"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={executingMigration}
                className="h-10 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider text-xs px-5 shadow-lg shadow-indigo-500/20 gap-2"
              >
                {executingMigration ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Konfirmasi & Pindahkan</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG EDIT STOK MANUAL (EXISTING)                           */}
      {/* ============================================================ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-3xl md:rounded-[2.5rem] border-none shadow-2xl p-6 md:p-10 max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-black uppercase italic text-slate-900">
              Sinkronisasi Stok Manual
            </DialogTitle>
          </DialogHeader>
          {editingItem && (
            <form onSubmit={handleUpdateStock} className="space-y-4 mt-2">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                <p className="text-xs font-black text-slate-900">{editingItem.nama}</p>
                <p className="text-[10px] text-slate-500 font-bold">{editingItem.code} • Konversi: 1 {editingItem.satuanBesar} = {editingItem.qtyKecil} {editingItem.satuanKecil}</p>
              </div>

              {activeTab === "gudang" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Stok Gudang ({editingItem.satuanBesar})</Label>
                    <Input
                      type="number"
                      step="any"
                      value={editingItem.qtyBesar ?? 0}
                      onChange={(e) => setEditingItem({ ...editingItem, qtyBesar: cleanNumber(e.target.value) })}
                      className="h-10 rounded-2xl font-black text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Sisa Gudang ({editingItem.satuanKecil})</Label>
                    <Input
                      type="number"
                      step="any"
                      value={editingItem.qtyGudangKecil ?? 0}
                      onChange={(e) => setEditingItem({ ...editingItem, qtyGudangKecil: cleanNumber(e.target.value) })}
                      className="h-10 rounded-2xl font-black text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Bulk Kontainer ({editingItem.satuanBesar})</Label>
                    <Input
                      type="number"
                      step="any"
                      value={editingItem.qtyKontainerBesar ?? 0}
                      onChange={(e) => setEditingItem({ ...editingItem, qtyKontainerBesar: cleanNumber(e.target.value) })}
                      className="h-10 rounded-2xl font-black text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Aktif Kontainer ({editingItem.satuanKecil})</Label>
                    <Input
                      type="number"
                      step="any"
                      value={editingItem.qtyKontainerKecil ?? 0}
                      onChange={(e) => setEditingItem({ ...editingItem, qtyKontainerKecil: cleanNumber(e.target.value) })}
                      className="h-10 rounded-2xl font-black text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} className="rounded-2xl h-10 font-black uppercase text-xs">
                  Batal
                </Button>
                <Button type="submit" disabled={updating} className="rounded-2xl h-10 font-black uppercase text-xs bg-slate-900 text-white hover:bg-slate-800">
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  <span>Simpan</span>
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Main Tabs: Kontainer vs Gudang */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "kontainer" | "gudang")} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/80 p-1.5 rounded-2xl">
          <TabsList className="bg-transparent h-10 p-0 gap-1">
            <TabsTrigger 
              value="kontainer" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <Store className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
              <span>Area Kontainer Toko</span>
            </TabsTrigger>
            <TabsTrigger 
              value="gudang" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              <span>Gudang Utama</span>
            </TabsTrigger>
          </TabsList>

          {/* Sub Switcher */}
          {activeTab === "gudang" ? (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSelectedWarehouse("gdm")}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedWarehouse === "gdm" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Gudang GDM (Terpadu)
              </button>
              <button
                type="button"
                onClick={() => setSelectedWarehouse("kedungreja")}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedWarehouse === "kedungreja" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Gudang Kedungreja
              </button>
              <button
                type="button"
                onClick={() => setSelectedWarehouse("gembong")}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedWarehouse === "gembong" ? "bg-indigo-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Gudang Gembong (Mandiri)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200/60">
              <button
                type="button"
                onClick={() => setActiveBranch("gdm")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  activeBranch === "gdm" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW GDM
              </button>
              <button
                type="button"
                onClick={() => setActiveBranch("tehwarga")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  activeBranch === "tehwarga" ? "bg-amber-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Teh Warga GDM
              </button>
              <button
                type="button"
                onClick={() => setActiveBranch("kedungreja")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  activeBranch === "kedungreja" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW Kedungreja
              </button>
              <button
                type="button"
                onClick={() => setActiveBranch("gembong")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  activeBranch === "gembong" ? "bg-indigo-600 text-white shadow-xs shadow-indigo-600/30" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW Gembong
              </button>
            </div>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="my-4 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kode atau nama bahan baku..."
              className="pl-9 h-10 rounded-2xl bg-white border-slate-200 text-xs font-bold"
            />
          </div>
          <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            Total: {filteredMaterials.length} Bahan Baku
          </div>
        </div>

        {/* Table Content */}
        <TabsContent value={activeTab} className="mt-0">
          <Card className="rounded-3xl border-slate-200/80 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Kode</th>
                    <th className="py-3 px-4">Nama Bahan</th>
                    {activeTab === "gudang" ? (
                      <>
                        <th className="py-3 px-4 text-center">Stok Gudang (Besar)</th>
                        <th className="py-3 px-4 text-center">Sisa Gudang (Kecil)</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3 px-4 text-center">Bulk Kontainer</th>
                        <th className="py-3 px-4 text-center">Aktif Kontainer</th>
                      </>
                    )}
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Memuat data stok...</span>
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                        Tidak ditemukan data bahan baku.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((mat) => {
                      const adjustedGudang = adjustNegativeSmallStock(
                        Number(mat.qtyBesar || 0),
                        Number(mat.qtyGudangKecil || 0),
                        Number(mat.qtyKecil || 1)
                      );
                      const adjustedKontainer = adjustNegativeSmallStock(
                        Number(mat.qtyKontainerBesar || 0),
                        Number(mat.qtyKontainerKecil || 0),
                        Number(mat.qtyKecil || 1)
                      );

                      const totalVal = activeTab === "gudang" ? getGudangTotal(mat) : getKontainerTotal(mat);
                      const minVal = activeTab === "gudang" ? getMinStockGudang(mat) : getMinStockKontainer(mat);
                      const status = getStatusLabel(totalVal, minVal);

                      return (
                        <tr key={mat.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-black text-indigo-950 font-mono text-[11px]">
                            {mat.code || "-"}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900">{mat.nama}</div>
                            <div className="text-[10px] text-slate-600 font-semibold">
                              1 {mat.satuanBesar || 'Unit'} = {mat.qtyKecil || 1} {mat.satuanKecil || 'Unit'}
                            </div>
                          </td>
                          {activeTab === "gudang" ? (
                            <>
                              <td className="py-3 px-4 text-center">
                                <span className="font-black text-slate-900 text-sm">{adjustedGudang.bulk}</span>{" "}
                                <span className="text-[10px] text-slate-600">{mat.satuanBesar}</span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="font-black text-slate-700">{adjustedGudang.kecil}</span>{" "}
                                <span className="text-[10px] text-slate-600">{mat.satuanKecil}</span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-4 text-center">
                                <span className="font-black text-slate-900 text-sm">{adjustedKontainer.bulk}</span>{" "}
                                <span className="text-[10px] text-slate-600">{mat.satuanBesar}</span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="font-black text-slate-700">{adjustedKontainer.kecil}</span>{" "}
                                <span className="text-[10px] text-slate-600">{mat.satuanKecil}</span>
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4 text-center">
                            <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black border", status.color)}>
                              {status.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingItem(mat);
                                setIsEditOpen(true);
                              }}
                              className="h-8 w-8 p-0 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
