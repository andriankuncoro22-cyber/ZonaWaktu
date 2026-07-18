"use client";

import React, { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { 
  Calendar as CalendarIcon,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  Trash2,
  Wallet,
  ShoppingBag,
  Loader2,
  Save,
  History,
  ArrowRight,
  ArrowLeft,
  CheckCheck,
  FileCheck2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  deleteDoc, 
  doc, 
  where, 
  getDocs, 
  writeBatch,
  getDoc,
  increment
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SaleItem {
  name: string;
  code: string;
  total: number;
  pendapatan: number;
  keuntungan: number;
}

interface ProductionBatchItem {
  resepId: string;
  qty: number;
}

interface TransactionReportForm {
  cashTotal: number;
  qrisTotal: number;
  goFoodTotal: number;
  otherTotal: number;
}

interface UploadedExcelReport {
  items: SaleItem[];
  totalPendapatan: number;
  fileName: string;
}

export default function EmployeeClosingTokoPage({
  variant = "employee",
}: {
  variant?: "employee" | "owner";
}) {
  const db = useFirestore();
  const { toast } = useToast();
  const isOwnerView = variant === "owner";
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [uploadedExcelReport, setUploadedExcelReport] = useState<UploadedExcelReport | null>(null);
  const [transactionReport, setTransactionReport] = useState<TransactionReportForm>({
    cashTotal: 0,
    qrisTotal: 0,
    goFoodTotal: 0,
    otherTotal: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productionBatch, setProductionBatch] = useState<ProductionBatchItem[]>([
    { resepId: "", qty: 1 }
  ]);

  const resepQuery = useMemoFirebase(() => 
    query(collection(db, "resep"), where("type", "==", "pelengkap")), 
    [db]
  );
  const { data: listResep } = useCollection(resepQuery);

  const selectedDateQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), where("tanggal", "==", selectedDate)), 
    [db, selectedDate]
  );
  const { data: currentDayData } = useCollection(selectedDateQuery);

  const historyQuery = useMemoFirebase(() => 
    query(collection(db, "penjualan"), orderBy("createdAt", "desc"), limit(10)), 
    [db]
  );
  const { data: historyList } = useCollection(historyQuery);

  const keuanganHistoryQuery = useMemoFirebase(() => 
    query(collection(db, "keuangan-kontainer"), orderBy("createdAt", "desc"), limit(10)),
    [db]
  );
  const { data: keuanganHistoryList } = useCollection(keuanganHistoryQuery);

  const ownerHistoryList = useMemo(() => {
    interface FirestoreDoc { createdAt?: { seconds?: number }; [k: string]: unknown; }
    const closingEntries = (historyList || []).map((item) => ({ ...(item as FirestoreDoc), kind: "closing" }));
    const keuanganEntries = (keuanganHistoryList || []).map((item) => ({ ...(item as FirestoreDoc), kind: "keuangan" }));
    return [...closingEntries, ...keuanganEntries].sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [historyList, keuanganHistoryList]);

  const groupedHistoryList = useMemo(() => {
    const groups: { [date: string]: any[] } = {};
    (ownerHistoryList || []).forEach((hist: any) => {
      const date = hist.tanggal || "Tanpa Tanggal";
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(hist);
    });

    return Object.entries(groups).map(([date, items]) => {
      const maxSeconds = Math.max(...items.map((it: any) => it.createdAt?.seconds || 0));
      return {
        date,
        maxSeconds,
        items
      };
    }).sort((a, b) => b.maxSeconds - a.maxSeconds);
  }, [ownerHistoryList]);

  const stats = useMemo(() => {
    if (!currentDayData || currentDayData.length === 0) {
      return { totalPendapatan: 0, totalKeuntungan: 0, totalQty: 0 };
    }
    return currentDayData.reduce((acc, closing) => ({
      totalPendapatan: acc.totalPendapatan + (closing.total || 0),
      totalKeuntungan: acc.totalKeuntungan + (closing.keuntunganTotal || 0),
      totalQty: acc.totalQty + (closing.totalQty || 0)
    }), { totalPendapatan: 0, totalKeuntungan: 0, totalQty: 0 });
  }, [currentDayData]);

  const transactionReportTotal = useMemo(() => {
    return transactionReport.cashTotal + transactionReport.qrisTotal + transactionReport.goFoodTotal + transactionReport.otherTotal;
  }, [transactionReport]);

  const reportMatchDifference = useMemo(() => {
    if (!uploadedExcelReport) return null;
    return transactionReportTotal - uploadedExcelReport.totalPendapatan;
  }, [transactionReportTotal, uploadedExcelReport]);

  const isTransactionReportValid = useMemo(() => {
    return !!uploadedExcelReport && Math.abs((reportMatchDifference ?? 0)) < 0.01;
  }, [reportMatchDifference, uploadedExcelReport]);

  const steps = [
    { id: 1, title: "Pilih Tanggal", description: "Atur tanggal closing" },
    { id: 2, title: "Upload Laporan Excel", description: "Impor data penjualan" },
    { id: 3, title: "Input Laporan Transaksi", description: "Isi rincian pembayaran" },
  ];

  const parseNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/,/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const formatThousand = (val: number | string) => {
    if (val === null || val === undefined || val === '') return '';
    const numStr = String(val).replace(/[^\d]/g, '');
    if (!numStr) return '';
    return Number(numStr).toLocaleString('id-ID');
  };

  const normalizeExcelHeader = (value: any) => {
    if (value === null || value === undefined) return "";
    return String(value)
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  };

  const getExcelCellValue = (row: Record<string, any>, aliases: string[]) => {
    const normalizedRow = Object.entries(row).reduce((acc, [key, value]) => {
      acc[normalizeExcelHeader(key)] = value;
      return acc;
    }, {} as Record<string, any>);

    for (const alias of aliases) {
      const normalizedAlias = normalizeExcelHeader(alias);
      if (normalizedRow[normalizedAlias] !== undefined) {
        return normalizedRow[normalizedAlias];
      }
    }

    return undefined;
  };

  const handleAddProductionItem = () => {
    setProductionBatch([...productionBatch, { resepId: "", qty: 1 }]);
  };

  const handleRemoveProductionItem = (index: number) => {
    if (productionBatch.length === 1) return;
    setProductionBatch(productionBatch.filter((_, i) => i !== index));
  };

  const handleProductionItemChange = (index: number, field: keyof ProductionBatchItem, value: any) => {
    const newBatch = [...productionBatch];
    newBatch[index] = { ...newBatch[index], [field]: value } as ProductionBatchItem;
    setProductionBatch(newBatch);
  };

  const resetWorkflow = () => {
    setActiveStep(1);
    setUploadedExcelReport(null);
    setTransactionReport({ cashTotal: 0, qrisTotal: 0, goFoodTotal: 0, otherTotal: 0 });
    setProductionBatch([{ resepId: "", qty: 1 }]);
  };

  const handleSaveProduksi = async () => {
    const validBatch = productionBatch.filter(item => item.resepId && item.qty > 0);
    if (validBatch.length === 0) return;
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const materialsSnap = await getDocs(collection(db, "bahan-baku"));
      const materialMap: { [key: string]: any } = {};
      materialsSnap.forEach(d => {
        materialMap[d.id] = { id: d.id, ...d.data() };
      });

      const totalDeductions: { [key: string]: number } = {};
      const totalAdditions: { [key: string]: number } = {};

      for (const item of validBatch) {
        const resep = listResep?.find(r => r.id === item.resepId);
        if (!resep) continue;

        // Deduct raw material ingredients
        resep.komposisi.forEach((ing: any) => {
          const deduction = ing.jumlah * item.qty;
          totalDeductions[ing.bahanBakuId] = (totalDeductions[ing.bahanBakuId] || 0) + deduction;
        });

        // Add produced mixtures/pelengkap to the container stock
        const nameNormalized = resep.namaPelengkap?.trim().toLowerCase();
        if (nameNormalized === "creamy foam") {
          const creamyFoamMat = Object.values(materialMap).find((m: any) => m.code?.trim().toUpperCase() === "BB065");
          if (creamyFoamMat) {
            totalAdditions[creamyFoamMat.id] = (totalAdditions[creamyFoamMat.id] || 0) + item.qty;
          }
        } else if (nameNormalized === "teh tarik") {
          const tehTarikMat = Object.values(materialMap).find((m: any) => m.code?.trim().toUpperCase() === "BB064");
          if (tehTarikMat) {
            totalAdditions[tehTarikMat.id] = (totalAdditions[tehTarikMat.id] || 0) + item.qty;
          }
        }
      }

      const modifiedIds = new Set<string>([
        ...Object.keys(totalDeductions),
        ...Object.keys(totalAdditions)
      ]);

      modifiedIds.forEach((matId) => {
        const material = materialMap[matId];
        if (!material) return;

        let bulkQty = Number(material.qtyKontainerBesar || 0);
        let activeQty = Number(material.qtyKontainerKecil || 0);
        const conversionRate = Number(material.qtyKecil || 1);

        // Add produced amount to bulk kontainer
        const addition = totalAdditions[matId] || 0;
        bulkQty += addition;

        // Deduct consumed ingredients from active kontainer
        const deduction = totalDeductions[matId] || 0;
        activeQty -= deduction;

        // Convert/borrow from bulk if active quantity goes negative
        while (activeQty < 0 && bulkQty > 0) {
          bulkQty -= 1;
          activeQty += conversionRate;
        }

        const materialRef = doc(db, "bahan-baku", matId);
        batch.update(materialRef, {
          qtyKontainerBesar: bulkQty,
          qtyKontainerKecil: activeQty
        });
      });

      const logRef = doc(collection(db, "log_produksi_pelengkap"));
      batch.set(logRef, {
        items: validBatch.map(item => ({
          resepId: item.resepId,
          namaResep: listResep?.find(r => r.id === item.resepId)?.namaPelengkap,
          jumlah: item.qty
        })),
        tanggal: selectedDate,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      
      toast({
        title: "Pemakaian Dicatat",
        description: `${validBatch.length} jenis bahan telah dicatat & stok terpotong.`,
      });
      setProductionBatch([{ resepId: "", qty: 1 }]);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal Mencatat Pemakaian",
        description: e.message || "Terjadi kesalahan sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveToFirestore = async (
    items: SaleItem[],
    date: string,
    reportBreakdown?: TransactionReportForm
  ) => {
    if (items.length === 0) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const [productsSnap, recipesSnap, materialsSnap] = await Promise.all([
        getDocs(collection(db, "produk")),
        getDocs(collection(db, "resep")),
        getDocs(collection(db, "bahan-baku"))
      ]);

      const productCodeMap: { [key: string]: string } = {};
      productsSnap.forEach(d => {
        const p = d.data();
        if (p.code) productCodeMap[p.code] = d.id;
      });

      const recipeMap: { [key: string]: any } = {};
      recipesSnap.forEach(d => {
        const r = d.data();
        if (r.produkId) recipeMap[r.produkId] = r.komposisi;
      });

      const materialMap: { [key: string]: any } = {};
      materialsSnap.forEach(d => {
        materialMap[d.id] = { id: d.id, ...d.data() };
      });

      const totalPendapatan = items.reduce((sum, item) => sum + item.pendapatan, 0);
      const totalKeuntungan = items.reduce((sum, item) => sum + item.keuntungan, 0);
      const totalQty = items.reduce((sum, item) => sum + item.total, 0);
      const reportTotal = reportBreakdown
        ? reportBreakdown.cashTotal + reportBreakdown.qrisTotal + reportBreakdown.goFoodTotal + reportBreakdown.otherTotal
        : totalPendapatan;

      const saleRef = doc(collection(db, "penjualan"));
      batch.set(saleRef, {
        tanggal: date,
        createdAt: serverTimestamp(),
        total: totalPendapatan,
        keuntunganTotal: totalKeuntungan,
        totalQty: totalQty,
        items: items,
        status: "completed",
        transactionReport: reportBreakdown
          ? {
              cashTotal: reportBreakdown.cashTotal,
              qrisTotal: reportBreakdown.qrisTotal,
              goFoodTotal: reportBreakdown.goFoodTotal,
              otherTotal: reportBreakdown.otherTotal,
              total: reportTotal,
              matchesExcel: Math.abs(reportTotal - totalPendapatan) < 0.01,
            }
          : null,
        excelPendapatan: totalPendapatan
      });

      const totalDeductions: { [key: string]: number } = {};
      items.forEach((item) => {
        const productId = productCodeMap[item.code];
        if (productId && recipeMap[productId]) {
          recipeMap[productId].forEach((ing: any) => {
            const deduction = ing.jumlah * item.total;
            totalDeductions[ing.bahanBakuId] = (totalDeductions[ing.bahanBakuId] || 0) + deduction;
          });
        }
      });

      Object.entries(totalDeductions).forEach(([matId, deduction]) => {
        const material = materialMap[matId];
        if (!material) return;

        let bulkQty = Number(material.qtyKontainerBesar || 0);
        let activeQty = Number(material.qtyKontainerKecil || 0);
        const conversionRate = Number(material.qtyKecil || 1); 

        activeQty -= deduction;

        while (activeQty < 0 && bulkQty > 0) {
          bulkQty -= 1;
          activeQty += conversionRate;
        }

        const materialRef = doc(db, "bahan-baku", matId);
        batch.update(materialRef, {
          qtyKontainerBesar: bulkQty,
          qtyKontainerKecil: activeQty
        });
      });

      await batch.commit();
      
      toast({
        title: "Berhasil Disimpan",
        description: `Laporan ${date} tersimpan & stok kontainer otomatis terpotong.`,
      });
      
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan saat memproses data.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Hapus data closing ini? Menghapus closing akan mengembalikan stok bahan baku kontainer yang terpakai, menghapus laporan operasional & belanja karyawan pada tanggal ini, serta menghapus shift report terkait.")) return;
    
    setSaving(true);
    try {
      const saleDocRef = doc(db, "penjualan", id);
      const saleDocSnap = await getDoc(saleDocRef);
      if (!saleDocSnap.exists()) {
        throw new Error("Data closing tidak ditemukan.");
      }
      
      const saleData = saleDocSnap.data();
      const targetTanggal = saleData.tanggal;
      const items = (saleData.items || []) as SaleItem[];

      const batch = writeBatch(db);

      // 1. Revert product sales stock consumption (from recipe)
      if (items.length > 0) {
        const [productsSnap, recipesSnap, materialsSnap] = await Promise.all([
          getDocs(collection(db, "produk")),
          getDocs(collection(db, "resep")),
          getDocs(collection(db, "bahan-baku"))
        ]);

        const productCodeMap: { [key: string]: string } = {};
        productsSnap.forEach(d => {
          const p = d.data();
          if (p.code) productCodeMap[p.code] = d.id;
        });

        const recipeMap: { [key: string]: any } = {};
        recipesSnap.forEach(d => {
          const r = d.data();
          if (r.produkId) recipeMap[r.produkId] = r.komposisi;
        });

        const materialMap: { [key: string]: any } = {};
        materialsSnap.forEach(d => {
          materialMap[d.id] = { id: d.id, ...d.data() };
        });

        const totalAdditions: { [key: string]: number } = {};

        items.forEach((item) => {
          const productId = productCodeMap[item.code];
          if (productId && recipeMap[productId]) {
            recipeMap[productId].forEach((ing: any) => {
              const addition = ing.jumlah * item.total;
              totalAdditions[ing.bahanBakuId] = (totalAdditions[ing.bahanBakuId] || 0) + addition;
            });
          }
        });

        Object.entries(totalAdditions).forEach(([matId, addition]) => {
          const material = materialMap[matId];
          if (!material) return;

          let bulkQty = Number(material.qtyKontainerBesar || 0);
          let activeQty = Number(material.qtyKontainerKecil || 0);
          const conversionRate = Number(material.qtyKecil || 1);

          activeQty += addition;

          while (activeQty >= conversionRate) {
            bulkQty += 1;
            activeQty -= conversionRate;
          }

          const materialRef = doc(db, "bahan-baku", matId);
          batch.update(materialRef, {
            qtyKontainerBesar: bulkQty,
            qtyKontainerKecil: activeQty
          });
        });
      }

      // 2. Cascade delete other daily documents if targetTanggal exists
      let operasionalCount = 0;
      let belanjaCount = 0;
      let shiftReportCount = 0;

      if (targetTanggal) {
        // A. Delete matching operasional-kontainer documents
        const operasionalSnap = await getDocs(
          query(
            collection(db, "operasional-kontainer"),
            where("tanggal", "==", targetTanggal)
          )
        );
        operasionalSnap.forEach((doc) => {
          batch.delete(doc.ref);
        });
        operasionalCount = operasionalSnap.size;

        // B. Fetch and revert stock for matching log_pembelian_bahan documents, then delete
        const logsSnap = await getDocs(
          query(
            collection(db, "log_pembelian_bahan"),
            where("tanggal", "==", targetTanggal)
          )
        );
        logsSnap.forEach((logDoc) => {
          const logData = logDoc.data();
          if (logData.items) {
            logData.items.forEach((item: any) => {
              if (item.materialId) {
                const materialRef = doc(db, "bahan-baku", item.materialId);
                const bulkToRevert = Number(item.addedBulkQty || item.qty || 0);
                const smallToRevert = Number(item.addedSmallUnits || 0);

                const updateObj: any = {};
                if (bulkToRevert > 0) {
                  updateObj.qtyKontainerBesar = increment(-bulkToRevert);
                }
                if (smallToRevert > 0) {
                  updateObj.qtyKontainerKecil = increment(-smallToRevert);
                }

                if (Object.keys(updateObj).length > 0) {
                  batch.update(materialRef, updateObj);
                }
              }
            });
          }
          batch.delete(logDoc.ref);
        });
        belanjaCount = logsSnap.size;

        // C. Delete matching keuangan-kontainer documents (shift reports)
        const keuanganSnap = await getDocs(
          query(
            collection(db, "keuangan-kontainer"),
            where("tanggal", "==", targetTanggal)
          )
        );
        keuanganSnap.forEach((doc) => {
          batch.delete(doc.ref);
        });
        shiftReportCount = keuanganSnap.size;
      }

      // 3. Delete the penjualan document
      batch.delete(saleDocRef);

      await batch.commit();

      toast({
        title: "Histori Closing & Relasi Dihapus",
        description: `Closing, ${shiftReportCount} shift report, ${operasionalCount} operasional, dan ${belanjaCount} rekap belanja berhasil dihapus. Stok bahan baku telah disesuaikan.`
      });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus Laporan",
        description: e.message || "Terjadi kesalahan sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKeuanganHistory = async (id: string) => {
    if (!confirm("Hapus histori keuangan kontainer ini? (Tindakan ini juga akan menghapus laporan operasional & rekap belanja shift terkait, serta mengembalikan stok bahan baku)")) return;
    try {
      const docRef = doc(db, "keuangan-kontainer", id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        toast({ variant: "destructive", title: "Laporan tidak ditemukan" });
        return;
      }
      
      const keuanganData = docSnap.data();
      const targetTanggal = keuanganData.tanggal;
      const targetShift = Number(keuanganData.shift || 1);

      if (!targetTanggal) {
        await deleteDoc(docRef);
        toast({ title: "Histori Dihapus" });
        return;
      }

      const batch = writeBatch(db);

      // 1. Fetch matching operasional-kontainer documents by date (and filter shift client-side to avoid composite index requirement)
      const operasionalSnap = await getDocs(
        query(
          collection(db, "operasional-kontainer"),
          where("tanggal", "==", targetTanggal)
        )
      );
      let deletedOpsCount = 0;
      operasionalSnap.forEach((doc) => {
        const opData = doc.data();
        if (Number(opData.shift || 1) === targetShift) {
          batch.delete(doc.ref);
          deletedOpsCount++;
        }
      });

      // 2. Fetch matching log_pembelian_bahan documents by date (and filter shift client-side to avoid composite index requirement)
      const logsSnap = await getDocs(
        query(
          collection(db, "log_pembelian_bahan"),
          where("tanggal", "==", targetTanggal)
        )
      );

      let deletedLogsCount = 0;
      logsSnap.forEach((logDoc) => {
        const logData = logDoc.data();
        if (Number(logData.shift ?? 2) === targetShift) {
          if (logData.items) {
            logData.items.forEach((item: any) => {
              if (item.materialId) {
                const materialRef = doc(db, "bahan-baku", item.materialId);
                const bulkToRevert = Number(item.addedBulkQty || item.qty || 0);
                const smallToRevert = Number(item.addedSmallUnits || 0);

                const updateObj: any = {};
                if (bulkToRevert > 0) {
                  updateObj.qtyKontainerBesar = increment(-bulkToRevert);
                }
                if (smallToRevert > 0) {
                  updateObj.qtyKontainerKecil = increment(-smallToRevert);
                }

                if (Object.keys(updateObj).length > 0) {
                  batch.update(materialRef, updateObj);
                }
              }
            });
          }
          batch.delete(logDoc.ref);
          deletedLogsCount++;
        }
      });

      // 3. Delete the keuangan-kontainer document
      batch.delete(docRef);

      await batch.commit();

      toast({ 
        title: "Histori & Relasi Dihapus", 
        description: `Laporan Keuangan, ${deletedOpsCount} operasional, dan ${deletedLogsCount} rekap belanja berhasil dihapus. Stok bahan baku telah dikembalikan.` 
      });
    } catch (e: any) { 
      console.error(e);
      toast({ 
        variant: "destructive", 
        title: "Gagal Menghapus", 
        description: e.message || "Terjadi kesalahan sistem saat menghapus data." 
      });
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const items: SaleItem[] = data.map((row: any) => {
          const itemRow = row as Record<string, any>;
          return {
            name: String(getExcelCellValue(itemRow, ["nama", "name"]) ?? "").trim(),
            code: String(getExcelCellValue(itemRow, ["code", "kode"]) ?? "").trim(),
            total: parseNumber(getExcelCellValue(itemRow, ["jumlah barang", "jumlahbarang", "qty", "quantity", "total", "jumlah", "amount", "jumlah transaksi", "jumlahtransaksi"]) ?? 0),
            pendapatan: parseNumber(getExcelCellValue(itemRow, ["pendapatan", "income", "revenue"]) ?? 0),
            keuntungan: parseNumber(getExcelCellValue(itemRow, ["keuntungan", "profit", "laba"]) ?? 0)
          };
        }).filter(item => {
          if (!item.name && !item.code) return false;

          const nameLower = item.name.toLowerCase();
          const codeLower = item.code.toLowerCase();

          // Exclude summary/total/grand rows
          const isTotalRow = [
            "total",
            "semua",
            "jumlah",
            "summary",
            "grand",
            "subtotal"
          ].some(keyword => nameLower.includes(keyword) || codeLower.includes(keyword));

          return !isTotalRow;
        });

        if (items.length > 0) {
          const totalPendapatan = items.reduce((sum, item) => sum + item.pendapatan, 0);
          setUploadedExcelReport({ items, totalPendapatan, fileName: file.name });
          setActiveStep(3);
          toast({
            title: "Laporan Excel Terbaca",
            description: `Total pendapatan terdeteksi Rp ${totalPendapatan.toLocaleString("id-ID")}`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Data Kosong",
            description: "Format file tidak sesuai atau tidak ada data produk.",
          });
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Gagal Impor",
          description: "Format file tidak didukung atau rusak.",
        });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTransactionReportChange = (field: keyof TransactionReportForm, value: string) => {
    const parsed = Number(value.replace(/\D/g, "")) || 0;
    setTransactionReport((prev) => {
      const nextState = { ...prev, [field]: parsed };
      if (uploadedExcelReport && field !== "cashTotal") {
        const otherSum = (nextState.qrisTotal || 0) + (nextState.goFoodTotal || 0) + (nextState.otherTotal || 0);
        nextState.cashTotal = Math.max(0, uploadedExcelReport.totalPendapatan - otherSum);
      }
      return nextState;
    });
  };

  const handleSaveTransactionReport = async () => {
    if (!uploadedExcelReport) {
      toast({
        variant: "destructive",
        title: "Belum Ada Excel",
        description: "Unggah laporan Excel terlebih dahulu.",
      });
      return;
    }

    if (!isTransactionReportValid) {
      toast({
        variant: "destructive",
        title: "Total Tidak Sesuai",
        description: "Jumlah transaksi harus sama dengan pendapatan Excel yang diupload.",
      });
      return;
    }

    await saveToFirestore(uploadedExcelReport.items, selectedDate, transactionReport);
    resetWorkflow();
  };

  if (!isOwnerView) {
    return (
      <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Closing Toko</h1>
          <p className="text-sm text-slate-500">Fitur ini hanya tersedia untuk akun owner. Untuk pencatatan pemakaian bahan, silakan gunakan menu Input Bahan Baku.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/employee/input-bahan-baku">
            <Button className="rounded-2xl bg-primary px-6 font-black uppercase tracking-widest text-[10px]">
              Buka Input Bahan Baku
            </Button>
          </Link>
          <Link href="/employee/dashboard">
            <Button variant="ghost" className="rounded-2xl px-6 font-black uppercase tracking-widest text-[10px]">
              Kembali ke Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Closing Toko</h1>
          <p className="mt-1 text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-[0.2em]">
            Lengkapi laporan penjualan dan pemakaian bahan per hari
          </p>
        </div>
      </div>

      <Card className="rounded-[2rem] border-none bg-white p-4 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {steps.map((step, index) => {
            const isActive = step.id === activeStep;
            const isDone = step.id < activeStep;
            return (
              <div key={step.id} className="flex flex-1 items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-black",
                  isActive ? "bg-primary text-white" : isDone ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {isDone ? <CheckCheck className="h-4 w-4" /> : step.id}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Langkah {index + 1}</p>
                  <p className="text-sm font-black text-slate-900">{step.title}</p>
                  <p className="text-[10px] text-slate-400">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          {activeStep === 1 && (
            <Card className="rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">Pilih Tanggal</h2>
              </div>
              <p className="mt-3 text-sm text-slate-500">Pilih tanggal penutupan untuk mencatat laporan harian.</p>
              <div className="mt-6 rounded-2xl bg-slate-50 p-5">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tanggal Penutupan</Label>
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-3 h-12 rounded-xl border-none bg-white shadow-sm" />
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={() => setActiveStep(2)} className="rounded-2xl bg-primary px-6 font-black uppercase tracking-widest text-[10px]">
                  Lanjut <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          {activeStep === 2 && (
            <Card className="rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">Upload Laporan Excel</h2>
              </div>
              <p className="mt-3 text-sm text-slate-500">Unggah file Excel dengan kolom nama, code, total, pendapatan, dan keuntungan. Kolom No. dapat ada dan akan diabaikan.</p>
              <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
              <div className={cn(
                "mt-6 flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 p-10 text-center transition-all",
                saving ? "opacity-50 pointer-events-none" : "hover:border-primary/20"
              )}>
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/5">
                  <FileCheck2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-black uppercase italic text-slate-900">{uploadedExcelReport ? "Laporan Excel Sudah Siap" : "Pilih File Excel"}</h3>
                <p className="mt-2 max-w-md text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {uploadedExcelReport ? `File: ${uploadedExcelReport.fileName}` : "Unggah laporan Excel untuk melanjutkan ke input transaksi."}
                </p>
                <Button disabled={saving} onClick={() => fileInputRef.current?.click()} className="mt-6 rounded-2xl bg-slate-900 px-6 font-black uppercase tracking-widest text-[10px]">
                  Pilih File Excel
                </Button>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setActiveStep(1)} className="rounded-2xl px-4 font-black uppercase tracking-widest text-[10px]">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Button>
                <Button onClick={() => uploadedExcelReport ? setActiveStep(3) : toast({ variant: "destructive", title: "Belum Ada Excel", description: "Unggah file Excel terlebih dahulu." })} className="rounded-2xl bg-primary px-6 font-black uppercase tracking-widest text-[10px]">
                  Lanjut <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          {activeStep === 3 && (
            <Card className="rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">Input Laporan Transaksi</h2>
              </div>
              <p className="mt-3 text-sm text-slate-500">Isi rincian total transaksi sesuai laporan Excel yang diupload.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  { 
                    key: "qrisTotal", 
                    label: "Total Transaksi Non Tunai (QRIS)", 
                    helper: "QRIS",
                    bgClass: "bg-purple-50/50 border border-purple-100",
                    labelClass: "text-purple-800",
                    helperClass: "text-purple-500"
                  },
                  { 
                    key: "cashTotal", 
                    label: "Total Transaksi Cash", 
                    helper: "Cash",
                    bgClass: "bg-emerald-50/50 border border-emerald-100",
                    labelClass: "text-emerald-800",
                    helperClass: "text-emerald-500"
                  },
                  { 
                    key: "goFoodTotal", 
                    label: "Transaksi Non Tunai GoFood", 
                    helper: "GoFood",
                    bgClass: "bg-rose-50/50 border border-rose-100",
                    labelClass: "text-rose-800",
                    helperClass: "text-rose-500"
                  },
                  { 
                    key: "otherTotal", 
                    label: "Transaksi Metode Lainnya", 
                    helper: "Lainnya",
                    bgClass: "bg-amber-50/50 border border-amber-100",
                    labelClass: "text-amber-800",
                    helperClass: "text-amber-500"
                  },
                ].map((field) => (
                  <div key={field.key} className={cn("rounded-2xl p-5 transition-all shadow-sm/5", field.bgClass)}>
                    <Label className={cn("text-[10px] font-black uppercase tracking-[0.2em]", field.labelClass)}>{field.label}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={transactionReport[field.key as keyof TransactionReportForm] === 0 ? "" : formatThousand(transactionReport[field.key as keyof TransactionReportForm])}
                      onChange={(e) => handleTransactionReportChange(field.key as keyof TransactionReportForm, e.target.value)}
                      placeholder="0"
                      className="mt-3 h-12 rounded-xl border-none bg-white shadow-sm"
                    />
                    <p className={cn("mt-2 text-[10px] font-black uppercase tracking-[0.2em]", field.helperClass)}>{field.helper}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Validasi total</p>
                <p className="mt-2 text-sm font-black text-slate-900">Total input: Rp {transactionReportTotal.toLocaleString("id-ID")}</p>
                <p className="text-sm font-black text-slate-900">Pendapatan Excel: Rp {uploadedExcelReport?.totalPendapatan.toLocaleString("id-ID")}</p>
                <p className={cn("mt-2 text-sm font-black", isTransactionReportValid ? "text-emerald-600" : "text-rose-600")}>Status: {isTransactionReportValid ? "Sesuai" : "Belum sesuai"}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setActiveStep(2)} className="rounded-2xl px-4 font-black uppercase tracking-widest text-[10px]">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
                </Button>
                <Button onClick={handleSaveTransactionReport} disabled={saving || !isTransactionReportValid} className="rounded-2xl bg-primary px-6 font-black uppercase tracking-widest text-[10px]">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Simpan Laporan
                </Button>
              </div>
            </Card>
          )}



          <div className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-3 px-4">
              <History className="h-5 w-5 text-primary" />
              <h3 className="text-[11px] md:text-sm font-black uppercase tracking-widest text-slate-900">Histori Closing & Keuangan Kontainer</h3>
            </div>
            <div className="grid gap-4 md:gap-6">
              {groupedHistoryList?.map((group: any) => (
                <Card key={group.date} className="rounded-[1.5rem] border-none bg-white p-4 shadow-sm md:p-6 space-y-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <CalendarIcon className="h-4.5 w-4.5 text-primary shrink-0" />
                    <h4 className="text-xs md:text-sm font-black uppercase italic text-slate-900 leading-none">
                      {group.date}
                    </h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((hist: any) => (
                      <div key={hist.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start gap-4">
                          <CheckCircle2 className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-slate-800 leading-tight">
                              {hist.kind === "keuangan"
                                ? (hist.shift === 1 ? "Laporan Shift 1 (Pagi)" : hist.shift === 2 ? "Laporan Shift 2 (Malam)" : "Keuangan Kontainer")
                                : `Hasil Upload Penjualan (${hist.items?.length || 0} Produk)`}
                            </p>
                            {hist.kind === "keuangan" && (
                              <div className="mt-2 space-y-1 rounded-xl bg-slate-50 p-2 text-[8px] font-black uppercase tracking-widest text-slate-500">
                                <p>Setoran: Rp {Number(hist.expectedCashToSettle || 0).toLocaleString("id-ID")}</p>
                                <p>Di pegang: Rp {Number(hist.cashOnHand || 0).toLocaleString("id-ID")}</p>
                                <p>Selisih: Rp {Number(hist.difference || 0).toLocaleString("id-ID")}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 shrink-0">
                          <div className="text-right">
                            {hist.kind === "keuangan" ? (
                              <>
                                <p className="text-xs md:text-sm font-black tabular-nums text-primary">Rp {Number(hist.expectedCashToSettle || 0).toLocaleString("id-ID")}</p>
                                <span className="text-[7px] md:text-[8px] font-black uppercase text-slate-300">Setoran</span>
                              </>
                            ) : (
                              <>
                                <p className="text-xs md:text-sm font-black tabular-nums text-primary">Rp {hist.total?.toLocaleString("id-ID")}</p>
                                <span className="text-[7px] md:text-[8px] font-black uppercase text-slate-300">Total</span>
                                {isOwnerView && hist.keuntunganTotal != null && (
                                  <p className="mt-1 text-[9px] md:text-[10px] font-black text-emerald-600 tabular-nums">Untung Rp {Number(hist.keuntunganTotal).toLocaleString("id-ID")}</p>
                                )}
                              </>
                            )}
                          </div>
                          {isOwnerView && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => hist.kind === "keuangan" ? handleDeleteKeuanganHistory(hist.id) : handleDeleteHistory(hist.id)}
                              className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-600 transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
              {(!groupedHistoryList || groupedHistoryList.length === 0) && (
                <div className="py-16 text-center text-[10px] font-black uppercase tracking-widest italic opacity-30 md:py-20">
                  Belum ada riwayat closing
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <Card className="overflow-hidden rounded-3xl border-none bg-white shadow-xl md:rounded-[2.5rem] lg:sticky lg:top-8">
            <div className="bg-slate-900 p-6 text-white md:p-8">
              <h3 className="text-lg font-black uppercase italic tracking-tighter md:text-xl">Ringkasan Sesi</h3>
            </div>
            <div className="space-y-6 p-6 md:space-y-8 md:p-10">
              <div className="flex items-center gap-4 md:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-inner md:h-14 md:w-14 md:rounded-2xl"><ShoppingBag className="h-6 w-6 md:h-7 md:w-7" /></div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Produk Terjual</p>
                  <p className="text-2xl font-black tabular-nums text-slate-900 md:text-3xl">{stats.totalQty}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 md:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-inner md:h-14 md:w-14 md:rounded-2xl"><Wallet className="h-6 w-6 md:h-7 md:w-7" /></div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Pendapatan</p>
                  <p className="text-2xl font-black tabular-nums text-primary md:text-3xl">Rp {stats.totalPendapatan.toLocaleString("id-ID")}</p>
                </div>
              </div>
              {isOwnerView && (
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-inner md:h-14 md:w-14 md:rounded-2xl"><TrendingUp className="h-6 w-6 md:h-7 md:w-7" /></div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Keuntungan</p>
                    <p className="text-2xl font-black tabular-nums text-emerald-600 md:text-3xl">Rp {stats.totalKeuntungan.toLocaleString("id-ID")}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
