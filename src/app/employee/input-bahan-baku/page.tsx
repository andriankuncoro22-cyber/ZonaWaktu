"use client";

import React, { useState, useMemo } from "react";
import { 
  Truck, 
  ShoppingCart, 
  PlusCircle, 
  Save, 
  History, 
  Trash2, 
  X, 
  Hash, 
  FileText,
  Loader2,
  Package,
  AlertCircle,
  ChefHat,
  PackagePlus,
  MinusCircle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useFirestore, useCollection, useMemoFirebase, collection, doc } from "@/firebase";
import { serverTimestamp, query, orderBy, limit, getDoc, increment, writeBatch, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { applyPurchase } from "@/lib/hpp";

interface InputItem {
  materialId: string;
  qty: number;
  qtyKecilPerUnit?: number;
  price: number;
}

interface OperationalItem {
  materialId: string;
  qty: number;
  keterangan?: string;
}

interface BahanBakuDoc {
  id: string;
  code?: string;
  nama: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyBesar?: number;
  qtyKecil?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  stockValue?: number;
  avgPrice?: number;
  currentPrice?: number;
  hargaSatuanKecil?: number;
  hargaBeliSatuanBesar?: number;
  priceHistory?: Array<{
    price: number;
    priceKecil: number;
    qtyKecilPerUnit: number;
    recordedAt: string;
    note: string;
  }>;
}

interface KaryawanDoc {
  id: string;
  nama: string;
  status?: string;
}

interface ResepKomposisi {
  bahanBakuId: string;
  nama?: string;
  jumlah?: number;
}

interface ResepDoc {
  id: string;
  namaPelengkap?: string;
  bahanBakuId?: string;
  type?: string;
  komposisi?: ResepKomposisi[];
}

interface DeductedIngredient {
  bahanBakuId?: string;
  namaBahan: string;
  code?: string;
  jumlahDipotong: number;
  satuanKecil: string;
}

interface LogEntryItem {
  materialId?: string;
  materialName?: string;
  materialCode?: string;
  resepId?: string;
  namaResep?: string;
  targetMaterialId?: string;
  targetMaterialName?: string;
  targetMaterialCode?: string;
  isBeliSendiri?: boolean;
  qty?: number;
  jumlah?: number;
  jumlahBatch?: number;
  addedBulkQty?: number;
  addedSmallUnits?: number;
  totalYieldKecil?: number;
  qtyKecilPerPack?: number;
  satuanBesar?: string;
  satuanKecil?: string;
  unit?: string;
  qtyKecilPerUnit?: number;
  totalQtyKecil?: number;
  price?: number;
  hargaSatuanKecil?: number;
  avgPrice?: number;
  subtotal?: number;
  keterangan?: string;
  deductedIngredients?: DeductedIngredient[];
}

interface HistoryLog {
  id: string;
  nomorNota?: string;
  type?: string;
  location?: string;
  targetLocation?: string;
  karyawanId?: string;
  karyawanNama?: string;
  shift?: number;
  tanggal?: string;
  createdAt?: {
    toDate?: () => Date;
  };
  items?: LogEntryItem[];
  totalItems?: number;
  totalResep?: number;
}

type ActiveTab = "pembelian" | "pemakaian_base" | "pemakaian_luar_resep" | "ambil" | "kembali";

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeInputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("pembelian");
  const [nomorNota, setNomorNota] = useState<string>("");
  const [items, setItems] = useState<InputItem[]>([{ materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
  const [movementItems, setMovementItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [returnItems, setReturnItems] = useState<InputItem[]>([{ materialId: "", qty: 0, price: 0 }]);
  const [productionBatch, setProductionBatch] = useState([{ resepId: "", qty: 1 }]);
  const [operationalBatch, setOperationalBatch] = useState<OperationalItem[]>([{ materialId: "", qty: 1, keterangan: "" }]);
  const [selectedPemakaianDate, setSelectedPemakaianDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>("");
  const [shift, setShift] = useState<1 | 2>(1);

  // Fetch Master Bahan Baku
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: rawMaterials } = useCollection(materialsQuery);
  const materials = rawMaterials as BahanBakuDoc[] | null;

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: rawKaryawan } = useCollection(karyawanQuery);
  const listKaryawan = rawKaryawan as KaryawanDoc[] | null;

  const resepQuery = useMemoFirebase(() =>
    query(collection(db, "resep"), where("type", "==", "pelengkap")),
    [db]
  );
  const { data: rawResep } = useCollection(resepQuery);
  const listResep = rawResep as ResepDoc[] | null;

  // Fetch Histori Input Bahan
  const historyQuery = useMemoFirebase(() => 
    query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(100)), 
    [db]
  );
  const { data: rawHistory } = useCollection(historyQuery);
  const history = rawHistory as HistoryLog[] | null;

  const pemakaianHistoryQuery = useMemoFirebase(() =>
    query(collection(db, "log_produksi_pelengkap"), orderBy("createdAt", "desc"), limit(50)),
    [db]
  );
  const { data: rawPemakaianHistory } = useCollection(pemakaianHistoryQuery);
  const pemakaianHistory = rawPemakaianHistory as HistoryLog[] | null;

  const pemakaianLuarResepHistoryQuery = useMemoFirebase(() =>
    query(collection(db, "log_pemakaian_luar_resep"), orderBy("createdAt", "desc"), limit(50)),
    [db]
  );
  const { data: rawPemakaianLuarResepHistory } = useCollection(pemakaianLuarResepHistoryQuery);
  const pemakaianLuarResepHistory = rawPemakaianLuarResepHistory as HistoryLog[] | null;

  const activeHistorySection = useMemo(() => {
    const filteredHistory = history?.filter((log: HistoryLog) => log.location === "kontainer") || [];

    switch (activeTab) {
      case "ambil":
        return {
          key: "ambil",
          title: "Histori Pengambilan Gudang",
          icon: Package,
          accent: "bg-amber-50 text-amber-600",
          logs: filteredHistory.filter((log: HistoryLog) => log.type === "ambil-gudang"),
        };
      case "kembali":
        return {
          key: "kembali",
          title: "Histori Pengembalian Barang",
          icon: Truck,
          accent: "bg-emerald-50 text-emerald-600",
          logs: filteredHistory.filter((log: HistoryLog) => log.type === "kembali-gudang"),
        };
      case "pemakaian_base":
        return {
          key: "pemakaian_base",
          title: "Histori Input Pemakaian Base",
          icon: Package,
          accent: "bg-violet-50 text-violet-600",
          logs: pemakaianHistory || [],
        };
      case "pemakaian_luar_resep":
        return {
          key: "pemakaian_luar_resep",
          title: "Histori Pemakaian Bahan Di Luar Resep",
          icon: Package,
          accent: "bg-orange-50 text-orange-600",
          logs: pemakaianLuarResepHistory || [],
        };
      default:
        return {
          key: "pembelian",
          title: "Histori Pembelian",
          icon: ShoppingCart,
          accent: "bg-amber-50 text-amber-600",
          logs: filteredHistory.filter((log: HistoryLog) => {
            const isPembelian = log.type === "belanja" || log.type === "supplier";
            const isKaryawan = !!log.karyawanId;
            
            const todayUTC = new Date().toISOString().split("T")[0];
            const dLocal = new Date();
            const todayLocal = `${dLocal.getFullYear()}-${String(dLocal.getMonth() + 1).padStart(2, '0')}-${String(dLocal.getDate()).padStart(2, '0')}`;
            
            const createdAtDateUTC = log.createdAt?.toDate ? log.createdAt.toDate().toISOString().split("T")[0] : null;
            const createdAtDateLocal = log.createdAt?.toDate ? (() => {
              const d = log.createdAt.toDate();
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })() : null;
            
            const logDateUTC = log.tanggal || createdAtDateUTC;
            const logDateLocal = log.tanggal || createdAtDateLocal;
            
            const isToday = (logDateUTC === todayUTC) || (logDateLocal === todayLocal);
            
            return isPembelian && isKaryawan && isToday;
          }),
        };
    }
  }, [activeTab, history, pemakaianHistory, pemakaianLuarResepHistory]);

  const handleAddItem = () => {
    setItems([...items, { materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InputItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'materialId') {
      const mat = materials?.find(m => m.id === value);
      if (mat) {
        newItems[index].qtyKecilPerUnit = Number(mat.qtyKecil || 1);
        if (mat.currentPrice) {
          newItems[index].price = mat.currentPrice;
        } else if (mat.hargaBeliSatuanBesar) {
          newItems[index].price = mat.hargaBeliSatuanBesar;
        }
      }
    }
    
    setItems(newItems);
  };

  const handleAddMovementItem = () => {
    setMovementItems([...movementItems, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleRemoveMovementItem = (index: number) => {
    setMovementItems(movementItems.filter((_, i) => i !== index));
  };

  const handleMovementItemChange = (index: number, field: keyof InputItem, value: string | number) => {
    const newItems = [...movementItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMovementItems(newItems);
  };

  const handleAddReturnItem = () => {
    setReturnItems([...returnItems, { materialId: "", qty: 0, price: 0 }]);
  };

  const handleRemoveReturnItem = (index: number) => {
    setReturnItems(returnItems.filter((_, i) => i !== index));
  };

  const handleReturnItemChange = (index: number, field: keyof InputItem, value: string | number) => {
    const newItems = [...returnItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setReturnItems(newItems);
  };

  const handleAddProductionItem = () => {
    setProductionBatch([...productionBatch, { resepId: "", qty: 1 }]);
  };

  const handleRemoveProductionItem = (index: number) => {
    setProductionBatch(productionBatch.filter((_, i) => i !== index));
  };

  const handleProductionItemChange = (index: number, field: string, value: string | number) => {
    const newBatch = [...productionBatch];
    
    if (field === "resepId") {
      newBatch[index] = { ...newBatch[index], resepId: String(value) };
      if (!newBatch[index].qty || Number(newBatch[index].qty) <= 0) {
        newBatch[index].qty = 1;
      }
    } else if (field === "cupQty") {
      const recipe = listResep?.find((r) => r.id === newBatch[index].resepId);
      const targetMat = materials?.find(
        (m) => m.id === recipe?.bahanBakuId || (!recipe?.bahanBakuId && m.nama?.toLowerCase() === recipe?.namaPelengkap?.toLowerCase())
      );
      const qtyKecilPerPack = Number(targetMat?.qtyKecil || 1);
      const cupVal = Number(value) || 0;
      newBatch[index].qty = qtyKecilPerPack > 0 ? Math.round((cupVal / qtyKecilPerPack) * 1000) / 1000 : cupVal;
    } else {
      newBatch[index] = { ...newBatch[index], [field]: value };
    }

    setProductionBatch(newBatch);
  };

  const handleAddOperationalItem = () => {
    setOperationalBatch([...operationalBatch, { materialId: "", qty: 1, keterangan: "" }]);
  };

  const handleRemoveOperationalItem = (index: number) => {
    setOperationalBatch(operationalBatch.filter((_, i) => i !== index));
  };

  const handleOperationalItemChange = (index: number, field: keyof OperationalItem, value: string | number) => {
    const newBatch = [...operationalBatch];
    newBatch[index] = { ...newBatch[index], [field]: value };
    setOperationalBatch(newBatch);
  };

  // Simpan Pemakaian Base / Pelengkap
  const handleSavePemakaian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Karyawan Belum Dipilih",
        description: "Silakan pilih nama karyawan yang meracik base/pelengkap.",
      });
      return;
    }

    const validBatch = productionBatch.filter(item => item.resepId && item.qty > 0);
    if (validBatch.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilihan Kosong",
        description: "Pilih minimal satu resep pelengkap dan jumlah yang valid.",
      });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const deductions: { [materialId: string]: number } = {};
      const additions: { [materialId: string]: number } = {};
      const logItems: LogEntryItem[] = [];

      validBatch.forEach((prodItem) => {
        const recipe = listResep?.find((r) => r.id === prodItem.resepId);
        if (!recipe) return;

        // 1. Potong bahan baku penyusun sesuai komposisi resep
        const deductedList: DeductedIngredient[] = [];
        if (recipe.komposisi) {
          recipe.komposisi.forEach((comp: ResepKomposisi) => {
            const ingMat = materials?.find((m) => m.id === comp.bahanBakuId);
            const totalDeduct = Number(comp.jumlah || 0) * prodItem.qty;
            deductions[comp.bahanBakuId] = (deductions[comp.bahanBakuId] || 0) + totalDeduct;

            deductedList.push({
              bahanBakuId: comp.bahanBakuId,
              namaBahan: ingMat?.nama || comp.nama || "-",
              code: ingMat?.code || "-",
              jumlahDipotong: totalDeduct,
              satuanKecil: ingMat?.satuanKecil || "gr/ml"
            });
          });
        }

        // 2. Tambahkan ke stok bahan baku base / racikan terkait
        const targetMat = materials?.find(
          (m) => m.id === recipe.bahanBakuId || (!recipe.bahanBakuId && m.nama?.toLowerCase() === recipe.namaPelengkap?.toLowerCase())
        );

        let yieldSmall = 0;
        let qtyKecilPerPack = 1;
        if (targetMat) {
          qtyKecilPerPack = Number(targetMat.qtyKecil || 1);
          yieldSmall = prodItem.qty * qtyKecilPerPack;
          additions[targetMat.id] = (additions[targetMat.id] || 0) + yieldSmall;
        }

        logItems.push({
          resepId: prodItem.resepId,
          namaResep: recipe.namaPelengkap || "-",
          targetMaterialId: targetMat?.id || "",
          targetMaterialName: targetMat?.nama || recipe.namaPelengkap || "-",
          targetMaterialCode: targetMat?.code || "-",
          jumlahBatch: prodItem.qty,
          satuanBesar: targetMat?.satuanBesar || "Pack",
          satuanKecil: targetMat?.satuanKecil || "gr/ml",
          qtyKecilPerPack: qtyKecilPerPack,
          totalYieldKecil: yieldSmall,
          deductedIngredients: deductedList
        });
      });

      // Kumpulkan seluruh bahan baku yang terpengaruh (baik dipotong maupun ditambah)
      const allMaterialIds = Array.from(new Set([...Object.keys(deductions), ...Object.keys(additions)]));
      const materialDocs = await Promise.all(
        allMaterialIds.map((id) => getDoc(doc(db, "bahan-baku", id)))
      );

      materialDocs.forEach((docSnap) => {
        if (!docSnap.exists()) return;
        const currentData = docSnap.data();
        const matId = docSnap.id;
        const standardConversion = Number(currentData.qtyKecil || 1);

        const totalDeductSmall = deductions[matId] || 0;
        const totalAddSmall = additions[matId] || 0;
        const netDeltaSmall = totalAddSmall - totalDeductSmall;

        const currentActiveTotal =
          Number(currentData.qtyKontainerBesar || 0) * standardConversion +
          Number(currentData.qtyKontainerKecil || 0);

        const newActiveTotal = Math.max(0, currentActiveTotal + netDeltaSmall);
        const activeBulk = Math.floor(newActiveTotal / standardConversion);
        const activeQty = Math.round((newActiveTotal - activeBulk * standardConversion) * 100) / 100;

        batch.update(docSnap.ref, {
          qtyKontainerBesar: activeBulk,
          qtyKontainerKecil: activeQty
        });
      });

      const logRef = doc(collection(db, "log_produksi_pelengkap"));
      batch.set(logRef, {
        karyawanId: selectedKaryawanId || "",
        karyawanNama: listKaryawan?.find((k) => k.id === selectedKaryawanId)?.nama || "Karyawan",
        shift: Number(shift),
        items: logItems,
        totalResep: logItems.length,
        tanggal: selectedPemakaianDate,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast({
        title: "Pemakaian Base Berhasil Disimpan",
        description: `Bahan penyusun telah dipotong & stok base hasil racikan bertambah ke kontainer.`,
      });
      setProductionBatch([{ resepId: "", qty: 1 }]);
    } catch (error) {
      console.error("Gagal simpan pemakaian base:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat mencatat pemakaian base.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Simpan Pemakaian Bahan di Luar Resep
  const handleSavePemakaianLuarResep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Karyawan Belum Dipilih",
        description: "Silakan pilih nama karyawan yang mencatat pemakaian.",
      });
      return;
    }

    const validBatch = operationalBatch.filter(item => item.materialId && item.qty > 0);
    if (validBatch.length === 0) {
      toast({
        variant: "destructive",
        title: "Pilihan Kosong",
        description: "Pilih minimal satu bahan baku dan masukkan jumlah pemakaian.",
      });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const logItems: LogEntryItem[] = [];

      for (const item of validBatch) {
        const matSnap = await getDoc(doc(db, "bahan-baku", item.materialId));
        if (!matSnap.exists()) continue;
        const matData = matSnap.data();

        const deductSmall = Number(item.qty || 0);
        const standardConversion = Number(matData.qtyKecil || 1);

        const currentActiveTotal =
          Number(matData.qtyKontainerBesar || 0) * standardConversion +
          Number(matData.qtyKontainerKecil || 0);

        const newActiveTotal = Math.max(0, currentActiveTotal - deductSmall);
        const activeBulk = Math.floor(newActiveTotal / standardConversion);
        const activeQty = Math.round((newActiveTotal - activeBulk * standardConversion) * 100) / 100;

        batch.update(matSnap.ref, {
          qtyKontainerBesar: activeBulk,
          qtyKontainerKecil: activeQty
        });

        logItems.push({
          materialId: item.materialId,
          materialName: matData.nama || "-",
          materialCode: matData.code || "-",
          qty: item.qty,
          unit: matData.satuanKecil || "Pcs",
          keterangan: item.keterangan || "Operasional Kontainer"
        });
      }

      const logRef = doc(collection(db, "log_pemakaian_luar_resep"));
      batch.set(logRef, {
        karyawanId: selectedKaryawanId,
        karyawanNama: listKaryawan?.find((k) => k.id === selectedKaryawanId)?.nama || "-",
        shift: Number(shift),
        tanggal: selectedPemakaianDate,
        items: logItems,
        totalItems: logItems.length,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast({
        title: "Pemakaian Non-Resep Disimpan",
        description: `${logItems.length} bahan operasional telah dicatat & stok kontainer terpotong.`,
      });
      setOperationalBatch([{ materialId: "", qty: 1, keterangan: "" }]);
    } catch (error) {
      console.error("Gagal simpan pemakaian luar resep:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat mencatat pemakaian.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Simpan Pembelian Beli Sendiri
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Karyawan Belum Dipilih",
        description: "Silakan pilih nama karyawan yang melakukan pembelian.",
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
      if (!item.qtyKecilPerUnit || item.qtyKecilPerUnit <= 0) {
        toast({
          variant: "destructive",
          title: "Isi Pack/Box Wajib Diisi",
          description: `Bahan "${mat?.nama || 'Terpilih'}" wajib menginput isi per ${mat?.satuanBesar || 'pack/box/pcs'} (> 0).`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);

      const karyawanNama = listKaryawan?.find((k) => k.id === selectedKaryawanId)?.nama || "Karyawan";
      
      // Generate nomor nota otomatis jika dikosongkan: Nama | Shift X | DD/MM/YY
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(-2);
      const formattedDate = `${dd}/${mm}/${yy}`;
      const finalNomorNota = nomorNota.trim() ? nomorNota.trim() : `${karyawanNama} | Shift ${shift} | ${formattedDate}`;
      
      const logItems: LogEntryItem[] = validItems.map(item => {
        const material = materials?.find(m => m.id === item.materialId);
        const currentMaterial = material || { qtyBesar: 0, qtyKontainerBesar: 0, qtyKontainerKecil: 0, stockValue: 0 };
        
        const standardConversion = Number(material?.qtyKecil || 1);
        const actualConversion = Number(item.qtyKecilPerUnit || material?.qtyKecil || 1);

        const totalSmallUnitsPurchased = item.qty * actualConversion;
        const fullBulkUnits = Math.floor(totalSmallUnitsPurchased / (standardConversion || 1));
        const remainderSmallUnits = Math.round((totalSmallUnitsPurchased - (fullBulkUnits * standardConversion)) * 100) / 100;
        
        const pricePerKecil = actualConversion > 0 ? (item.price / actualConversion) : item.price;
        const totalBulkEquivalent = standardConversion > 0 ? (totalSmallUnitsPurchased / standardConversion) : item.qty;
        const updated = applyPurchase(currentMaterial, totalBulkEquivalent, item.price);

        const materialRef = doc(db, "bahan-baku", item.materialId);
        
        const priceHistoryEntry = {
          price: item.price,
          priceKecil: pricePerKecil,
          qtyKecilPerUnit: actualConversion,
          recordedAt: new Date().toISOString(),
          note: `Beli Sendiri Karyawan (${actualConversion} ${material?.satuanKecil || 'pcs'}/${material?.satuanBesar || 'pack'}) -> Area Kontainer`
        };

        const updatePayload: Record<string, unknown> = {
          stockValue: updated.stockValue,
          avgPrice: updated.avgPrice,
          currentPrice: item.price,
          hargaSatuanKecil: pricePerKecil,
          priceHistory: Array.isArray(material?.priceHistory) 
            ? [...material.priceHistory, priceHistoryEntry].slice(-10) 
            : [priceHistoryEntry],
        };

        if (fullBulkUnits > 0) {
          updatePayload.qtyKontainerBesar = increment(fullBulkUnits);
        }
        if (remainderSmallUnits > 0) {
          updatePayload.qtyKontainerKecil = increment(remainderSmallUnits);
        }

        batch.update(materialRef, updatePayload);

        return {
          materialId: item.materialId,
          materialName: material?.nama || "-",
          materialCode: material?.code || "-",
          isBeliSendiri: true,
          qty: item.qty,
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
        };
      });

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota: finalNomorNota,
        karyawanId: selectedKaryawanId,
        karyawanNama: karyawanNama,
        shift: Number(shift),
        type: "belanja",
        targetLocation: "kontainer",
        location: "kontainer",
        items: logItems,
        totalItems: logItems.length,
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      toast({
        title: "Nota Beli Sendiri Disimpan",
        description: `Nota #${finalNomorNota} dengan ${logItems.length} bahan telah ditambahkan ke Stok Area Kontainer.`,
      });

      setItems([{ materialId: "", qty: 0, qtyKecilPerUnit: 1, price: 0 }]);
      setNomorNota("");
      setSelectedKaryawanId("");
      
    } catch (error) {
      console.error("Gagal simpan nota masuk:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat menyimpan nota penerimaan.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Hapus catatan nota ini dan kembalikan/kurangi stok kontainer?")) return;
    setSaving(true);
    try {
      const logDocRef = doc(db, "log_pembelian_bahan", logId);
      const logSnap = await getDoc(logDocRef);
      if (!logSnap.exists()) return;
      const logData = logSnap.data() as HistoryLog;

      const batch = writeBatch(db);

      logData.items?.forEach((item: LogEntryItem) => {
        if (!item.materialId) return;
        const materialRef = doc(db, "bahan-baku", item.materialId);
        
        let bulkToDeduct = 0;
        let smallToDeduct = 0;

        if (typeof item.addedBulkQty === 'number' || typeof item.addedSmallUnits === 'number') {
          bulkToDeduct = Number(item.addedBulkQty || 0);
          smallToDeduct = Number(item.addedSmallUnits || 0);
        } else {
          const matDetail = materials?.find(m => m.id === item.materialId);
          const standardConversion = Number(matDetail?.qtyKecil || 1);
          const totalSmall = Number(item.totalQtyKecil || (Number(item.qty || 0) * (item.qtyKecilPerUnit || standardConversion)));
          bulkToDeduct = Math.floor(totalSmall / (standardConversion || 1));
          smallToDeduct = Math.round((totalSmall - (bulkToDeduct * standardConversion)) * 100) / 100;
        }

        const updatePayload: Record<string, unknown> = {};
        const subtotal = Number(item.subtotal || (Number(item.qty || 0) * Number(item.price || 0)) || 0);

        if (subtotal > 0) {
          updatePayload.stockValue = increment(-subtotal);
        }
        if (bulkToDeduct > 0) {
          updatePayload.qtyKontainerBesar = increment(-bulkToDeduct);
        }
        if (smallToDeduct > 0) {
          updatePayload.qtyKontainerKecil = increment(-smallToDeduct);
        }

        if (Object.keys(updatePayload).length > 0) {
          batch.update(materialRef, updatePayload);
        }
      });

      batch.delete(logDocRef);
      await batch.commit();

      toast({ 
        title: "Nota Dihapus & Stok Dikurangi", 
        description: "Catatan nota berhasil dihapus dan stok kontainer telah ditarik balik." 
      });
    } catch (e: unknown) {
      console.error(e);
      toast({ 
        variant: "destructive", 
        title: "Gagal Menghapus", 
        description: "Terjadi kesalahan sistem saat mencoba menghapus nota." 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTakeFromWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = movementItems.filter(item => item.materialId && item.qty > 0);
    if (!nomorNota || validItems.length === 0) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Isi nomor referensi dan pilih minimal satu bahan." });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const logItems = validItems.map(item => {
        const material = materials?.find(m => m.id === item.materialId);
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(item.qty),
          qtyBesar: increment(-item.qty)
        });
        return { materialId: item.materialId, materialName: material?.nama || "-", materialCode: material?.code || "-", qty: item.qty, unit: material?.satuanBesar || "-" };
      });

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota,
        type: "ambil-gudang",
        items: logItems,
        totalItems: logItems.length,
        location: "kontainer",
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast({ title: "Stok Diambil", description: `Barang berhasil dipindahkan dari gudang ke kontainer.` });
      setMovementItems([{ materialId: "", qty: 0, price: 0 }]);
      setNomorNota("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan sistem." });
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = returnItems.filter(item => item.materialId && item.qty > 0);
    if (!nomorNota || validItems.length === 0) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Isi nomor referensi dan pilih minimal satu bahan." });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const logItems = validItems.map(item => {
        const material = materials?.find(m => m.id === item.materialId);
        const materialRef = doc(db, "bahan-baku", item.materialId);
        batch.update(materialRef, {
          qtyKontainerBesar: increment(-item.qty),
          qtyBesar: increment(item.qty)
        });
        return { materialId: item.materialId, materialName: material?.nama || "-", materialCode: material?.code || "-", qty: item.qty, unit: material?.satuanBesar || "-" };
      });

      const logRef = doc(collection(db, "log_pembelian_bahan"));
      batch.set(logRef, {
        nomorNota,
        type: "kembali-gudang",
        items: logItems,
        totalItems: logItems.length,
        location: "kontainer",
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      toast({ title: "Pengembalian Disimpan", description: `Barang berhasil dikembalikan ke gudang.` });
      setReturnItems([{ materialId: "", qty: 0, price: 0 }]);
      setNomorNota("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan sistem." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
          INPUT BAHAN BAKU
        </h1>
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
          AREA KONTAINER OPERASIONAL • KHUSUS PEMBELIAN BELI SENDIRI (STOK KONTAINER)
        </p>
      </div>

      <div className="space-y-6 sm:space-y-8">
        <Card className="rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100/80 shadow-sm bg-white overflow-hidden p-4 sm:p-8 space-y-6 sm:space-y-8">
          {/* Top Nav Tabs - Clean Responsive Layout (No Horizontal Scroll on Mobile) */}
          <div className="bg-slate-100/80 p-2 sm:p-2.5 rounded-2xl border border-slate-200/60 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-2">
            {/* Primary Action Tabs (Row 1 on mobile, flex on desktop) */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("pembelian")}
                className={cn(
                  "flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center shadow-sm",
                  activeTab === "pembelian"
                    ? "bg-[#F59E0B] text-white shadow-amber-200"
                    : "bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Beli Sendiri</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pemakaian_base")}
                className={cn(
                  "flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center shadow-sm",
                  activeTab === "pemakaian_base"
                    ? "bg-[#F59E0B] text-white shadow-amber-200"
                    : "bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <ChefHat className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Base Resep</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pemakaian_luar_resep")}
                className={cn(
                  "flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center shadow-sm",
                  activeTab === "pemakaian_luar_resep"
                    ? "bg-[#F59E0B] text-white shadow-amber-200"
                    : "bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Luar Resep</span>
              </button>
            </div>

            {/* Warehouse Transfer Tabs (Row 2 on mobile, right side on desktop) */}
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 pt-1.5 sm:pt-0 border-t border-slate-200/80 sm:border-t-0 sm:border-l sm:pl-2">
              <button
                type="button"
                onClick={() => setActiveTab("ambil")}
                className={cn(
                  "flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center shadow-sm border",
                  activeTab === "ambil"
                    ? "bg-rose-500 text-white border-rose-500 shadow-rose-100"
                    : "bg-white text-rose-800 border-rose-100 hover:bg-rose-50/50"
                )}
              >
                <PackagePlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Ambil Gudang</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("kembali")}
                className={cn(
                  "flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center shadow-sm border",
                  activeTab === "kembali"
                    ? "bg-rose-500 text-white border-rose-500 shadow-rose-100"
                    : "bg-white text-rose-800 border-rose-100 hover:bg-rose-50/50"
                )}
              >
                <Truck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Retur Gudang</span>
              </button>
            </div>
          </div>

          {/* TAB 1: PEMBELIAN BAHAN BAKU */}
          {activeTab === "pembelian" && (
            <form onSubmit={handleSave} className="space-y-6 sm:space-y-8">
              {/* Header Nota Grid: 2 Kolom di Mobile, 4 Kolom di Desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                {/* 1. Jenis Pembelian & Tujuan Stok */}
                <div className="col-span-2 lg:col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    JENIS PEMBELIAN & TUJUAN STOK
                  </Label>
                  <div className="flex bg-[#FFFBF0] border border-[#FDE68A] p-2 rounded-2xl items-center justify-between px-4 h-12 sm:h-14">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-amber-600" /> BELI SENDIRI
                    </span>
                    <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]">
                      → KONTAINER
                    </span>
                  </div>
                </div>

                {/* 2. Pilih Shift (Kiri di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    PILIH SHIFT <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih shift..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="1" className="rounded-xl font-bold">Shift 1 (Pagi)</SelectItem>
                      <SelectItem value="2" className="rounded-xl font-bold">Shift 2 (Malam)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. Nama Karyawan (Kanan di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    NAMA KARYAWAN <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId} required>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih karyawan..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl max-h-60">
                      {listKaryawan?.map((k) => (
                        <SelectItem key={k.id} value={k.id} className="rounded-xl font-medium">
                          {k.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 4. Nomor Nota / Invoice (Opsional) */}
                <div className="col-span-2 lg:col-span-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                      NOMOR NOTA / INVOICE
                    </Label>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">OPSIONAL</span>
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={nomorNota}
                      onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                      className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] pl-11 font-black text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 placeholder:font-bold"
                      placeholder="Otomatis jika kosong (Nama | Shift | Tgl)"
                    />
                  </div>
                </div>
              </div>

              {/* Notice Banner */}
              <div className="bg-[#FFFDF5] border border-[#FDE68A] rounded-2xl p-4 text-amber-950 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-black uppercase tracking-wide text-[10px] text-amber-900">
                    KATEGORI PEMBELIAN BELI SENDIRI AKTIF
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
                    Setiap pembelian bahan baku oleh karyawan diperuntukkan untuk <strong>Beli Sendiri</strong> dan stok otomatis <strong>masuk langsung ke Area Kontainer</strong>. Harap periksa & sesuaikan isi per pack/box jika berbeda dari ukuran standar.
                  </p>
                </div>
              </div>

              {/* Rincian Bahan Baku Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900">
                    RINCIAN BAHAN BAKU (BELI SENDIRI)
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-emerald-600" /> Tambah Item
                  </button>
                </div>

                {items.map((item, index) => {
                  const matDetail = materials?.find(m => m.id === item.materialId);
                  return (
                    <div
                      key={index}
                      className="relative bg-[#FFFCF7] border border-[#FDE047]/80 rounded-2xl p-4 sm:p-5 transition-all shadow-sm"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-end">
                        {/* 1. Bahan Baku (col 4) */}
                        <div className="lg:col-span-4 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            BAHAN BAKU
                          </Label>
                          <Select
                            value={item.materialId}
                            onValueChange={(val) => handleItemChange(index, "materialId", val)}
                          >
                            <SelectTrigger className="rounded-xl border-slate-200 h-11 bg-white font-black text-slate-900 text-xs">
                              <SelectValue placeholder="Pilih bahan baku..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                              {materials?.map((m) => (
                                <SelectItem key={m.id} value={m.id} className="rounded-xl text-xs font-bold">
                                  {m.code ? `[${m.code}] ` : ""}{m.nama}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 2. Isi / Kemasan (col 2) */}
                        <div className="lg:col-span-2 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            ISI / KEMASAN <span className="text-rose-500">*</span>
                          </Label>
                          <div className="relative flex items-center">
                            <Input
                              type="number"
                              step="any"
                              value={item.qtyKecilPerUnit ?? matDetail?.qtyKecil ?? 1}
                              onChange={(e) => handleItemChange(index, "qtyKecilPerUnit", Number(e.target.value))}
                              className="rounded-xl border-[#FDE68A] h-11 bg-[#FFFBEB] font-black text-center text-xs text-amber-950 pr-10"
                              placeholder={String(matDetail?.qtyKecil || 1)}
                              required
                            />
                            <span className="absolute right-2 text-[8px] font-black uppercase text-amber-900 bg-[#FEF08A] px-1.5 py-0.5 rounded">
                              {matDetail?.satuanKecil || "PCS"}
                            </span>
                          </div>
                        </div>

                        {/* 3. Jumlah (col 1) */}
                        <div className="lg:col-span-1 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            JUMLAH
                          </Label>
                          <Input
                            type="number"
                            min="0.1"
                            step="any"
                            value={item.qty || ""}
                            onChange={(e) => handleItemChange(index, "qty", Number(e.target.value))}
                            className="rounded-xl border-slate-200 h-11 bg-white font-black text-center text-xs text-slate-900"
                            placeholder="1"
                            required
                          />
                        </div>

                        {/* 4. Satuan (col 1) */}
                        <div className="lg:col-span-1 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            SATUAN
                          </Label>
                          <div className="h-11 flex items-center justify-center bg-white rounded-xl text-xs font-black uppercase text-slate-700 border border-slate-200">
                            {matDetail?.satuanBesar || "-"}
                          </div>
                        </div>

                        {/* 5. Harga / Unit (col 2) */}
                        <div className="lg:col-span-2 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            HARGA / UNIT
                          </Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={item.price === 0 ? "" : formatThousand(item.price)}
                            onChange={(e) => handleItemChange(index, "price", Number(e.target.value.replace(/\D/g, "")) || 0)}
                            className="rounded-xl border-slate-200 h-11 bg-white font-black text-center text-xs"
                            placeholder="0"
                          />
                        </div>

                        {/* 6. Total & Remove (col 2) */}
                        <div className="lg:col-span-2 flex items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-wider text-emerald-800">
                              TOTAL
                            </Label>
                            <div className="h-11 flex items-center justify-center bg-[#EBF7EE] rounded-xl border border-[#C6ECCB] font-black text-[#15803D] text-xs px-2 text-center">
                              Rp {Number((item.qty || 0) * (item.price || 0)).toLocaleString("id-ID")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center shrink-0"
                            disabled={items.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving || items.some(i => !i.materialId)}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-[#7BA78D] hover:bg-[#6C997F] active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span>Simpan Pembelian (Stok Kontainer)</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: INPUT PEMAKAIAN RESEP BASE / PELENGKAP */}
          {activeTab === "pemakaian_base" && (
            <form onSubmit={handleSavePemakaian} className="space-y-6 sm:space-y-8">
              {/* Header Shift & Karyawan Grid: 2 Kolom di Mobile, 3 Kolom di Desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
                {/* 1. Pilih Shift (Kiri di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    PILIH SHIFT <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih shift..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="1" className="rounded-xl font-bold">Shift 1 (Pagi)</SelectItem>
                      <SelectItem value="2" className="rounded-xl font-bold">Shift 2 (Malam)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Nama Karyawan (Kanan di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    NAMA KARYAWAN <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId} required>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih karyawan..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl max-h-60">
                      {listKaryawan?.map((k) => (
                        <SelectItem key={k.id} value={k.id} className="rounded-xl font-medium">
                          {k.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. Tanggal Operasional (Bawah di Mobile, Kolom 3 di Desktop) */}
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    TANGGAL OPERASIONAL
                  </Label>
                  <Input
                    type="date"
                    value={selectedPemakaianDate}
                    onChange={(e) => setSelectedPemakaianDate(e.target.value)}
                    className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-xs sm:text-sm text-slate-900"
                  />
                </div>
              </div>

              {/* Informative Banner */}
              <div className="bg-purple-50/90 border border-purple-200 rounded-2xl p-4 sm:p-5 text-purple-950 flex items-start gap-3.5">
                <ChefHat className="h-6 w-6 text-purple-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black uppercase tracking-wide text-[10px] sm:text-[11px] text-purple-900 flex items-center gap-2">
                    OTOMATISASI RESEP BASE & RACIKAN PELENGKAP
                  </p>
                  <p className="text-[11px] sm:text-xs leading-relaxed text-purple-800 font-medium">
                    Saat input dicatat: Sistem akan <strong>memotong bahan baku penyusun</strong> dari stok kontainer dan <strong>otomatis menambahkan stok bahan base</strong> (seperti Base Kopi, Gula Cair, Simple Syrup) ke stok kontainer sesuai takaran kemasan/cup (<span className="font-bold">qtyKecil</span>) dari Master Bahan Baku.
                  </p>
                </div>
              </div>

              {/* Rincian Pemakaian Resep Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900">
                    RINCIAN PEMAKAIAN RESEP BASE / PELENGKAP
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddProductionItem}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-purple-600" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-4">
                  {productionBatch.map((item, index) => {
                    const recipe = listResep?.find((r) => r.id === item.resepId);
                    const targetMat = materials?.find(
                      (m) => m.id === recipe?.bahanBakuId || (!recipe?.bahanBakuId && m.nama?.toLowerCase() === recipe?.namaPelengkap?.toLowerCase())
                    );
                    const qtyKecilPerPack = Number(targetMat?.qtyKecil || 1);
                    const totalYieldSmall = Number(item.qty || 0) * qtyKecilPerPack;

                    return (
                      <div 
                        key={index} 
                        className="bg-[#FAF7FD] p-4 sm:p-5 rounded-2xl border border-purple-200/80 shadow-sm space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-end">
                          {/* 1. Pilih Resep */}
                          <div className="md:col-span-5 space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-wider text-purple-900">
                              PILIH RESEP PELENGKAP / BASE
                            </Label>
                            <Select
                              value={item.resepId}
                              onValueChange={(val) => handleProductionItemChange(index, "resepId", val)}
                            >
                              <SelectTrigger className="rounded-xl border-purple-200 h-11 bg-white font-black text-slate-900 text-xs">
                                <SelectValue placeholder="Pilih resep pelengkap..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                                {listResep?.map((r) => {
                                  const mat = materials?.find(
                                    (m) => m.id === r.bahanBakuId || (!r.bahanBakuId && m.nama?.toLowerCase() === r.namaPelengkap?.toLowerCase())
                                  );
                                  return (
                                    <SelectItem key={r.id} value={r.id} className="rounded-xl text-xs font-bold">
                                      {mat?.code ? `[${mat.code}] ` : ""}{r.namaPelengkap} {mat ? `— (1 ${mat.satuanBesar || 'Pack'} = ${mat.qtyKecil || 1} ${mat.satuanKecil || 'cup'})` : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 2. Jumlah Racik (Pack / Batch) */}
                          <div className="md:col-span-3 space-y-1">
                            <div className="flex justify-between items-center">
                              <Label className="text-[9px] font-black uppercase tracking-wider text-purple-900">
                                JUMLAH RACIK (PACK)
                              </Label>
                            </div>
                            <div className="relative flex items-center">
                              <Input
                                type="number"
                                min="0.1"
                                step="any"
                                value={item.qty || ""}
                                onChange={(e) => handleProductionItemChange(index, "qty", Number(e.target.value))}
                                className="rounded-xl border-purple-200 h-11 bg-white font-black text-center text-xs sm:text-sm pr-12 text-slate-900"
                                placeholder="1"
                              />
                              <span className="absolute right-2 text-[8px] font-black uppercase text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                                {targetMat?.satuanBesar || "PACK"}
                              </span>
                            </div>
                          </div>

                          {/* 3. Total Hasil (Cup / Porsi Sesuai Master) */}
                          <div className="md:col-span-3 space-y-1">
                            <div className="flex justify-between items-center">
                              <Label className="text-[9px] font-black uppercase tracking-wider text-emerald-900">
                                TOTAL CUP / PORSI
                              </Label>
                            </div>
                            <div className="relative flex items-center">
                              <Input
                                type="number"
                                min="1"
                                step="any"
                                value={Math.round(totalYieldSmall * 100) / 100 || ""}
                                onChange={(e) => handleProductionItemChange(index, "cupQty", Number(e.target.value))}
                                className="rounded-xl border-emerald-300 h-11 bg-[#F0FDF4] font-black text-center text-xs sm:text-sm pr-12 text-emerald-950"
                                placeholder={String(qtyKecilPerPack)}
                              />
                              <span className="absolute right-2 text-[8px] font-black uppercase text-emerald-800 bg-[#DCFCE7] px-1.5 py-0.5 rounded">
                                {targetMat?.satuanKecil || "CUP"}
                              </span>
                            </div>
                          </div>

                          {/* 4. Tombol Hapus */}
                          <div className="md:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveProductionItem(index)}
                              className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center shrink-0 bg-white shadow-sm border border-purple-100"
                              disabled={productionBatch.length === 1}
                              title="Hapus baris"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Breakdown Kartu Otomatisasi (Bahan Bertambah & Bahan Dipotong) */}
                        {recipe && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-purple-100 text-xs">
                            {/* 1. Bahan Bertambah */}
                            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                              <span className="text-[9px] font-black uppercase text-emerald-800 flex items-center gap-1">
                                <PackagePlus className="h-3.5 w-3.5 text-emerald-600" />
                                Stok Bahan Base Bertambah:
                              </span>
                              <div className="flex items-center justify-between text-xs font-black text-emerald-950">
                                <span>[{targetMat?.code || "BASE"}] {targetMat?.nama || recipe.namaPelengkap}</span>
                                <span className="bg-emerald-200/80 px-2 py-0.5 rounded-lg text-[10px] text-emerald-900 font-bold tabular-nums">
                                  + {item.qty} {targetMat?.satuanBesar || "Pack"} ({totalYieldSmall.toLocaleString("id-ID")} {targetMat?.satuanKecil || "gr/ml"})
                                </span>
                              </div>
                            </div>

                            {/* 2. Bahan Dipotong */}
                            <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3 space-y-1.5">
                              <span className="text-[9px] font-black uppercase text-rose-800 flex items-center gap-1">
                                <MinusCircle className="h-3.5 w-3.5 text-rose-600" />
                                Bahan Baku Penyusun Dipotong:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {recipe.komposisi?.map((comp, cIdx) => {
                                  const ingMat = materials?.find((m) => m.id === comp.bahanBakuId);
                                  const deductQty = Number(comp.jumlah || 0) * (item.qty || 1);
                                  return (
                                    <span 
                                      key={cIdx} 
                                      className="px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[10px] font-bold text-rose-900 shadow-2xs"
                                    >
                                      {ingMat?.nama || comp.nama || "Bahan"}: <strong className="text-rose-700">-{deductQty.toLocaleString("id-ID")} {ingMat?.satuanKecil || "gr/ml"}</strong>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving || productionBatch.some((i) => !i.resepId)}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-purple-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Simpan Pemakaian Resep Base</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PEMAKAIAN BAHAN DI LUAR RESEP */}
          {activeTab === "pemakaian_luar_resep" && (
            <form onSubmit={handleSavePemakaianLuarResep} className="space-y-6 sm:space-y-8">
              {/* Header Shift & Karyawan Grid: 2 Kolom di Mobile, 3 Kolom di Desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
                {/* 1. Pilih Shift (Kiri di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    PILIH SHIFT <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih shift..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="1" className="rounded-xl font-bold">Shift 1 (Pagi)</SelectItem>
                      <SelectItem value="2" className="rounded-xl font-bold">Shift 2 (Malam)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Nama Karyawan (Kanan di Mobile) */}
                <div className="col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    NAMA KARYAWAN <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId} required>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-slate-900 text-xs sm:text-sm">
                      <SelectValue placeholder="Pilih karyawan..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl max-h-60">
                      {listKaryawan?.map((k) => (
                        <SelectItem key={k.id} value={k.id} className="rounded-xl font-medium">
                          {k.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. Tanggal Pemakaian (Bawah di Mobile, Kolom 3 di Desktop) */}
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    TANGGAL PEMAKAIAN
                  </Label>
                  <Input
                    type="date"
                    value={selectedPemakaianDate}
                    onChange={(e) => setSelectedPemakaianDate(e.target.value)}
                    className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-black text-xs sm:text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-4 text-orange-950 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-black uppercase tracking-wide text-[10px] text-orange-900">
                    PENCATATAN PEMAKAIAN OPERASIONAL LANGSUNG
                  </p>
                  <p className="text-[11px] leading-relaxed text-orange-800 font-medium">
                    Gunakan tab ini untuk mencatat pemakaian barang operasional non-resep seperti sedotan, cup, tisu, plastik/kresek, gas LPG, cairan pembersih, bahan rusak harian, dll. Stok kontainer akan langsung terpotong secara otomatis.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900">
                    RINCIAN BAHAN NON-RESEP YANG DIPAKAI
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddOperationalItem}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-orange-600" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-3">
                  {operationalBatch.map((item, index) => {
                    const matDetail = materials?.find(m => m.id === item.materialId);
                    return (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end bg-[#F8FAFC] p-4 sm:p-5 rounded-2xl border border-slate-200">
                        <div className="sm:col-span-5 space-y-1">
                          <Label className="text-[9px] font-black uppercase text-slate-500">Pilih Bahan Baku</Label>
                          <Select
                            value={item.materialId}
                            onValueChange={(val) => handleOperationalItemChange(index, "materialId", val)}
                          >
                            <SelectTrigger className="rounded-xl border-none h-11 bg-white font-black text-slate-900 text-xs">
                              <SelectValue placeholder="Pilih..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                              {materials?.map((m) => (
                                <SelectItem key={m.id} value={m.id} className="rounded-xl text-xs font-bold">
                                  {m.code ? `[${m.code}] ` : ""}{m.nama}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                          <Label className="text-[9px] font-black uppercase text-slate-500">
                            Jumlah ({matDetail?.satuanKecil || "Sat. Kecil"})
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            min="0.1"
                            value={item.qty}
                            onChange={(e) => handleOperationalItemChange(index, "qty", Number(e.target.value))}
                            className="rounded-xl border-none h-11 bg-white font-black text-center text-xs sm:text-sm"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                          <Label className="text-[9px] font-black uppercase text-slate-500">Keterangan / Keperluan</Label>
                          <Input
                            type="text"
                            value={item.keterangan || ""}
                            onChange={(e) => handleOperationalItemChange(index, "keterangan", e.target.value)}
                            placeholder="Cth: Operasional Shift 1"
                            className="rounded-xl border-none h-11 bg-white font-bold text-xs"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveOperationalItem(index)}
                            className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center shrink-0 bg-white shadow-sm"
                            disabled={operationalBatch.length === 1}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving || operationalBatch.some((i) => !i.materialId)}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-orange-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Simpan Pemakaian Luar Resep</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: AMBIL STOCK GUDANG */}
          {activeTab === "ambil" && (
            <form onSubmit={handleTakeFromWarehouse} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    NOMOR REFERENSI / CATATAN
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={nomorNota}
                      onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                      className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] pl-11 font-black text-xs sm:text-sm text-slate-900"
                      placeholder="CONTOH: AMBIL-001"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900">
                    BARANG DIAMBIL DARI GUDANG KE KONTAINER
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddMovementItem}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-rose-600" /> Tambah Item
                  </button>
                </div>

                <div className="space-y-3">
                  {movementItems.map((item, index) => (
                    <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-[#FDF4F5] p-4 sm:p-5 rounded-2xl border border-rose-100">
                      <div className="flex-1 w-full space-y-1">
                        <Label className="text-[9px] font-black uppercase text-slate-500">Pilih Bahan</Label>
                        <Select value={item.materialId} onValueChange={(val) => handleMovementItemChange(index, "materialId", val)}>
                          <SelectTrigger className="rounded-xl border-none h-11 bg-white font-black text-slate-900 text-xs">
                            <SelectValue placeholder="Pilih..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                            {materials?.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="rounded-xl text-xs font-bold">
                                {m.code} - {m.nama} (Stok Gudang: {m.qtyBesar || 0} {m.satuanBesar})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-full md:w-36 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-slate-500">Jumlah Dipindah</Label>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleMovementItemChange(index, "qty", Number(e.target.value))}
                          className="rounded-xl border-none h-11 bg-white font-black text-center text-xs sm:text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMovementItem(index)}
                        className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center shrink-0 bg-white shadow-sm"
                        disabled={movementItems.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving || movementItems.some((i) => !i.materialId)}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Simpan Pengambilan Gudang</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: PENGEMBALIAN BARANG */}
          {activeTab === "kembali" && (
            <form onSubmit={handleReturnToWarehouse} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                    NOMOR REFERENSI / CATATAN
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={nomorNota}
                      onChange={(e) => setNomorNota(e.target.value.toUpperCase())}
                      className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] pl-11 font-black text-xs sm:text-sm text-slate-900"
                      placeholder="CONTOH: KEMBALI-001"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900">
                    PENGEMBALIAN BARANG DARI KONTAINER KE GUDANG
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddReturnItem}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-rose-600" /> Tambah Item
                  </button>
                </div>

                <div className="space-y-3">
                  {returnItems.map((item, index) => (
                    <div key={index} className="flex flex-col md:flex-row gap-3 sm:gap-4 items-end bg-[#FDF4F5] p-4 sm:p-5 rounded-2xl border border-rose-100">
                      <div className="flex-1 w-full space-y-1">
                        <Label className="text-[9px] font-black uppercase text-slate-500">Pilih Bahan</Label>
                        <Select value={item.materialId} onValueChange={(val) => handleReturnItemChange(index, "materialId", val)}>
                          <SelectTrigger className="rounded-xl border-none h-11 bg-white font-black text-slate-900 text-xs">
                            <SelectValue placeholder="Pilih..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                            {materials?.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="rounded-xl text-xs font-bold">
                                {m.code} - {m.nama} (Stok Kontainer: {m.qtyKontainerBesar || 0} {m.satuanBesar})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-full md:w-36 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-slate-500">Jumlah Dikembalikan</Label>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleReturnItemChange(index, "qty", Number(e.target.value))}
                          className="rounded-xl border-none h-11 bg-white font-black text-center text-xs sm:text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveReturnItem(index)}
                        className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center shrink-0 bg-white shadow-sm"
                        disabled={returnItems.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving || returnItems.some((i) => !i.materialId)}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>Simpan Pengembalian ke Gudang</span>
                </button>
              </div>
            </form>
          )}

          {/* HISTORI SECTION */}
          <div className="space-y-4 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 px-1">
              <History className="h-4 w-4 text-slate-700" />
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                {activeHistorySection.title.toUpperCase()}
              </h3>
            </div>

            {activeHistorySection.logs.length === 0 ? (
              <div className="bg-[#F8FAFC] rounded-2xl p-10 text-center border border-slate-100">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  BELUM ADA HISTORI
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeHistorySection.logs.map((log) => (
                  <div key={log.id} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase">
                          #{log.nomorNota || log.id.slice(0, 6)}
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {log.karyawanNama || "Karyawan"} (Shift {log.shift || 1})
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        {log.tanggal || (log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString("id-ID") : "-")}
                      </span>
                    </div>

                    {log.items && log.items.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs font-medium text-slate-700">
                        {log.items.map((it, idx) => {
                          const isPemakaianBase = activeTab === "pemakaian_base";
                          return (
                            <div key={idx} className="space-y-1 pb-1.5 last:pb-0 border-b last:border-0 border-slate-200/60">
                              <div className="flex justify-between items-center text-[11px] font-bold text-slate-900">
                                <span className="flex items-center gap-1.5">
                                  {isPemakaianBase && <PackagePlus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                                  {it.targetMaterialName || it.namaResep || it.materialName || "Item"}
                                </span>
                                <span className={cn(
                                  "font-black",
                                  isPemakaianBase ? "text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md text-[10px]" : "text-slate-900"
                                )}>
                                  {isPemakaianBase ? (
                                    `+ ${it.jumlahBatch || it.jumlah} ${it.satuanBesar || 'Pack'}`
                                  ) : (
                                    `${it.qty || it.jumlah} ${it.unit || "unit"} ${it.subtotal ? `• Rp ${Number(it.subtotal).toLocaleString("id-ID")}` : ""}`
                                  )}
                                </span>
                              </div>

                              {isPemakaianBase && it.deductedIngredients && it.deductedIngredients.length > 0 && (
                                <div className="pl-5 text-[10px] text-slate-500 flex flex-wrap gap-1.5 pt-0.5">
                                  <span className="font-bold text-rose-600">Dipotong:</span>
                                  {it.deductedIngredients.map((d, dIdx) => (
                                    <span key={dIdx} className="bg-white border border-rose-100 px-1.5 py-0.2 rounded text-slate-700">
                                      {d.namaBahan} (-{d.jumlahDipotong} {d.satuanKecil})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === "pembelian" && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Hapus Nota
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
