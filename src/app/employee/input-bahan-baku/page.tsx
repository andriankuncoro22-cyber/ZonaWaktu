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
  MinusCircle,
  ArrowRightLeft,
  CheckCircle2,
  Inbox,
  Send,
  XCircle
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
import { 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  getDoc, 
  increment, 
  writeBatch, 
  where,
  addDoc,
  updateDoc
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { applyPurchase } from "@/lib/hpp";
import { 
  useActiveBranch, 
  BRANCH_LIST, 
  BranchId, 
  branchCollection, 
  branchDoc,
  filterContainerMaterials,
  getBranchTheme
} from "@/lib/branch-helper";

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

interface TransferItem {
  materialId: string;
  qty: number;
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

interface TransferRequestItem {
  materialId: string;
  targetMaterialId?: string;
  code: string;
  nama: string;
  qty: number;
  unit: string;
  qtyKecilPerUnit?: number;
  price?: number;
  subtotal?: number;
}

interface TransferRequestDoc {
  id: string;
  nomorPermintaan: string;
  sourceBranch: BranchId;
  sourceBranchName: string;
  targetBranch: BranchId;
  targetBranchName: string;
  requesterKaryawanId: string;
  requesterKaryawanNama: string;
  requesterShift: number;
  items: TransferRequestItem[];
  catatan?: string;
  status: "pending" | "approved" | "rejected";
  approverKaryawanId?: string;
  approverKaryawanNama?: string;
  approverShift?: number;
  rejectionReason?: string;
  tanggal: string;
  createdAt?: { toDate?: () => Date; seconds?: number };
  approvedAt?: { toDate?: () => Date; seconds?: number };
  rejectedAt?: { toDate?: () => Date; seconds?: number };
}

type ActiveTab = "pembelian" | "pemakaian_base" | "pemakaian_luar_resep" | "ambil" | "kembali" | "transfer_kontainer";
type TransferSubTab = "request" | "inbox" | "history";

const formatThousand = (val: number | string) => {
  if (val === null || val === undefined || val === '') return '';
  const numStr = String(val).replace(/[^\d]/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString("id-ID");
};

export default function EmployeeInputBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const activeBranch = useActiveBranch();
  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;
  const theme = getBranchTheme(activeBranch);
  
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

  // States for Inter-Container Transfer
  const availableOtherBranches = useMemo(() => {
    const list: BranchId[] = ['gdm', 'kedungreja', 'tehwarga', 'gembong'];
    return list.filter(b => b !== activeBranch);
  }, [activeBranch]);

  const [chosenSourceBranch, setChosenSourceBranch] = useState<BranchId | null>(null);
  const targetSourceBranch = useMemo(() => {
    if (chosenSourceBranch && availableOtherBranches.includes(chosenSourceBranch)) {
      return chosenSourceBranch;
    }
    return availableOtherBranches[0] || 'kedungreja';
  }, [chosenSourceBranch, availableOtherBranches]);

  const setTargetSourceBranch = (branch: BranchId) => {
    setChosenSourceBranch(branch);
  };

  const [transferSubTab, setTransferSubTab] = useState<TransferSubTab>("request");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([{ materialId: "", qty: 1 }]);
  const [transferCatatan, setTransferCatatan] = useState<string>("");
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>("");

  // Fetch Master Bahan Baku for Active Branch
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: rawMaterials } = useCollection(materialsQuery);
  const materials = useMemo(() => {
    return filterContainerMaterials(rawMaterials as BahanBakuDoc[], activeBranch);
  }, [rawMaterials, activeBranch]);

  // Fetch Master Bahan Baku for Target Source Branch (to pick available items)
  const sourceMaterialsQuery = useMemoFirebase(
    () => query(branchCollection(db, "bahan-baku", targetSourceBranch), orderBy("nama", "asc")),
    [db, targetSourceBranch]
  );
  const { data: rawSourceMaterials } = useCollection(sourceMaterialsQuery);
  const sourceMaterials = useMemo(() => {
    return filterContainerMaterials(rawSourceMaterials as BahanBakuDoc[], targetSourceBranch);
  }, [rawSourceMaterials, targetSourceBranch]);

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: rawKaryawan } = useCollection(karyawanQuery);
  const listKaryawan = rawKaryawan as KaryawanDoc[] | null;

  // Fetch Resep
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

  // Fetch Transfer Requests
  const transferRequestsQuery = useMemoFirebase(
    () => query(collection(db, "transfer_requests"), orderBy("createdAt", "desc"), limit(100)),
    [db]
  );
  const { data: rawTransferRequests } = useCollection(transferRequestsQuery);
  const transferRequests = rawTransferRequests as TransferRequestDoc[] | null;

  // Incoming pending requests (requests from other containers asking materials from US)
  const incomingPendingRequests = useMemo(() => {
    return transferRequests?.filter(r => r.sourceBranch === activeBranch && r.status === "pending") || [];
  }, [transferRequests, activeBranch]);

  // Outgoing requests by us
  const myOutgoingRequests = useMemo(() => {
    return transferRequests?.filter(r => r.targetBranch === activeBranch) || [];
  }, [transferRequests, activeBranch]);

  // All completed or rejected transfers involving our branch
  const transferHistoryLogs = useMemo(() => {
    return transferRequests?.filter(r => (r.sourceBranch === activeBranch || r.targetBranch === activeBranch) && r.status !== "pending") || [];
  }, [transferRequests, activeBranch]);

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

  // Transfer Items Handlers
  const handleAddTransferItem = () => {
    setTransferItems([...transferItems, { materialId: "", qty: 1 }]);
  };

  const handleRemoveTransferItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleTransferItemChange = (index: number, field: keyof TransferItem, value: string | number) => {
    const next = [...transferItems];
    next[index] = { ...next[index], [field]: value };
    setTransferItems(next);
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
          totalYieldKecil: yieldSmall,
          qtyKecilPerPack: qtyKecilPerPack,
          satuanBesar: targetMat?.satuanBesar || "Pack",
          satuanKecil: targetMat?.satuanKecil || "cup",
          deductedIngredients: deductedList
        });
      });

      for (const [matId, deductAmount] of Object.entries(deductions)) {
        const matSnap = await getDoc(doc(db, "bahan-baku", matId));
        if (matSnap.exists()) {
          const matData = matSnap.data();
          const standardConversion = Number(matData.qtyKecil || 1);
          const currentTotal = Number(matData.qtyKontainerBesar || 0) * standardConversion + Number(matData.qtyKontainerKecil || 0);
          const newTotal = Math.max(0, currentTotal - deductAmount);
          const newBulk = Math.floor(newTotal / standardConversion);
          const newSmall = Math.round((newTotal - newBulk * standardConversion) * 100) / 100;

          batch.update(matSnap.ref, {
            qtyKontainerBesar: newBulk,
            qtyKontainerKecil: newSmall
          });
        }
      }

      for (const [matId, addAmount] of Object.entries(additions)) {
        const matSnap = await getDoc(doc(db, "bahan-baku", matId));
        if (matSnap.exists()) {
          const matData = matSnap.data();
          const standardConversion = Number(matData.qtyKecil || 1);
          const currentTotal = Number(matData.qtyKontainerBesar || 0) * standardConversion + Number(matData.qtyKontainerKecil || 0);
          const newTotal = currentTotal + addAmount;
          const newBulk = Math.floor(newTotal / standardConversion);
          const newSmall = Math.round((newTotal - newBulk * standardConversion) * 100) / 100;

          batch.update(matSnap.ref, {
            qtyKontainerBesar: newBulk,
            qtyKontainerKecil: newSmall
          });
        }
      }

      const logRef = doc(collection(db, "log_produksi_pelengkap"));
      batch.set(logRef, {
        karyawanId: selectedKaryawanId,
        karyawanNama: listKaryawan?.find((k) => k.id === selectedKaryawanId)?.nama || "-",
        shift: Number(shift),
        tanggal: selectedPemakaianDate,
        items: logItems,
        totalResep: logItems.length,
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

  // Ambil dari Gudang Sendiri
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

  // Retur ke Gudang Sendiri
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

  // ==========================================
  // FITUR BARU: TRANSFER ANTAR KONTAINER
  // ==========================================

  // 1. Buat Permintaan Transfer Baru
  const handleCreateTransferRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Karyawan Belum Dipilih",
        description: "Silakan pilih nama karyawan pemohon terlebih dahulu.",
      });
      return;
    }

    const validItems = transferItems.filter(item => item.materialId && Number(item.qty) > 0);
    if (validItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Bahan Belum Dipilih",
        description: "Pilih minimal satu bahan baku dan masukkan jumlah yang ingin diminta.",
      });
      return;
    }

    setSaving(true);
    try {
      const requesterNama = listKaryawan?.find(k => k.id === selectedKaryawanId)?.nama || "Karyawan";
      const currentBranchInfo = BRANCH_LIST[activeBranch];
      const sourceBranchInfo = BRANCH_LIST[targetSourceBranch];

      const now = new Date();
      const dateCode = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const nomorPermintaan = `TRF-${dateCode}-${randNum}`;

      const itemsPayload: TransferRequestItem[] = validItems.map(item => {
        const mat = sourceMaterials?.find(m => m.id === item.materialId);
        // Find matching material in active branch (target)
        const matchedActiveMat = materials?.find(m => m.code === mat?.code || m.nama === mat?.nama);
        
        const price = Number(mat?.currentPrice || mat?.hargaBeliSatuanBesar || 0);
        return {
          materialId: item.materialId,
          targetMaterialId: matchedActiveMat?.id || "",
          code: mat?.code || "-",
          nama: mat?.nama || "-",
          qty: item.qty,
          unit: mat?.satuanBesar || "Pack",
          qtyKecilPerUnit: Number(mat?.qtyKecil || 1),
          price: price,
          subtotal: item.qty * price
        };
      });

      await addDoc(collection(db, "transfer_requests"), {
        nomorPermintaan,
        sourceBranch: targetSourceBranch,
        sourceBranchName: sourceBranchInfo?.shortName || targetSourceBranch,
        targetBranch: activeBranch,
        targetBranchName: currentBranchInfo?.shortName || activeBranch,
        requesterKaryawanId: selectedKaryawanId,
        requesterKaryawanNama: requesterNama,
        requesterShift: Number(shift),
        items: itemsPayload,
        catatan: transferCatatan.trim(),
        status: "pending",
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Permintaan Bahan Terkirim!",
        description: `Permintaan #${nomorPermintaan} telah dikirim ke ${sourceBranchInfo?.shortName}. Menunggu persetujuan kontainer penyedia.`,
      });

      setTransferItems([{ materialId: "", qty: 1 }]);
      setTransferCatatan("");
      setTransferSubTab("history");
    } catch (error) {
      console.error("Gagal mengirim permintaan transfer:", error);
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Permintaan",
        description: "Terjadi kesalahan sistem saat mengirim permintaan transfer.",
      });
    } finally {
      setSaving(false);
    }
  };

  // 2. Setujui & Serahkan Permintaan (Approval)
  const handleApproveTransferRequest = async (req: TransferRequestDoc) => {
    if (!selectedKaryawanId) {
      toast({
        variant: "destructive",
        title: "Pilih Karyawan",
        description: "Silakan pilih nama karyawan yang menyetujui dan menyerahkan barang.",
      });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const approverNama = listKaryawan?.find(k => k.id === selectedKaryawanId)?.nama || "Karyawan";

      // 1. Kurangi stok di kontainer asal (sourceBranch)
      // 2. Tambah stok di kontainer tujuan (targetBranch)
      for (const item of req.items) {
        // Source branch doc
        const sourceDocRef = branchDoc(db, "bahan-baku", item.materialId, req.sourceBranch);
        batch.update(sourceDocRef, {
          qtyKontainerBesar: increment(-item.qty)
        });

        // Target branch doc
        let targetDocRef;
        if (item.targetMaterialId) {
          targetDocRef = branchDoc(db, "bahan-baku", item.targetMaterialId, req.targetBranch);
        } else {
          // If no pre-matched target ID, attempt with same ID
          targetDocRef = branchDoc(db, "bahan-baku", item.materialId, req.targetBranch);
        }
        batch.update(targetDocRef, {
          qtyKontainerBesar: increment(item.qty)
        });
      }

      // 3. Update status permintaan
      const reqRef = doc(db, "transfer_requests", req.id);
      batch.update(reqRef, {
        status: "approved",
        approverKaryawanId: selectedKaryawanId,
        approverKaryawanNama: approverNama,
        approverShift: Number(shift),
        approvedAt: serverTimestamp()
      });

      // 4. Log transaksi pemindahan barang untuk kedua cabang
      const logItems = req.items.map(item => ({
        materialId: item.materialId,
        materialName: item.nama,
        materialCode: item.code,
        qty: item.qty,
        unit: item.unit || "Pack",
        price: item.price || 0,
        subtotal: item.subtotal || 0
      }));

      // Log untuk cabang pengirim (source)
      const sourceLogRef = doc(branchCollection(db, "log_pembelian_bahan", req.sourceBranch));
      batch.set(sourceLogRef, {
        nomorNota: req.nomorPermintaan,
        type: "transfer_antar_kontainer",
        sourceLocation: req.sourceBranchName,
        targetLocation: req.targetBranchName,
        sourceType: "kontainer",
        targetType: "kontainer",
        location: "kontainer",
        karyawanId: selectedKaryawanId,
        karyawanNama: approverNama,
        shift: Number(shift),
        items: logItems,
        totalItems: logItems.length,
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
        catatan: `Transfer keluar ke ${req.targetBranchName} (Diminta oleh: ${req.requesterKaryawanNama})`
      });

      // Log untuk cabang penerima (target)
      const targetLogRef = doc(branchCollection(db, "log_pembelian_bahan", req.targetBranch));
      batch.set(targetLogRef, {
        nomorNota: req.nomorPermintaan,
        type: "transfer_antar_kontainer",
        sourceLocation: req.sourceBranchName,
        targetLocation: req.targetBranchName,
        sourceType: "kontainer",
        targetType: "kontainer",
        location: "kontainer",
        karyawanId: req.requesterKaryawanId,
        karyawanNama: req.requesterKaryawanNama,
        shift: Number(req.requesterShift || 1),
        items: logItems,
        totalItems: logItems.length,
        tanggal: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp(),
        catatan: `Transfer masuk dari ${req.sourceBranchName} (Disetujui oleh: ${approverNama})`
      });

      await batch.commit();

      toast({
        title: "Permintaan Disetujui & Stok Dipindahkan!",
        description: `Barang telah diserahkan. Stok ${req.sourceBranchName} terpotong & stok ${req.targetBranchName} otomatis bertambah.`,
      });
    } catch (error) {
      console.error("Gagal menyetujui transfer:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menyetujui",
        description: "Terjadi kesalahan sistem saat memproses serah terima bahan.",
      });
    } finally {
      setSaving(false);
    }
  };

  // 3. Tolak Permintaan
  const handleRejectTransferRequest = async (reqId: string) => {
    setSaving(true);
    try {
      const approverNama = listKaryawan?.find(k => k.id === selectedKaryawanId)?.nama || "Karyawan";
      const reqRef = doc(db, "transfer_requests", reqId);
      await updateDoc(reqRef, {
        status: "rejected",
        approverKaryawanId: selectedKaryawanId || "",
        approverKaryawanNama: approverNama,
        approverShift: Number(shift),
        rejectionReason: rejectReasonInput.trim() || "Stok tidak mencukupi atau ditolak oleh kontainer penyedia.",
        rejectedAt: serverTimestamp()
      });

      toast({
        title: "Permintaan Ditolak",
        description: "Permintaan transfer bahan telah ditolak.",
      });
      setRejectingReqId(null);
      setRejectReasonInput("");
    } catch (error) {
      console.error("Gagal menolak transfer:", error);
      toast({
        variant: "destructive",
        title: "Gagal Menolak",
        description: "Terjadi kesalahan saat memproses penolakan.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            INPUT BAHAN BAKU
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border", theme.badgeClass)}>
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1", theme.dotColor)} />
              {branchInfo.shortName}
            </span>
            <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">
              OUTLET: {branchInfo.name}
            </span>
          </div>
        </div>

        {/* Pending Approval Badge Indicator */}
        {incomingPendingRequests.length > 0 && (
          <div 
            onClick={() => {
              setActiveTab("transfer_kontainer");
              setTransferSubTab("inbox");
            }}
            className="cursor-pointer flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 animate-bounce w-fit"
          >
            <Inbox className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-wider">
              {incomingPendingRequests.length} Permintaan Masuk Butuh Persetujuan!
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6 sm:space-y-8">
        <Card className="rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100/80 shadow-sm bg-white overflow-hidden p-4 sm:p-8 space-y-6 sm:space-y-8">
          
          {/* TOP NAV TABS: 3 KELOMPOK TERSTRUKTUR & RAPI */}
          <div className="bg-slate-100/90 p-2 sm:p-3 rounded-2xl sm:rounded-3xl border border-slate-200/80 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Group 1: Operasional Kontainer */}
              <div className="flex items-center gap-1 bg-white/70 p-1 rounded-2xl border border-slate-200/60 shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("pembelian")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs",
                    activeTab === "pembelian"
                      ? "bg-amber-500 text-white shadow-amber-200 scale-102"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                  <span>Beli Sendiri</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("pemakaian_base")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs",
                    activeTab === "pemakaian_base"
                      ? "bg-purple-600 text-white shadow-purple-200 scale-102"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <ChefHat className="h-3.5 w-3.5 shrink-0" />
                  <span>Base Resep</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("pemakaian_luar_resep")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs",
                    activeTab === "pemakaian_luar_resep"
                      ? "bg-orange-500 text-white shadow-orange-200 scale-102"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  <span>Luar Resep</span>
                </button>
              </div>

              {/* Group 2: Operasional Gudang Sendiri */}
              <div className="flex items-center gap-1 bg-white/70 p-1 rounded-2xl border border-slate-200/60 shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("ambil")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs border",
                    activeTab === "ambil"
                      ? "bg-rose-500 text-white border-rose-500 shadow-rose-100 scale-102"
                      : "bg-white text-rose-800 border-rose-100 hover:bg-rose-50/50"
                  )}
                >
                  <PackagePlus className="h-3.5 w-3.5 shrink-0" />
                  <span>Ambil Gudang</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("kembali")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs border",
                    activeTab === "kembali"
                      ? "bg-rose-500 text-white border-rose-500 shadow-rose-100 scale-102"
                      : "bg-white text-rose-800 border-rose-100 hover:bg-rose-50/50"
                  )}
                >
                  <Truck className="h-3.5 w-3.5 shrink-0" />
                  <span>Retur Gudang</span>
                </button>
              </div>

              {/* Group 3: Antar Kontainer (Cabang Lain) */}
              <div className="flex items-center gap-1 bg-white/70 p-1 rounded-2xl border border-indigo-200 shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("transfer_kontainer")}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-xs",
                    activeTab === "transfer_kontainer"
                      ? "bg-indigo-600 text-white shadow-indigo-200 scale-102"
                      : "text-indigo-800 hover:bg-indigo-50"
                  )}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                  <span>Antar Kontainer</span>
                  {incomingPendingRequests.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[9px] font-black animate-pulse">
                      {incomingPendingRequests.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: PEMBELIAN BAHAN BAKU (BELI SENDIRI) */}
          {/* ========================================================= */}
          {activeTab === "pembelian" && (
            <form onSubmit={handleSave} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
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

              <div className="bg-[#FFFDF5] border border-[#FDE68A] rounded-2xl p-4 text-amber-950 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-black uppercase tracking-wide text-[10px] text-amber-900">
                    KATEGORI PEMBELIAN BELI SENDIRI AKTIF
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
                    Setiap pembelian bahan baku oleh karyawan diperuntukkan untuk <strong>Beli Sendiri</strong> dan stok otomatis <strong>masuk langsung ke Area Kontainer</strong>.
                  </p>
                </div>
              </div>

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

                        <div className="lg:col-span-1 space-y-1">
                          <Label className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                            SATUAN
                          </Label>
                          <div className="h-11 flex items-center justify-center bg-white rounded-xl text-xs font-black uppercase text-slate-700 border border-slate-200">
                            {matDetail?.satuanBesar || "-"}
                          </div>
                        </div>

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

          {/* ========================================================= */}
          {/* TAB 2: INPUT PEMAKAIAN RESEP BASE / PELENGKAP */}
          {/* ========================================================= */}
          {activeTab === "pemakaian_base" && (
            <form onSubmit={handleSavePemakaian} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
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

              <div className="bg-purple-50/90 border border-purple-200 rounded-2xl p-4 sm:p-5 text-purple-950 flex items-start gap-3.5">
                <ChefHat className="h-6 w-6 text-purple-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black uppercase tracking-wide text-[10px] sm:text-[11px] text-purple-900 flex items-center gap-2">
                    OTOMATISASI RESEP BASE & RACIKAN PELENGKAP
                  </p>
                  <p className="text-[11px] sm:text-xs leading-relaxed text-purple-800 font-medium">
                    Saat input dicatat: Sistem akan <strong>memotong bahan baku penyusun</strong> dari stok kontainer dan <strong>otomatis menambahkan stok bahan base</strong> ke stok kontainer sesuai takaran kemasan/cup.
                  </p>
                </div>
              </div>

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

                          <div className="md:col-span-3 space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-wider text-purple-900">
                              JUMLAH RACIK (PACK)
                            </Label>
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

                          <div className="md:col-span-3 space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-wider text-emerald-900">
                              TOTAL CUP / PORSI
                            </Label>
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

                        {recipe && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-purple-100 text-xs">
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

          {/* ========================================================= */}
          {/* TAB 3: PEMAKAIAN BAHAN DI LUAR RESEP */}
          {/* ========================================================= */}
          {activeTab === "pemakaian_luar_resep" && (
            <form onSubmit={handleSavePemakaianLuarResep} className="space-y-6 sm:space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6">
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

          {/* ========================================================= */}
          {/* TAB 4: AMBIL STOCK DARI GUDANG SENDIRI */}
          {/* ========================================================= */}
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

          {/* ========================================================= */}
          {/* TAB 5: PENGEMBALIAN BARANG KE GUDANG SENDIRI */}
          {/* ========================================================= */}
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

          {/* ========================================================= */}
          {/* TAB 6: FITUR BARU - TRANSFER ANTAR KONTAINER (APPROVAL) */}
          {/* ========================================================= */}
          {activeTab === "transfer_kontainer" && (
            <div className="space-y-6 sm:space-y-8">
              
              {/* Sub Navigation Segmented Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setTransferSubTab("request")}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                      transferSubTab === "request"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-102"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Minta Bahan (Baru)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferSubTab("inbox")}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all relative",
                      transferSubTab === "inbox"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-102"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    <span>Permintaan Masuk</span>
                    {incomingPendingRequests.length > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full animate-bounce">
                        {incomingPendingRequests.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferSubTab("history")}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                      transferSubTab === "history"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 scale-102"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>Riwayat Transfer</span>
                  </button>
                </div>

                <span className="text-[10px] font-bold text-slate-500 uppercase px-2 hidden lg:inline-block">
                  🏢 Lokasi Anda: <strong>{BRANCH_LIST[activeBranch]?.shortName}</strong>
                </span>
              </div>

              {/* -------------------------------------------------- */}
              {/* SUB-TAB 1: FORM MINTA BAHAN KE KONTAINER LAIN */}
              {/* -------------------------------------------------- */}
              {transferSubTab === "request" && (
                <form onSubmit={handleCreateTransferRequest} className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                  
                  {/* Notice Box */}
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 text-indigo-950 flex items-start gap-3">
                    <ArrowRightLeft className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-black uppercase tracking-wide text-[10px] text-indigo-900">
                        ALUR PERMINTAAN BAHAN ANTAR KONTAINER
                      </p>
                      <p className="text-[11px] leading-relaxed text-indigo-800 font-medium">
                        Permintaan akan dikirim ke kontainer tujuan. Stok kontainer penyedia <strong>belum akan terpotong</strong> sampai karyawan kontainer tersebut <strong>menyetujui & menyerahkan barang</strong> di panelnya. Transaksi ini murni mutasi persediaan fisik (tidak menjadi beban kas/keuangan).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    {/* 1. Pilih Kontainer Tujuan Permintaan */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                        MINTA KE KONTAINER CABANG: <span className="text-rose-500">*</span>
                      </Label>
                      <Select 
                        value={targetSourceBranch} 
                        onValueChange={(val) => setTargetSourceBranch(val as BranchId)}
                      >
                        <SelectTrigger className="rounded-2xl border-indigo-200 h-12 sm:h-14 bg-indigo-50/40 font-black text-indigo-950 text-xs sm:text-sm">
                          <SelectValue placeholder="Pilih cabang..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl">
                          {availableOtherBranches.map((b) => (
                            <SelectItem key={b} value={b} className="rounded-xl font-bold">
                              {BRANCH_LIST[b]?.name} ({BRANCH_LIST[b]?.shortName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 2. Pilih Shift */}
                    <div className="space-y-1.5">
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

                    {/* 3. Karyawan Pemohon */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                        KARYAWAN PEMOHON <span className="text-rose-500">*</span>
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
                  </div>

                  {/* Rincian Bahan yang Diminta */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-xs sm:text-sm font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                        <Package className="h-4 w-4 text-indigo-600" />
                        DAFTAR BAHAN YANG DIMINTA KE {BRANCH_LIST[targetSourceBranch]?.shortName.toUpperCase()}
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddTransferItem}
                        className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                      >
                        <PlusCircle className="h-3.5 w-3.5 text-indigo-600" /> Tambah Baris
                      </button>
                    </div>

                    <div className="space-y-3">
                      {transferItems.map((item, index) => {
                        const mat = sourceMaterials?.find(m => m.id === item.materialId);
                        const isStockLow = Number(mat?.qtyKontainerBesar || 0) <= 0;

                        return (
                          <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end bg-[#F6F8FF] p-4 sm:p-5 rounded-2xl border border-indigo-100 shadow-xs">
                            <div className="sm:col-span-8 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-slate-500">
                                Pilih Bahan Baku ({BRANCH_LIST[targetSourceBranch]?.shortName})
                              </Label>
                              <Select
                                value={item.materialId}
                                onValueChange={(val) => handleTransferItemChange(index, "materialId", val)}
                              >
                                <SelectTrigger className="rounded-xl border-indigo-100 h-11 bg-white font-black text-slate-900 text-xs">
                                  <SelectValue placeholder="Pilih bahan baku dari kontainer penyedia..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-none shadow-2xl max-h-64">
                                  {sourceMaterials?.map((m) => (
                                    <SelectItem key={m.id} value={m.id} className="rounded-xl text-xs font-bold">
                                      {m.code ? `[${m.code}] ` : ""}{m.nama} — (Stok Kontainer: {m.qtyKontainerBesar || 0} {m.satuanBesar})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {mat && (
                                <p className={cn(
                                  "text-[9px] font-black uppercase tracking-tight mt-1",
                                  isStockLow ? "text-rose-600" : "text-emerald-700"
                                )}>
                                  Stok Saat Ini di {BRANCH_LIST[targetSourceBranch]?.shortName}: {mat.qtyKontainerBesar || 0} {mat.satuanBesar} / {mat.qtyKontainerKecil || 0} {mat.satuanKecil}
                                </p>
                              )}
                            </div>

                            <div className="sm:col-span-3 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-slate-500">
                                Jumlah Diminta ({mat?.satuanBesar || "Sat. Besar"})
                              </Label>
                              <Input
                                type="number"
                                min="0.1"
                                step="any"
                                value={item.qty}
                                onChange={(e) => handleTransferItemChange(index, "qty", Number(e.target.value))}
                                className="rounded-xl border-indigo-100 h-11 bg-white font-black text-center text-xs sm:text-sm"
                                placeholder="1"
                                required
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveTransferItem(index)}
                                className="h-11 w-11 rounded-xl text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center shrink-0 bg-white shadow-sm border border-indigo-100"
                                disabled={transferItems.length === 1}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Catatan / Alasan Permintaan */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-700">
                      CATATAN / ALASAN PERMINTAAN (OPSIONAL)
                    </Label>
                    <Input
                      value={transferCatatan}
                      onChange={(e) => setTransferCatatan(e.target.value)}
                      placeholder="Contoh: Stok cup di GDM habis mendadak untuk operasional shift 1"
                      className="rounded-2xl border-slate-200 h-12 sm:h-14 bg-[#F8FAFC] font-medium text-xs sm:text-sm"
                    />
                  </div>

                  {/* Tombol Kirim */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={saving || transferItems.some(i => !i.materialId)}
                      className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-black uppercase tracking-wider text-xs sm:text-sm shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span>Kirim Permintaan ke {BRANCH_LIST[targetSourceBranch]?.shortName}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* -------------------------------------------------- */}
              {/* SUB-TAB 2: PERMINTAAN MASUK (APPROVAL PANEL) */}
              {/* -------------------------------------------------- */}
              {transferSubTab === "inbox" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/80 p-4 rounded-2xl border border-amber-200">
                    <div className="flex items-center gap-3">
                      <Inbox className="h-5 w-5 text-amber-700 shrink-0" />
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                          PERMINTAAN MASUK DARI KONTAINER LAIN
                        </h4>
                        <p className="text-[11px] text-amber-800 font-medium">
                          Pilih nama karyawan yang bertugas saat ini sebelum mengklik <strong>Setujui & Serahkan Barang</strong>.
                        </p>
                      </div>
                    </div>

                    {/* Karyawan bertugas selector */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Select value={selectedKaryawanId} onValueChange={setSelectedKaryawanId}>
                        <SelectTrigger className="rounded-xl border-amber-300 h-10 bg-white font-bold text-xs text-amber-950 min-w-[180px]">
                          <SelectValue placeholder="Pilih Karyawan..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl max-h-60">
                          {listKaryawan?.map((k) => (
                            <SelectItem key={k.id} value={k.id} className="rounded-xl font-medium">
                              {k.nama}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={String(shift)} onValueChange={(val) => setShift(Number(val) as 1 | 2)}>
                        <SelectTrigger className="rounded-xl border-amber-300 h-10 bg-white font-bold text-xs text-amber-950 w-24">
                          <SelectValue placeholder="Shift" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl">
                          <SelectItem value="1" className="rounded-xl font-bold">Shift 1</SelectItem>
                          <SelectItem value="2" className="rounded-xl font-bold">Shift 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {incomingPendingRequests.length === 0 ? (
                    <div className="bg-[#F8FAFC] rounded-2xl p-12 text-center border border-slate-100 space-y-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-700">
                        TIDAK ADA PERMINTAAN MASUK YANG PENDING
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Semua permintaan barang dari kontainer lain telah diproses.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {incomingPendingRequests.map((req) => (
                        <div 
                          key={req.id} 
                          className="bg-white rounded-2xl sm:rounded-3xl border-2 border-amber-300 p-5 sm:p-6 shadow-sm space-y-4 relative overflow-hidden"
                        >
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 text-[10px] font-black uppercase">
                                  #{req.nomorPermintaan}
                                </span>
                                <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-100">
                                  Pemohon: {req.targetBranchName}
                                </span>
                              </div>
                              <p className="text-xs font-black text-slate-900 mt-1">
                                Diminta oleh: <strong>{req.requesterKaryawanNama}</strong> (Shift {req.requesterShift || 1})
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                              {req.tanggal} {req.createdAt?.toDate ? `• ${req.createdAt.toDate().toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}` : ""}
                            </span>
                          </div>

                          {/* Items List */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              Bahan yang Diminta:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {req.items.map((item, idx) => (
                                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-black text-slate-900">
                                      {item.code !== "-" ? `[${item.code}] ` : ""}{item.nama}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      Satuan: {item.unit}
                                    </p>
                                  </div>
                                  <span className="text-sm font-black text-indigo-900 bg-indigo-100/70 px-3 py-1 rounded-lg">
                                    {item.qty} {item.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {req.catatan && (
                            <p className="text-[11px] text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                              Catatan: &ldquo;{req.catatan}&rdquo;
                            </p>
                          )}

                          {/* Action Buttons */}
                          {rejectingReqId === req.id ? (
                            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-200 space-y-3">
                              <p className="text-xs font-black uppercase text-rose-900">
                                Alasan Penolakan Permintaan:
                              </p>
                              <Input
                                value={rejectReasonInput}
                                onChange={(e) => setRejectReasonInput(e.target.value)}
                                placeholder="Contoh: Stok di kontainer kami juga menipis"
                                className="bg-white border-rose-200 font-medium text-xs"
                              />
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setRejectingReqId(null)}
                                  className="px-4 py-2 rounded-xl bg-white text-slate-700 text-xs font-black uppercase border border-slate-200 hover:bg-slate-50"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectTransferRequest(req.id)}
                                  disabled={saving}
                                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-700 shadow-sm"
                                >
                                  {saving ? "Memproses..." : "Konfirmasi Tolak"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setRejectingReqId(req.id)}
                                disabled={saving}
                                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                              >
                                <XCircle className="h-4 w-4" /> Tolak
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleApproveTransferRequest(req)}
                                disabled={saving}
                                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                              >
                                {saving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                <span>Setujui &amp; Serahkan Barang</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* -------------------------------------------------- */}
              {/* SUB-TAB 3: RIWAYAT TRANSFER (MASUK & KELUAR) */}
              {/* -------------------------------------------------- */}
              {transferSubTab === "history" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <History className="h-4 w-4 text-indigo-600" />
                      RIWAYAT PERMINTAAN &amp; TRANSFER ANTAR KONTAINER
                    </h4>
                  </div>

                  {myOutgoingRequests.filter(r => r.status === "pending").length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 w-fit">
                        ⏳ Permintaan Keluar yang Sedang Menunggu Persetujuan:
                      </p>
                      {myOutgoingRequests.filter(r => r.status === "pending").map((req) => (
                        <div key={req.id} className="bg-amber-50/50 rounded-2xl p-4 border border-amber-200 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-900 text-[10px] font-black">
                                #{req.nomorPermintaan}
                              </span>
                              <span className="font-bold text-slate-800">
                                Minta ke: <strong>{req.sourceBranchName}</strong>
                              </span>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase animate-pulse">
                              Menunggu Persetujuan
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs text-slate-700">
                            {req.items.map((it, idx) => (
                              <span key={idx} className="bg-white px-2 py-1 rounded-lg border border-amber-200 font-semibold text-[11px]">
                                {it.nama}: <strong>{it.qty} {it.unit}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {transferHistoryLogs.length === 0 ? (
                    <div className="bg-[#F8FAFC] rounded-2xl p-10 text-center border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        BELUM ADA RIWAYAT TRANSFER SELESAI
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {transferHistoryLogs.map((req) => {
                        const isOut = req.sourceBranch === activeBranch; // We gave items
                        const isApproved = req.status === "approved";

                        return (
                          <div key={req.id} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase">
                                  #{req.nomorPermintaan}
                                </span>
                                <span className={cn(
                                  "px-2.5 py-1 rounded-xl text-[10px] font-black uppercase",
                                  isApproved ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                )}>
                                  {isApproved ? "Disetujui & Selesai" : "Ditolak"}
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                  {isOut ? `Keluar ke → ${req.targetBranchName}` : `Masuk dari ← ${req.sourceBranchName}`}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400">
                                {req.tanggal}
                              </span>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-700">
                              {req.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[11px]">
                                  <span className="font-bold text-slate-800">
                                    {it.code !== "-" ? `[${it.code}] ` : ""}{it.nama}
                                  </span>
                                  <span className="font-black text-indigo-900">
                                    {it.qty} {it.unit}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                              <span>Pemohon: {req.requesterKaryawanNama} ({req.targetBranchName})</span>
                              {req.approverKaryawanNama && (
                                <span>Penyetuju: {req.approverKaryawanNama} ({req.sourceBranchName})</span>
                              )}
                            </div>

                            {req.rejectionReason && (
                              <p className="text-[10px] text-rose-600 bg-rose-50 p-2 rounded-lg font-medium">
                                Alasan Penolakan: {req.rejectionReason}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* HISTORI SECTION (Untuk Tab 1 - 5) */}
          {/* ========================================================= */}
          {activeTab !== "transfer_kontainer" && (
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
          )}
        </Card>
      </div>
    </div>
  );
}
