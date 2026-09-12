"use client";

import React, { useState, useMemo } from "react";
import { 
  Truck, 
  ShoppingCart, 
  Save, 
  History, 
  Trash2,
  PlusCircle,
  X,
  ChevronDown,
  ChevronUp,
  Hash,
  AlertCircle,
  Building2,
  Store,
  FileSpreadsheet,
  Loader2,
  CreditCard,
  Landmark,
  CheckCircle2,
  Split,
  FileDown
} from "lucide-react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  doc,
  useActiveBranch,
  WarehouseId,
  BranchId,
  WAREHOUSE_LIST,
  BRANCH_LIST,
  getWarehouseForBranch,
  warehouseCollection,
  warehouseDoc,
  branchDoc,
  branchCollection
} from "@/firebase";
import { serverTimestamp, query, orderBy, limit, increment, writeBatch, collection, getDocs, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { applyPurchase } from "@/lib/hpp";

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

const BANK_OPTIONS = [
  { id: "BRI", name: "Bank BRI", badge: "bg-blue-600 text-white border-blue-700" },
  { id: "BNI", name: "Bank BNI", badge: "bg-teal-600 text-white border-teal-700" },
  { id: "Bank Jateng", name: "Bank Jateng", badge: "bg-rose-600 text-white border-rose-700" },
  { id: "BCA", name: "Bank BCA", badge: "bg-indigo-600 text-white border-indigo-700" },
  { id: "Mandiri", name: "Bank Mandiri", badge: "bg-sky-600 text-white border-sky-700" },
  { id: "Tunai", name: "Tunai / Kas", badge: "bg-emerald-600 text-white border-emerald-700" },
];

interface MaterialDoc {
  id: string;
  code?: string;
  nama?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyKecil?: number;
  metodePembelian?: string;
  qtyBesar?: number;
  qtyGudangKecil?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  stockValue?: number;
  priceHistory?: Array<{
    price: number;
    priceKecil: number;
    qtyKecilPerUnit: number;
    recordedAt: string;
    note: string;
  }>;
}

interface LogItemDoc {
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  qty?: number;
  qtyGdm?: number;
  qtyKedungreja?: number;
  qtyKecilPerUnit?: number;
  unit?: string;
  satuanKecil?: string;
  price?: number;
  subtotal?: number;
  addedBulkQty?: number;
  addedSmallUnits?: number;
  totalQtyKecil?: number;
  isBeliSendiri?: boolean;
  targetWarehouse?: WarehouseId;
  warehouseName?: string;
  hargaSatuanKecil?: number;
  avgPrice?: number;
}

interface PurchaseLogDoc {
  id: string;
  nomorNota?: string;
  targetLocation?: string;
  location?: string;
  targetWarehouse?: string;
  targetBranch?: string;
  type?: string;
  bank?: string;
  adminFee?: number;
  totalItems?: number;
  createdAt?: { toDate?: () => Date; seconds?: number; nanoseconds?: number } | null;
  items?: LogItemDoc[];
}

interface InputItem {
  materialId: string;
  qty: number;             // Total Qty Beli
  qtyGdm: number;          // Alokasi Qty ke Gudang GDM
  qtyKedungreja: number;   // Alokasi Qty ke Gudang Kedungreja
  qtyKecilPerUnit?: number; // Isi per Pack/Box/Pcs (Satuan Kecil) khusus Beli Sendiri
  price: number;
}

export default function InputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const activeBranch = useActiveBranch();
  
  const [targetLocation, setTargetLocation] = useState<"gudang" | "kontainer">("kontainer");
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseId>(() => getWarehouseForBranch(activeBranch));
  const [selectedTargetBranch, setSelectedTargetBranch] = useState<BranchId>(activeBranch);

  const [purchaseType, setPurchaseType] = useState<string>("supplier");
  const [selectedBank, setSelectedBank] = useState<string>("BCA");
  const [adminFee, setAdminFee] = useState<string>("");
  const [nomorNota, setNomorNota] = useState<string>("");
  
  const [items, setItems] = useState<InputItem[]>([
    { materialId: "", qty: 0, qtyGdm: 0, qtyKedungreja: 0, qtyKecilPerUnit: 1, price: 0 }
  ]);
  const [saving, setSaving] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Sync when activeBranch changes
  React.useEffect(() => {
    queueMicrotask(() => {
      const defaultWh = getWarehouseForBranch(activeBranch);
      setSelectedWarehouse(defaultWh);
      setSelectedTargetBranch(activeBranch);
    });
  }, [activeBranch]);

  // Fetch Master Bahan Baku dynamically based on target location
  const materialsQuery = useMemoFirebase(() => {
    if (targetLocation === "gudang") {
      // In Gudang mode, query primary master catalog (GDM has all unified physical materials)
      return query(warehouseCollection(db, "bahan-baku", "gdm"), orderBy("nama", "asc"));
    }
    return query(branchCollection(db, "bahan-baku", selectedTargetBranch), orderBy("nama", "asc"));
  }, [db, targetLocation, selectedTargetBranch]);
  
  const { data: rawMaterials } = useCollection(materialsQuery);
  const materials = useMemo(() => {
    if (!rawMaterials) return null;
    const allMats = rawMaterials as MaterialDoc[];
    if (targetLocation === "gudang") {
      // Filter out Pembuatan Sendiri from Gudang
      return allMats.filter(m => m.metodePembelian !== "Pembuatan Sendiri");
    }
    return allMats;
  }, [rawMaterials, targetLocation]);

  // Fetch Histori Input Bahan dynamically
  const historyQuery = useMemoFirebase(() => {
    if (targetLocation === "gudang") {
      return query(warehouseCollection(db, "log_pembelian_bahan", selectedWarehouse), orderBy("createdAt", "desc"), limit(10));
    }
    return query(branchCollection(db, "log_pembelian_bahan", selectedTargetBranch), orderBy("createdAt", "desc"), limit(10));
  }, [db, targetLocation, selectedWarehouse, selectedTargetBranch]);

  const { data: rawHistory } = useCollection(historyQuery);
  const history = rawHistory as PurchaseLogDoc[] | null;

  const downloadExcelTemplate = async (location: "gudang" | "kontainer", pType: "supplier" | "belanja") => {
    try {
      setDownloadingTemplate(true);
      // Fetch full master catalog for template generation
      const snap = await getDocs(
        location === "gudang"
          ? query(warehouseCollection(db, "bahan-baku", "gdm"), orderBy("nama", "asc"))
          : query(branchCollection(db, "bahan-baku", selectedTargetBranch), orderBy("nama", "asc"))
      );

      let fetchedMaterials: MaterialDoc[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialDoc));
      if (location === "gudang") {
        fetchedMaterials = fetchedMaterials.filter(m => m.metodePembelian !== "Pembuatan Sendiri");
      }

      const filteredMaterials = fetchedMaterials.filter(m => {
        const isBeliSendiri = m.metodePembelian === "Beli Sendiri";
        return pType === "belanja" ? isBeliSendiri : !isBeliSendiri;
      });

      if (filteredMaterials.length === 0) {
        toast({
          variant: "destructive",
          title: "Template Kosong",
          description: `Tidak ada bahan baku master dengan metode: ${pType === "belanja" ? "Beli Sendiri" : "Supliyer"}.`,
        });
        return;
      }

      const templateRows = filteredMaterials.map((m: MaterialDoc) => ({
        "KODE BAHAN": m.code || "",
        "NAMA BAHAN": m.nama || "",
        "SATUAN BESAR": m.satuanBesar || "",
        "TOTAL JUMLAH (SATUAN BESAR)": 0,
        ...(location === "gudang" ? {
          "ALOKASI GUDANG GDM": 0,
          "ALOKASI GUDANG KEDUNGREJA": 0,
        } : {}),
        "ISI SATUAN KECIL PER UNIT": Number(m.qtyKecil || 1),
        "HARGA BELI PER SATUAN BESAR": 0,
        "SATUAN KECIL": m.satuanKecil || "",
      }));

      const ws = XLSX.utils.json_to_sheet(templateRows);
      const wb = XLSX.utils.book_new();
      const sheetName = `${location === "gudang" ? "Gudang" : "Kontainer"} - ${pType === "belanja" ? "Beli Sendiri" : "Supliyer"}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
      XLSX.writeFile(wb, `Template_Input_${location === "gudang" ? "Gudang" : "Kontainer"}_${pType === "belanja" ? "BeliSendiri" : "Supliyer"}.xlsx`);

      toast({
        title: "Template Diunduh",
        description: `Template Excel ${location === "gudang" ? "Gudang Utama" : "Kontainer"} (${pType === "belanja" ? "Beli Sendiri" : "Supliyer"}) berhasil diunduh.`,
      });
      setTemplateModalOpen(false);
    } catch (err) {
      console.error("Gagal mengunduh template Excel:", err);
      toast({
        variant: "destructive",
        title: "Gagal Mengunduh Template",
        description: "Terjadi kesalahan saat membuat file Excel template.",
      });
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
        if (!rawRows || rawRows.length === 0) {
          toast({
            variant: "destructive",
            title: "Excel Kosong",
            description: "Format Excel tidak dikenali atau tidak memiliki baris data.",
          });
          return;
        }

        const fileNameLower = file.name.toLowerCase();
        const sheetNameLower = (firstSheetName || "").toLowerCase();

        const isGudang = fileNameLower.includes("gudang") || sheetNameLower.includes("gudang");
        const detectedLocation = isGudang ? "gudang" : "kontainer";

        const isBeliSendiri = fileNameLower.includes("beli") || fileNameLower.includes("belanja") || sheetNameLower.includes("beli") || sheetNameLower.includes("belanja");
        const detectedPurchaseType = isBeliSendiri ? "belanja" : "supplier";

        const parsedItems: InputItem[] = [];
        rawRows.forEach((row: Record<string, unknown>) => {
          const code = String(row["KODE BAHAN"] || "").trim().toUpperCase();
          const qtyTotal = Number(row["TOTAL JUMLAH (SATUAN BESAR)"] || row["JUMLAH (SATUAN BESAR)"] || 0);
          let qtyGdm = Number(row["ALOKASI GUDANG GDM"] || 0);
          const qtyKedungreja = Number(row["ALOKASI GUDANG KEDUNGREJA"] || 0);
          const price = Number(row["HARGA BELI PER SATUAN BESAR"] || 0);
          const qtyKecilPerUnit = Number(row["ISI SATUAN KECIL PER UNIT"] || 1);

          if (!code || qtyTotal <= 0) return;

          // If allocation was not filled, default 100% to GDM
          if (qtyGdm === 0 && qtyKedungreja === 0) {
            qtyGdm = qtyTotal;
          }

          const mat = materials?.find(m => String(m.code || "").trim().toUpperCase() === code);
          if (mat) {
            parsedItems.push({
              materialId: mat.id,
              qty: qtyTotal,
              qtyGdm,
              qtyKedungreja,
              qtyKecilPerUnit,
              price,
            });
          }
        });

        if (parsedItems.length === 0) {
          toast({
            variant: "destructive",
            title: "Tidak Ada Item Valid",
            description: "Tidak ditemukan baris bahan baku dengan Jumlah (Satuan Besar) > 0 yang cocok dengan master data.",
          });
          return;
        }

        setItems(parsedItems);
        setTargetLocation(detectedLocation);
        setPurchaseType(detectedPurchaseType);

        toast({
          title: "Excel Berhasil Diimpor",
          description: `Berhasil memuat ${parsedItems.length} item (${detectedPurchaseType === "belanja" ? "Beli Sendiri" : "Supliyer"}) untuk ${detectedLocation === "gudang" ? "Gudang Utama" : "Kontainer"}. Silakan periksa nomor nota dan simpan.`,
        });

      } catch (err) {
        console.error("Gagal membaca file Excel:", err);
        toast({
          variant: "destructive",
          title: "Gagal Mengimpor Excel",
          description: "Terjadi kesalahan saat membaca struktur file Excel Anda.",
        });
      }
    };
    reader.onloadend = () => {};
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleAddItem = () => {
    setItems([...items, { 
      materialId: "", 
      qty: 0, 
      qtyGdm: 0, 
      qtyKedungreja: 0, 
      qtyKecilPerUnit: 1, 
      price: 0 
    }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Change Handler dengan Logika Auto-Calculate Sisa Pembagian Gudang
  const handleItemChange = (index: number, field: keyof InputItem, value: string | number) => {
    const newItems = [...items];
    const currentItem = newItems[index];

    if (field === 'materialId') {
      const selectedMat = materials?.find(m => m.id === value);
      newItems[index] = {
        ...currentItem,
        materialId: String(value),
        qtyKecilPerUnit: Number(selectedMat?.qtyKecil || 1),
      };
    } else if (field === 'qty') {
      const totalQty = Math.max(0, Number(value));
      // Saat total qty diubah: defaultkan porsi ke gudang aktif terpilih
      if (selectedWarehouse === 'kedungreja') {
        newItems[index] = {
          ...currentItem,
          qty: totalQty,
          qtyGdm: 0,
          qtyKedungreja: totalQty,
        };
      } else {
        newItems[index] = {
          ...currentItem,
          qty: totalQty,
          qtyGdm: totalQty,
          qtyKedungreja: 0,
        };
      }
    } else if (field === 'qtyGdm') {
      const valGdm = Math.max(0, Number(value));
      const totalQty = currentItem.qty || 0;
      const safeGdm = Math.min(totalQty, valGdm);
      // Auto calculate sisa untuk Kedungreja
      const autoKedungreja = Math.max(0, totalQty - safeGdm);

      newItems[index] = {
        ...currentItem,
        qtyGdm: safeGdm,
        qtyKedungreja: autoKedungreja,
      };
    } else if (field === 'qtyKedungreja') {
      const valKedungreja = Math.max(0, Number(value));
      const totalQty = currentItem.qty || 0;
      const safeKedungreja = Math.min(totalQty, valKedungreja);
      // Auto calculate sisa untuk GDM
      const autoGdm = Math.max(0, totalQty - safeKedungreja);

      newItems[index] = {
        ...currentItem,
        qtyKedungreja: safeKedungreja,
        qtyGdm: autoGdm,
      };
    } else {
      newItems[index] = { ...currentItem, [field]: value };
    }

    setItems(newItems);
  };

  // Quick Action: Terapkan 100% satu gudang ke semua baris bahan
  const handleApplyAllWarehouse = (wId: WarehouseId) => {
    setSelectedWarehouse(wId);
    setItems(prev => prev.map(it => {
      const total = it.qty || 0;
      return {
        ...it,
        qtyGdm: wId === 'gdm' ? total : 0,
        qtyKedungreja: wId === 'kedungreja' ? total : 0,
      };
    }));
    toast({
      title: "Gudang Diselaraskan",
      description: `Seluruh kuantitas belanja dialokasikan 100% ke ${WAREHOUSE_LIST[wId].name}.`
    });
  };

  // Quick Action per row: Preset Cepat
  const handleRowPreset = (index: number, mode: 'gdm_all' | 'kdrj_all' | 'split') => {
    const newItems = [...items];
    const total = newItems[index].qty || 0;
    if (mode === 'gdm_all') {
      newItems[index].qtyGdm = total;
      newItems[index].qtyKedungreja = 0;
    } else if (mode === 'kdrj_all') {
      newItems[index].qtyGdm = 0;
      newItems[index].qtyKedungreja = total;
    } else if (mode === 'split') {
      newItems[index].qtyGdm = Math.ceil(total / 2);
      newItems[index].qtyKedungreja = Math.floor(total / 2);
    }
    setItems(newItems);
  };

  const cleanNumber = (val: unknown): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nomorNota.trim()) {
      toast({
        variant: "destructive",
        title: "Nomor Nota Wajib Diisi",
        description: "Silakan masukkan nomor nota/invoice penerimaan barang.",
      });
      return;
    }

    const validItems = items.filter(item => item.materialId && item.qty > 0);
    if (validItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Bahan Baku Kosong",
        description: "Pilih minimal satu bahan baku dengan jumlah lebih dari 0.",
      });
      return;
    }

    for (const item of validItems) {
      const mat = materials?.find(m => m.id === item.materialId);
      const isBeliSendiri = mat?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";
      
      if (isBeliSendiri && (!item.qtyKecilPerUnit || item.qtyKecilPerUnit <= 0)) {
        toast({
          variant: "destructive",
          title: "Isi Pack/Box Wajib Diisi",
          description: `Bahan "${mat?.nama || 'Terpilih'}" merupakan Beli Sendiri. Anda wajib menginput isi per ${mat?.satuanBesar || 'pack/box/pcs'} (> 0).`,
        });
        return;
      }

      // Validasi pembagian gudang jika target adalah gudang
      if (targetLocation === "gudang") {
        const totalAllocated = (item.qtyGdm || 0) + (item.qtyKedungreja || 0);
        if (totalAllocated !== item.qty) {
          toast({
            variant: "destructive",
            title: "Alokasi Gudang Belum Sesuai",
            description: `Pada bahan "${mat?.nama}", total alokasi (GDM: ${item.qtyGdm || 0} + Kedungreja: ${item.qtyKedungreja || 0} = ${totalAllocated}) harus sama dengan Total Beli (${item.qty}).`,
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const isTargetGudang = targetLocation === "gudang";
      const numericAdminFee = purchaseType === "supplier" ? cleanNumber(adminFee) : 0;
      
      const logItems: LogItemDoc[] = [];
      let totalGdmUnits = 0;
      let totalKdrjUnits = 0;

      for (const item of validItems) {
        const material = materials?.find(m => m.id === item.materialId);
        const currentMaterial = material || { qtyBesar: 0, qtyGudangKecil: 0, qtyKontainerBesar: 0, qtyKontainerKecil: 0, stockValue: 0 };
        const isBeliSendiri = material?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";
        
        const standardConversion = Number(material?.qtyKecil || 1);
        const actualConversion = isBeliSendiri 
          ? Number(item.qtyKecilPerUnit || material?.qtyKecil || 1) 
          : standardConversion;

        const totalSmallUnitsPurchased = item.qty * actualConversion;
        const fullBulkUnits = Math.floor(totalSmallUnitsPurchased / (standardConversion || 1));
        const remainderSmallUnits = Math.round((totalSmallUnitsPurchased - (fullBulkUnits * standardConversion)) * 100) / 100;
        
        const pricePerKecil = actualConversion > 0 ? (item.price / actualConversion) : item.price;
        const totalBulkEquivalent = standardConversion > 0 ? (totalSmallUnitsPurchased / standardConversion) : item.qty;
        const updated = applyPurchase(currentMaterial, totalBulkEquivalent, item.price);

        if (isTargetGudang) {
          const qtyGdm = Number(item.qtyGdm || 0);
          const qtyKedungreja = Number(item.qtyKedungreja || 0);

          totalGdmUnits += qtyGdm;
          totalKdrjUnits += qtyKedungreja;

          // 1. Eksekusi Porsi Gudang GDM jika ada
          if (qtyGdm > 0) {
            const gdmRef = warehouseDoc(db, "bahan-baku", item.materialId, "gdm");
            const gdmSmallUnits = qtyGdm * actualConversion;
            const gdmBulkUnits = Math.floor(gdmSmallUnits / (standardConversion || 1));
            const gdmRemSmall = Math.round((gdmSmallUnits - (gdmBulkUnits * standardConversion)) * 100) / 100;

            const gdmPayload: Record<string, unknown> = {
              currentPrice: item.price,
              hargaSatuanKecil: pricePerKecil,
            };
            if (gdmBulkUnits > 0) gdmPayload.qtyBesar = increment(gdmBulkUnits);
            if (gdmRemSmall > 0) gdmPayload.qtyGudangKecil = increment(gdmRemSmall);
            batch.update(gdmRef, gdmPayload);
          }

          // 2. Eksekusi Porsi Gudang Kedungreja jika ada
          if (qtyKedungreja > 0) {
            const kdrjRef = warehouseDoc(db, "bahan-baku", item.materialId, "kedungreja");
            const kdrjSmallUnits = qtyKedungreja * actualConversion;
            const kdrjBulkUnits = Math.floor(kdrjSmallUnits / (standardConversion || 1));
            const kdrjRemSmall = Math.round((kdrjSmallUnits - (kdrjBulkUnits * standardConversion)) * 100) / 100;

            const kdrjPayload: Record<string, unknown> = {
              currentPrice: item.price,
              hargaSatuanKecil: pricePerKecil,
            };
            if (kdrjBulkUnits > 0) kdrjPayload.qtyBesar = increment(kdrjBulkUnits);
            if (kdrjRemSmall > 0) kdrjPayload.qtyGudangKecil = increment(kdrjRemSmall);
            batch.update(kdrjRef, kdrjPayload);
          }
        } else {
          // Eksekusi Target Kontainer Toko
          const containerRef = branchDoc(db, "bahan-baku", item.materialId, selectedTargetBranch);
          const updatePayload: Record<string, unknown> = {
            stockValue: updated.stockValue,
            avgPrice: updated.avgPrice,
            currentPrice: item.price,
            hargaSatuanKecil: pricePerKecil,
          };
          if (fullBulkUnits > 0) updatePayload.qtyKontainerBesar = increment(fullBulkUnits);
          if (remainderSmallUnits > 0) updatePayload.qtyKontainerKecil = increment(remainderSmallUnits);
          batch.update(containerRef, updatePayload);
        }

        logItems.push({
          materialId: item.materialId,
          materialName: material?.nama || "-",
          materialCode: material?.code || "-",
          isBeliSendiri: isBeliSendiri,
          qty: item.qty,
          qtyGdm: isTargetGudang ? Number(item.qtyGdm || 0) : undefined,
          qtyKedungreja: isTargetGudang ? Number(item.qtyKedungreja || 0) : undefined,
          addedBulkQty: fullBulkUnits,
          addedSmallUnits: remainderSmallUnits,
          unit: material?.satuanBesar || "-",
          qtyKecilPerUnit: actualConversion,
          satuanKecil: material?.satuanKecil || "-",
          totalQtyKecil: totalSmallUnitsPurchased,
          price: item.price,
          hargaSatuanKecil: pricePerKecil,
          avgPrice: updated.avgPrice,
          subtotal: item.qty * item.price,
        });
      }

      // Catat Log Pembelian ke koleksi
      const logRef = isTargetGudang
        ? doc(warehouseCollection(db, "log_pembelian_bahan", selectedWarehouse))
        : doc(branchCollection(db, "log_pembelian_bahan", selectedTargetBranch));

      const logData = {
        nomorNota: nomorNota.trim(),
        targetLocation,
        targetWarehouse: isTargetGudang ? selectedWarehouse : null,
        targetBranch: !isTargetGudang ? selectedTargetBranch : null,
        location: isTargetGudang ? "gudang" : "kontainer",
        type: purchaseType,
        bank: purchaseType === "supplier" ? selectedBank : null,
        adminFee: numericAdminFee,
        totalItems: validItems.length,
        createdAt: serverTimestamp(),
        items: logItems,
      };

      batch.set(logRef, logData);

      // Jika ada Biaya Admin Transaksi Bank (Khusus Supplier) -> Otomatis Catat ke Pengeluaran Operasional Toko
      if (purchaseType === "supplier" && numericAdminFee > 0) {
        const adminExpenseRef = doc(collection(db, "operasional-toko"));
        const expenseData = {
          tanggal: new Date().toISOString().split("T")[0],
          paymentType: "admin_bank_supplier",
          paymentTypeLabel: `Biaya Admin Bank ${selectedBank} (Nota #${nomorNota.trim()})`,
          nominal: numericAdminFee,
          catatan: `Biaya Admin Transaksi Bank ${selectedBank} untuk Pembelian Supplier Nota #${nomorNota.trim()}`,
          total: numericAdminFee,
          bank: selectedBank,
          nomorNota: nomorNota.trim(),
          source: "Input Bahan Supplier",
          createdAt: serverTimestamp(),
        };
        batch.set(adminExpenseRef, expenseData);
      }

      await batch.commit();

      let targetDescription = "";
      if (isTargetGudang) {
        if (totalGdmUnits > 0 && totalKdrjUnits > 0) {
          targetDescription = `Multi-Gudang (GDM: ${totalGdmUnits}, Kedungreja: ${totalKdrjUnits})`;
        } else if (totalKdrjUnits > 0) {
          targetDescription = "Gudang Kedungreja";
        } else {
          targetDescription = "Gudang Gandrungmangu (GDM)";
        }
      } else {
        targetDescription = BRANCH_LIST[selectedTargetBranch].name;
      }

      toast({
        title: "Input Bahan Berhasil Disimpan",
        description: `Nota #${nomorNota} telah dicatat ke ${targetDescription}.${numericAdminFee > 0 ? ` Biaya Admin Rp ${numericAdminFee.toLocaleString('id-ID')} otomatis dicatat ke Operasional Toko.` : ''}`,
      });

      // Reset form
      setNomorNota("");
      setAdminFee("");
      setItems([{ 
        materialId: "", 
        qty: 0, 
        qtyGdm: 0, 
        qtyKedungreja: 0, 
        qtyKecilPerUnit: 1, 
        price: 0 
      }]);
    } catch (error) {
      console.error("Gagal menyimpan input bahan:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat memproses data ke database.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (log: PurchaseLogDoc) => {
    const isConfirmed = confirm(
      `PERINGATAN: Menghapus nota #${log.nomorNota} akan OTOMATIS MENGURANGI (MENGEMBALIKAN) stok bahan baku yang sudah ditambahkan sebelumnya dan membatalkan biaya admin terkait. Lanjutkan penghapusan?`
    );

    if (!isConfirmed) return;

    try {
      const batch = writeBatch(db);
      const isTargetGudang = (log.targetLocation === "gudang" || log.location === "gudang");
      const defaultLogWarehouse: WarehouseId = (log.targetWarehouse as WarehouseId) || selectedWarehouse;
      const logBranch: BranchId = (log.targetBranch as BranchId) || selectedTargetBranch;

      if (Array.isArray(log.items)) {
        for (const item of log.items) {
          if (!item.materialId) continue;

          const matDetail = materials?.find(m => m.id === item.materialId);
          const standardConversion = Number(matDetail?.qtyKecil || 1);
          const actualConversion = Number(item.qtyKecilPerUnit || standardConversion);

          if (isTargetGudang) {
            const qtyGdm = Number(item.qtyGdm ?? (item.targetWarehouse === 'kedungreja' ? 0 : item.qty));
            const qtyKedungreja = Number(item.qtyKedungreja ?? (item.targetWarehouse === 'kedungreja' ? item.qty : 0));

            // Kembalikan dari GDM
            if (qtyGdm > 0) {
              const gdmRef = warehouseDoc(db, "bahan-baku", item.materialId, "gdm");
              const gdmSmall = qtyGdm * actualConversion;
              const gdmBulk = Math.floor(gdmSmall / (standardConversion || 1));
              const gdmRem = Math.round((gdmSmall - (gdmBulk * standardConversion)) * 100) / 100;
              const gdmPayload: Record<string, unknown> = {};
              if (gdmBulk > 0) gdmPayload.qtyBesar = increment(-gdmBulk);
              if (gdmRem > 0) gdmPayload.qtyGudangKecil = increment(-gdmRem);
              if (Object.keys(gdmPayload).length > 0) batch.update(gdmRef, gdmPayload);
            }

            // Kembalikan dari Kedungreja
            if (qtyKedungreja > 0) {
              const kdrjRef = warehouseDoc(db, "bahan-baku", item.materialId, "kedungreja");
              const kdrjSmall = qtyKedungreja * actualConversion;
              const kdrjBulk = Math.floor(kdrjSmall / (standardConversion || 1));
              const kdrjRem = Math.round((kdrjSmall - (kdrjBulk * standardConversion)) * 100) / 100;
              const kdrjPayload: Record<string, unknown> = {};
              if (kdrjBulk > 0) kdrjPayload.qtyBesar = increment(-kdrjBulk);
              if (kdrjRem > 0) kdrjPayload.qtyGudangKecil = increment(-kdrjRem);
              if (Object.keys(kdrjPayload).length > 0) batch.update(kdrjRef, kdrjPayload);
            }
          } else {
            // Kembalikan dari Kontainer
            const containerRef = branchDoc(db, "bahan-baku", item.materialId, logBranch);
            const totalSmall = Number(item.totalQtyKecil || ((item.qty || 0) * actualConversion));
            const bulkToDeduct = Math.floor(totalSmall / (standardConversion || 1));
            const smallToDeduct = Math.round((totalSmall - (bulkToDeduct * standardConversion)) * 100) / 100;
            const containerPayload: Record<string, unknown> = {};
            if (bulkToDeduct > 0) containerPayload.qtyKontainerBesar = increment(-bulkToDeduct);
            if (smallToDeduct > 0) containerPayload.qtyKontainerKecil = increment(-smallToDeduct);
            if (Object.keys(containerPayload).length > 0) batch.update(containerRef, containerPayload);
          }
        }
      }

      // Hapus dokumen log pembelian
      const logRef = isTargetGudang
        ? doc(warehouseCollection(db, "log_pembelian_bahan", defaultLogWarehouse), log.id)
        : doc(branchCollection(db, "log_pembelian_bahan", logBranch), log.id);

      batch.delete(logRef);

      // Hapus catatan Biaya Admin terkait dari operasional-toko jika ada
      if (log.nomorNota) {
        try {
          const expQuery = query(collection(db, "operasional-toko"), where("nomorNota", "==", log.nomorNota));
          const expSnap = await getDocs(expQuery);
          expSnap.forEach(d => batch.delete(d.ref));
        } catch (e) {
          console.error("Gagal membersihkan biaya admin terkait:", e);
        }
      }

      await batch.commit();

      toast({
        title: "Nota Pembelian Dihapus",
        description: `Nota #${log.nomorNota} telah dihapus dan stok telah dikembalikan.`,
      });
    } catch (error) {
      console.error("Gagal menghapus log pembelian:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat menghapus data pembelian.",
      });
    }
  };

  const totalCalculated = items.reduce((acc, item) => acc + (item.qty * item.price), 0);
  const totalAdminFeeNum = purchaseType === "supplier" ? cleanNumber(adminFee) : 0;
  const grandTotalWithAdmin = totalCalculated + totalAdminFeeNum;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Input Bahan Baku</h1>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Penerimaan Barang ke Gudang Utama Terpadu / Area Kontainer Toko
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Tombol Unduh Template Excel */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTemplateModalOpen(true)}
            className="h-10 sm:h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider gap-2 shadow-sm text-slate-700 hover:bg-slate-50 hover:text-primary transition-all"
          >
            <FileDown className="h-4 w-4 text-primary shrink-0" />
            <span>Unduh Template Excel</span>
          </Button>

          {/* Tombol Impor Excel */}
          <div className="relative">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleImportExcel}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 sm:h-11 rounded-2xl border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider gap-2 shadow-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition-all"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Impor Excel</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden">
            <div className="p-6 sm:p-8 md:p-12">
              <form onSubmit={handleSave} className="space-y-8">
                {/* 1. Selection: Tujuan Stok (Gudang Utama vs Kontainer) */}
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Tujuan Stok (Lokasi Penerimaan Barang)
                  </Label>
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <Button 
                      type="button"
                      variant="ghost" 
                      onClick={() => setTargetLocation('kontainer')}
                      className={cn(
                        "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                        targetLocation === 'kontainer' ? "bg-white shadow-sm text-emerald-600 font-bold" : "text-slate-400"
                      )}
                    >
                      <Store className="h-4 w-4" /> Area Kontainer Toko
                    </Button>
                    <Button 
                      type="button"
                      variant="ghost" 
                      onClick={() => setTargetLocation('gudang')}
                      className={cn(
                        "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                        targetLocation === 'gudang' ? "bg-white shadow-sm text-primary font-bold" : "text-slate-400"
                      )}
                    >
                      <Building2 className="h-4 w-4" /> Gudang Utama
                    </Button>
                  </div>
                </div>

                {/* 2. Switcher Lokasi Spesifik / Multi-Gudang per Nota */}
                {targetLocation === "gudang" ? (
                  /* 2 TOMBOL SWITCHER GUDANG UTAMA + FITUR MULTI-GUDANG */
                  <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                        Alokasi Gudang Utama Penerimaan:
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase">Set Semua Baris:</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyAllWarehouse('gdm')}
                          className={cn(
                            "h-6 rounded-lg text-[8px] font-black uppercase px-2 gap-1",
                            selectedWarehouse === 'gdm' ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "bg-white text-slate-600"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Semua GDM
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyAllWarehouse('kedungreja')}
                          className={cn(
                            "h-6 rounded-lg text-[8px] font-black uppercase px-2 gap-1",
                            selectedWarehouse === 'kedungreja' ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "bg-white text-slate-600"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                          Semua Kedungreja
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyAllWarehouse('gdm')}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                          selectedWarehouse === 'gdm'
                            ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.01]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-xs font-black uppercase">Gudang Gandrungmangu (GDM)</span>
                        </div>
                        <span className={cn(
                          "text-[9px] font-bold mt-1",
                          selectedWarehouse === 'gdm' ? "text-slate-300" : "text-slate-500"
                        )}>
                          Gudang Terpadu Zona Waktu & Teh Warga
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyAllWarehouse('kedungreja')}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                          selectedWarehouse === 'kedungreja'
                            ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.01]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                          <span className="text-xs font-black uppercase">Gudang Kedungreja</span>
                        </div>
                        <span className={cn(
                          "text-[9px] font-bold mt-1",
                          selectedWarehouse === 'kedungreja' ? "text-slate-300" : "text-slate-500"
                        )}>
                          Gudang Utama Zona Waktu Kedungreja
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[9px] font-medium text-slate-600 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100">
                      <Split className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Fitur Pembagian Qty Otomatis:</strong> Anda dapat langsung membagi kuantitas bahan pada setiap baris item (misal: Total 5 $ightarrow$ isi GDM 3, maka Kedungreja otomatis terisi 2).
                      </span>
                    </div>
                  </div>
                ) : (
                  /* 3 TOMBOL SWITCHER KONTAINER TOKO */
                  <div className="space-y-2 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                      Pilih Kontainer Toko Tujuan (3 Outlet):
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTargetBranch('gdm')}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          selectedTargetBranch === 'gdm'
                            ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.01]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-xs font-black uppercase">Zona Waktu GDM</span>
                        </div>
                        <span className={cn("text-[8px] font-bold block mt-0.5", selectedTargetBranch === 'gdm' ? "text-slate-300" : "text-slate-400")}>
                          Kontainer Gandrungmangu
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedTargetBranch('kedungreja')}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          selectedTargetBranch === 'kedungreja'
                            ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.01]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                          <span className="text-xs font-black uppercase">Zona Kedungreja</span>
                        </div>
                        <span className={cn("text-[8px] font-bold block mt-0.5", selectedTargetBranch === 'kedungreja' ? "text-slate-300" : "text-slate-400")}>
                          Kontainer Kedungreja
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedTargetBranch('tehwarga')}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          selectedTargetBranch === 'tehwarga'
                            ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.01]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs font-black uppercase">Teh Warga GDM</span>
                        </div>
                        <span className={cn("text-[8px] font-bold block mt-0.5", selectedTargetBranch === 'tehwarga' ? "text-slate-300" : "text-slate-400")}>
                          Kontainer Teh Warga
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Header Nota: Jenis Pembelian & Nomor Nota */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jenis Pembelian</Label>
                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setPurchaseType('supplier')}
                        className={cn(
                          "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                          purchaseType === 'supplier' ? "bg-white shadow-sm text-primary font-bold" : "text-slate-400"
                        )}
                      >
                        <Truck className="h-4 w-4" /> Supliyer
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        onClick={() => setPurchaseType('belanja')}
                        className={cn(
                          "flex-1 rounded-xl h-12 text-[10px] font-black uppercase tracking-widest gap-2 transition-all",
                          purchaseType === 'belanja' ? "bg-white shadow-sm text-amber-600 font-bold" : "text-slate-400"
                        )}
                      >
                        <ShoppingCart className="h-4 w-4" /> Beli Sendiri
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nomor Nota / Invoice</Label>
                    <div className="relative">
                       <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                       <Input 
                         value={nomorNota}
                         onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                         className="rounded-2xl border-slate-100 h-14 bg-slate-50 pl-12 font-black text-slate-900 placeholder:font-bold text-sm"
                         placeholder="CONTOH: INV/2024/001"
                         required
                       />
                    </div>
                  </div>
                </div>

                {/* Khusus Transaksi Suplier: Pilihan Bank & Biaya Admin Transaksi */}
                {purchaseType === "supplier" && (
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-indigo-600" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-950">
                          Rekap Pembayaran Bank & Biaya Admin (Suplier)
                        </span>
                      </div>
                      <span className="text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        Auto Masuk Operasional Toko
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pilihan Bank */}
                      <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-indigo-600" /> Pilihan Bank Transaksi:
                        </Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {BANK_OPTIONS.map((bank) => (
                            <button
                              key={bank.id}
                              type="button"
                              onClick={() => setSelectedBank(bank.id)}
                              className={cn(
                                "h-9 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all flex items-center justify-center gap-1",
                                selectedBank === bank.id 
                                  ? "bg-indigo-600 text-white border-indigo-700 shadow-sm scale-[1.02]" 
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              )}
                            >
                              {selectedBank === bank.id && <CheckCircle2 className="h-3 w-3" />}
                              <span>{bank.id}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Input Nominal Biaya Admin Transaksi */}
                      <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                          Biaya Admin Bank / Transfer (Rp):
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">Rp</span>
                          <Input
                            type="text"
                            value={formatThousand(adminFee)}
                            onChange={(e) => setAdminFee(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="Contoh: 2.500"
                            className="rounded-xl h-11 bg-white border-slate-200 pl-10 font-black text-slate-900 text-sm placeholder:font-bold"
                          />
                        </div>
                        <p className="text-[8.5px] font-medium text-slate-500 leading-tight">
                          *Biaya admin akan otomatis dicatat sebagai <strong>Pengeluaran Operasional Toko</strong> di laporan keuangan.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Banner Penjelasan Beli Sendiri */}
                {purchaseType === "belanja" && (
                  <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-amber-900 flex items-start gap-3 text-xs">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black uppercase tracking-wider block">Mode Beli Sendiri Aktif</span>
                      <p className="mt-0.5 text-amber-800 leading-relaxed text-[11px]">
                        Isi <strong>Isi Satuan Kecil</strong> sesuai berat/kemasan aktual yang Anda beli di pasar/supermarket. Sistem otomatis mengalikan ke satuan kecil, membulatkan Satuan Besar, dan menampung sisa gramasi di Satuan Kecil.
                      </p>
                    </div>
                  </div>
                )}

                {/* List Item Bahan */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Daftar Bahan Yang Diterima</Label>
                    <Button 
                      type="button" 
                      onClick={handleAddItem}
                      variant="outline" 
                      size="sm"
                      className="rounded-xl border-dashed border-primary text-primary hover:bg-primary/5 text-[9px] font-black uppercase tracking-widest gap-1.5 h-8"
                    >
                      <PlusCircle className="h-3.5 w-3.5" /> Tambah Bahan
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, index) => {
                      const selectedMat = materials?.find(m => m.id === item.materialId);
                      const isBeliSendiri = selectedMat?.metodePembelian === "Beli Sendiri" || purchaseType === "belanja";
                      const qtyGdm = item.qtyGdm || 0;
                      const qtyKdrj = item.qtyKedungreja || 0;
                      const totalAllocated = qtyGdm + qtyKdrj;
                      const isAllocationMatch = totalAllocated === (item.qty || 0);
                      
                      return (
                        <div key={index} className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-3.5 relative group">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="absolute right-3 top-3 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}

                          {/* GRID UTAMA ITEM */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                            {/* 1. Pilih Bahan */}
                            <div className={cn(isBeliSendiri ? "sm:col-span-4" : "sm:col-span-5", "space-y-1")}>
                              <Label className="text-[9px] font-black uppercase text-slate-400">Pilih Bahan</Label>
                              <Select
                                value={item.materialId}
                                onValueChange={(val) => handleItemChange(index, 'materialId', val)}
                              >
                                <SelectTrigger className="rounded-xl h-11 bg-white border-slate-200 text-xs font-bold">
                                  <SelectValue placeholder="Pilih bahan..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl max-h-60">
                                  {materials?.map((m) => (
                                    <SelectItem key={m.id} value={m.id} className="text-xs font-bold">
                                      {m.code} - {m.nama}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* 2. Total Qty Satuan Besar */}
                            <div className="sm:col-span-2 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-slate-600">
                                Total Beli ({selectedMat?.satuanBesar || "Unit"})
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                value={item.qty || ""}
                                onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))}
                                className="rounded-xl h-11 bg-white border-slate-300 font-black text-sm text-center"
                                placeholder="0"
                              />
                            </div>

                            {/* 3. Isi Satuan Kecil Per Unit (Beli Sendiri) */}
                            {isBeliSendiri && (
                              <div className="sm:col-span-2 space-y-1">
                                <Label className="text-[9px] font-black uppercase text-amber-700 truncate block">
                                  Isi ({selectedMat?.satuanKecil || "Pcs"})
                                </Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.qtyKecilPerUnit ?? selectedMat?.qtyKecil ?? 1}
                                  onChange={(e) => handleItemChange(index, 'qtyKecilPerUnit', Number(e.target.value))}
                                  className="rounded-xl h-11 bg-amber-50/50 border-amber-200 text-xs font-black text-amber-900"
                                  placeholder="1"
                                />
                              </div>
                            )}

                            {/* 4. Harga Beli Satuan Besar */}
                            <div className={cn(isBeliSendiri ? "sm:col-span-4" : "sm:col-span-5", "space-y-1")}>
                              <Label className="text-[9px] font-black uppercase text-slate-400">
                                Harga Beli / {selectedMat?.satuanBesar || "Satuan"} (Rp)
                              </Label>
                              <Input
                                type="text"
                                value={formatThousand(item.price)}
                                onChange={(e) => handleItemChange(index, 'price', Number(e.target.value.replace(/[^\d]/g, "")))}
                                className="rounded-xl h-11 bg-white border-slate-200 text-xs font-black"
                                placeholder="0"
                              />
                            </div>
                          </div>

                          {/* KOTAK PEMBAGIAN GUDANG GDM & KEDUNGREJA (KHUSUS MODE GUDANG UTAMA) */}
                          {targetLocation === "gudang" && (item.qty > 0) && (
                            <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[9px]">
                                <div className="flex items-center gap-1.5">
                                  <Split className="h-3.5 w-3.5 text-primary" />
                                  <span className="font-black uppercase tracking-wider text-slate-700">
                                    Pembagian Alokasi Gudang ({item.qty} {selectedMat?.satuanBesar || "Unit"}):
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleRowPreset(index, 'gdm_all')}
                                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[8px] font-black uppercase text-slate-600"
                                  >
                                    100% GDM
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRowPreset(index, 'kdrj_all')}
                                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[8px] font-black uppercase text-slate-600"
                                  >
                                    100% Kedungreja
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRowPreset(index, 'split')}
                                    className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-[8px] font-black uppercase text-indigo-700"
                                  >
                                    Bagi 2
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                {/* Alokasi Gudang GDM */}
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                                  <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-[8.5px] font-black uppercase text-emerald-800 block leading-tight">
                                      Gudang GDM:
                                    </span>
                                    <span className="text-[7.5px] text-emerald-600 font-bold">Zona Waktu & Teh Warga</span>
                                  </div>
                                  <div className="relative w-24">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={item.qty}
                                      value={item.qtyGdm ?? 0}
                                      onChange={(e) => handleItemChange(index, 'qtyGdm', Number(e.target.value))}
                                      className="h-8 rounded-lg bg-white border-emerald-300 text-center font-black text-xs text-emerald-900 pr-6"
                                    />
                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[7.5px] font-bold text-slate-400">
                                      {selectedMat?.satuanBesar || "U"}
                                    </span>
                                  </div>
                                </div>

                                {/* Alokasi Gudang Kedungreja */}
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-50/50 border border-cyan-200/60">
                                  <div className="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-[8.5px] font-black uppercase text-cyan-800 block leading-tight">
                                      Gudang Kedungreja:
                                    </span>
                                    <span className="text-[7.5px] text-cyan-600 font-bold">Zona Waktu Kedungreja</span>
                                  </div>
                                  <div className="relative w-24">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={item.qty}
                                      value={item.qtyKedungreja ?? 0}
                                      onChange={(e) => handleItemChange(index, 'qtyKedungreja', Number(e.target.value))}
                                      className="h-8 rounded-lg bg-white border-cyan-300 text-center font-black text-xs text-cyan-900 pr-6"
                                    />
                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[7.5px] font-bold text-slate-400">
                                      {selectedMat?.satuanBesar || "U"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Status Validasi Alokasi */}
                              {!isAllocationMatch && (
                                <p className="text-[8px] font-bold text-rose-600">
                                  *Total alokasi ({totalAllocated}) belum sesuai dengan Total Beli ({item.qty}).
                                </p>
                              )}
                            </div>
                          )}

                          {/* Subtotal Item */}
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold px-1 pt-1 border-t border-slate-100">
                            <span>
                              {targetLocation === "gudang" && (
                                <span className="mr-2 text-[8.5px] font-black uppercase bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                                  GDM: {qtyGdm} | Kedungreja: {qtyKdrj}
                                </span>
                              )}
                              Total: {item.qty} {selectedMat?.satuanBesar || "Unit"} x Rp {(item.price || 0).toLocaleString('id-ID')}
                            </span>
                            <span className="font-black text-slate-900 text-xs">
                              Rp {(item.qty * item.price).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ringkasan Total & Tombol Simpan */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                      <span>Total Belanja Bahan:</span>
                      <span className="font-black text-slate-900 text-sm">Rp {totalCalculated.toLocaleString('id-ID')}</span>
                    </div>
                    {purchaseType === "supplier" && totalAdminFeeNum > 0 && (
                      <div className="flex items-center justify-between text-xs text-indigo-700 font-bold">
                        <span>Biaya Admin Bank ({selectedBank}):</span>
                        <span className="font-black text-indigo-900 text-sm">+ Rp {totalAdminFeeNum.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total Keseluruhan Nota:</span>
                        <span className="text-2xl font-black text-slate-900">
                          Rp {grandTotalWithAdmin.toLocaleString('id-ID')}
                        </span>
                      </div>
                      <Button
                        type="submit"
                        disabled={saving}
                        className="h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[11px] gap-2 shadow-lg shadow-emerald-200"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Menyimpan...</span>
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            <span>Simpan Input Bahan</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </Card>
        </div>

        {/* Riwayat Input Bahan Terakhir */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Riwayat Terakhir</h3>
              </div>
              <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {targetLocation === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].shortName : BRANCH_LIST[selectedTargetBranch].shortName}
              </span>
            </div>

            <div className="space-y-3">
              {history && history.length > 0 ? (
                history.map((log) => {
                  const isExpanded = expandedLog === log.id;
                  const formattedDate = log.createdAt?.toDate 
                    ? log.createdAt.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : "-";
                  const logTotal = (log.items || []).reduce((acc, it) => acc + (it.subtotal || ((it.qty || 0) * (it.price || 0))), 0);

                  return (
                    <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black text-primary block">#{log.nomorNota || "TANPA-NOTA"}</span>
                          <span className="text-[9px] font-medium text-slate-400">{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLog(log)}
                            className="h-8 w-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Hapus Nota dan Kembalikan Stok"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                            className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-900"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 pt-1 border-t border-slate-200/50">
                        <span className="capitalize">{log.type === "belanja" ? "Beli Sendiri" : "Supliyer"} ({log.totalItems || log.items?.length || 0} item)</span>
                        <span className="font-black text-slate-900">Rp {logTotal.toLocaleString('id-ID')}</span>
                      </div>

                      {log.bank && (
                        <div className="flex items-center justify-between text-[9px] font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded-lg">
                          <span>Bank: {log.bank}</span>
                          {log.adminFee ? <span>Admin: Rp {log.adminFee.toLocaleString('id-ID')}</span> : null}
                        </div>
                      )}

                      {/* Expanded Items Breakdown */}
                      {isExpanded && Array.isArray(log.items) && (
                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Rincian Item:</span>
                          {log.items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] text-slate-600 py-0.5">
                              <span className="truncate max-w-[170px]">
                                {it.materialName} 
                                {(it.qtyGdm !== undefined && it.qtyKedungreja !== undefined) ? (
                                  <span className="text-[8px] text-slate-400 ml-1">
                                    (GDM: {it.qtyGdm}, Kdrj: {it.qtyKedungreja})
                                  </span>
                                ) : null}
                              </span>
                              <span className="font-bold text-slate-900">
                                {it.qty} {it.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Belum ada riwayat input bahan di lokasi ini.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
      {/* Dialog Pilihan Unduh Template Excel */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-[2.5rem] p-6 sm:p-8 bg-white border-none shadow-2xl">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-slate-100">
            <DialogTitle className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" /> Unduh Template Excel Input
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium leading-relaxed">
              Pilih tujuan penerimaan stok dan jenis pembelian untuk mengunduh template spreadsheet Excel yang sudah diformat sesuai master bahan baku.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
            {/* 1. Gudang Utama - Supliyer */}
            <button
              type="button"
              disabled={downloadingTemplate}
              onClick={() => downloadExcelTemplate("gudang", "supplier")}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50/60 hover:border-emerald-300 text-left transition-all group flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                    Gudang Utama
                  </span>
                  <Building2 className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-emerald-950">
                  Supliyer (Pabrik / Vendor)
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  Format alokasi 2 gudang (GDM & Kedungreja) untuk nota vendor supliyer.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-700 pt-1">
                <FileDown className="h-3.5 w-3.5" /> Unduh .XLSX
              </div>
            </button>

            {/* 2. Gudang Utama - Beli Sendiri */}
            <button
              type="button"
              disabled={downloadingTemplate}
              onClick={() => downloadExcelTemplate("gudang", "belanja")}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-amber-50/60 hover:border-amber-300 text-left transition-all group flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                    Gudang Utama
                  </span>
                  <ShoppingCart className="h-4 w-4 text-amber-600 group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-amber-950">
                  Beli Sendiri (Pasar / Grosir)
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  Format belanja grosir mandiri lengkap dengan kolom Isi Satuan Kecil.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-amber-700 pt-1">
                <FileDown className="h-3.5 w-3.5" /> Unduh .XLSX
              </div>
            </button>

            {/* 3. Kontainer Toko - Supliyer */}
            <button
              type="button"
              disabled={downloadingTemplate}
              onClick={() => downloadExcelTemplate("kontainer", "supplier")}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/60 hover:border-indigo-300 text-left transition-all group flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                    Kontainer Toko
                  </span>
                  <Store className="h-4 w-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-indigo-950">
                  Supliyer ke Outlet
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  Penerimaan bahan vendor yang langsung diantar ke area kontainer toko.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-indigo-700 pt-1">
                <FileDown className="h-3.5 w-3.5" /> Unduh .XLSX
              </div>
            </button>

            {/* 4. Kontainer Toko - Beli Sendiri */}
            <button
              type="button"
              disabled={downloadingTemplate}
              onClick={() => downloadExcelTemplate("kontainer", "belanja")}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-rose-50/60 hover:border-rose-300 text-left transition-all group flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
                    Kontainer Toko
                  </span>
                  <ShoppingCart className="h-4 w-4 text-rose-600 group-hover:scale-110 transition-transform" />
                </div>
                <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-rose-950">
                  Beli Sendiri ke Outlet
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  Belanja harian pasar/supermarket langsung untuk kebutuhan operasional toko.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-rose-700 pt-1">
                <FileDown className="h-3.5 w-3.5" /> Unduh .XLSX
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
