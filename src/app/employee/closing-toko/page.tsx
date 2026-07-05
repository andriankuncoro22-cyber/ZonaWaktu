"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Calendar as CalendarIcon,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  Trash2,
  Wallet,
  ShoppingBag,
  Loader2,
  Plus,
  Save,
  Layers,
  History,
  X,
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
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  deleteDoc, 
  doc, 
  where, 
  getDocs, 
  writeBatch,
  increment 
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [selectedDate, setSelectedDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [uploadedExcelReport, setUploadedExcelReport] = useState<UploadedExcelReport | null>(null);
  const [transactionReport, setTransactionReport] = useState<TransactionReportForm>({
    cashTotal: 0,
    qrisTotal: 0,
    goFoodTotal: 0,
    otherTotal: 0,
  });

  useEffect(() => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProduksiOpen, setIsProduksiOpen] = useState(false);
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
  const { data: currentDayData, loading: loadingCurrentDay } = useCollection(selectedDateQuery);

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
    const closingEntries = (historyList || []).map((item: any) => ({ ...item, kind: "closing" }));
    const keuanganEntries = (keuanganHistoryList || []).map((item: any) => ({ ...item, kind: "keuangan" }));
    return [...closingEntries, ...keuanganEntries].sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [historyList, keuanganHistoryList]);

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
    { id: 4, title: "Input Pemakaian", description: "Catat pemakaian bahan" },
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
      setIsProduksiOpen(false);
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
    if (!confirm("Hapus data closing ini?")) return;
    try {
      await deleteDoc(doc(db, "penjualan", id));
      toast({ title: "Dihapus" });
    } catch (e) { console.error(e); }
  };

  const handleDeleteKeuanganHistory = async (id: string) => {
    if (!confirm("Hapus histori keuangan kontainer ini?")) return;
    try {
      await deleteDoc(doc(db, "keuangan-kontainer", id));
      toast({ title: "Histori Dihapus" });
    } catch (e) { console.error(e); }
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
            total: parseNumber(getExcelCellValue(itemRow, ["total", "jumlah", "amount"]) ?? 0),
            pendapatan: parseNumber(getExcelCellValue(itemRow, ["pendapatan", "income", "revenue"]) ?? 0),
            keuntungan: parseNumber(getExcelCellValue(itemRow, ["keuntungan", "profit", "laba"]) ?? 0)
          };
        }).filter(item => item.name || item.code);

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
    const parsed = Number(value.replace(/[^\d.-]/g, "")) || 0;
    setTransactionReport((prev) => ({ ...prev, [field]: parsed }));
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
    setActiveStep(4);
  };

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
                  { key: "cashTotal", label: "Total Transaksi Cash", helper: "Cash" },
                  { key: "qrisTotal", label: "Total Transaksi Non Tunai (QRIS)", helper: "QRIS" },
                  { key: "goFoodTotal", label: "Transaksi Non Tunai GoFood", helper: "GoFood" },
                  { key: "otherTotal", label: "Transaksi Metode Lainnya", helper: "Lainnya" },
                ].map((field) => (
                  <div key={field.key} className="rounded-2xl bg-slate-50 p-4">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{field.label}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={transactionReport[field.key as keyof TransactionReportForm] === 0 ? "" : transactionReport[field.key as keyof TransactionReportForm]}
                      onChange={(e) => handleTransactionReportChange(field.key as keyof TransactionReportForm, e.target.value)}
                      placeholder="0"
                      className="mt-3 h-12 rounded-xl border-none bg-white shadow-sm"
                    />
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{field.helper}</p>
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

          {activeStep === 4 && (
            <Card className="rounded-[2rem] border-none bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-black uppercase italic text-slate-900">Input Pemakaian</h2>
              </div>
              <p className="mt-3 text-sm text-slate-500">Catat pemakaian bahan sesuai resep untuk mengurangi stok kontainer.</p>
              <div className="mt-6 space-y-4">
                {productionBatch.map((item, index) => (
                  <div key={index} className="relative rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    {productionBatch.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveProductionItem(index)} className="absolute -right-2 -top-2 h-7 w-7 rounded-full border border-slate-100 bg-white text-slate-400 hover:text-rose-500">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Pilih Pemakaian</Label>
                      <Select value={item.resepId} onValueChange={(val) => handleProductionItemChange(index, "resepId", val)}>
                        <SelectTrigger className="h-12 rounded-xl border-none bg-white shadow-sm">
                          <SelectValue placeholder="Pilih pemakaian..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-xl">
                          {listResep?.map((r: any) => (
                            <SelectItem key={r.id} value={r.id} className="rounded-lg">
                              {r.namaPelengkap}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Jumlah Pemakaian</Label>
                      <Input type="number" min={1} value={item.qty} onChange={(e) => handleProductionItemChange(index, "qty", Number(e.target.value))} className="h-12 rounded-xl border-none bg-white text-center text-lg font-black shadow-sm" />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={handleAddProductionItem} className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-[10px] font-black uppercase text-slate-400 transition-all hover:border-primary/20 hover:text-primary">
                  <Plus className="mr-2 h-4 w-4" /> Tambah Jenis Bahan
                </Button>
              </div>
              <div className="mt-6 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-center">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
                  Stok kontainer akan terpotong otomatis sesuai takaran resep.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button variant="ghost" onClick={resetWorkflow} className="rounded-2xl px-6 font-black uppercase tracking-widest text-[10px]">
                  Selesai
                </Button>
                <Button disabled={saving || productionBatch.some((i) => !i.resepId)} onClick={handleSaveProduksi} className="rounded-2xl bg-primary px-6 font-black uppercase tracking-widest text-[10px]">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Simpan & Potong Stok
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-3 px-4">
              <History className="h-5 w-5 text-primary" />
              <h3 className="text-[11px] md:text-sm font-black uppercase tracking-widest text-slate-900">Histori Closing & Keuangan Kontainer</h3>
            </div>
            <div className="grid gap-3 md:gap-4">
              {ownerHistoryList?.map((hist: any) => (
                <Card key={hist.id} className="flex items-center justify-between rounded-2xl border-none bg-white p-4 shadow-sm transition-all hover:shadow-md md:p-6">
                  <div className="flex items-center gap-4 md:gap-6">
                    <CheckCircle2 className="h-5 w-5 text-slate-400 group-hover:text-primary md:h-6 md:w-6" />
                    <div>
                      <p className="text-[12px] font-black uppercase italic leading-tight text-slate-900 md:text-sm">{hist.tanggal}</p>
                      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-slate-400 md:text-[9px]">
                        {hist.kind === "keuangan" ? "Keuangan Kontainer" : `${hist.items?.length || 0} Produk`}
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
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="hidden text-right xs:block">
                      {hist.kind === "keuangan" ? (
                        <>
                          <p className="text-[12px] font-black tabular-nums text-primary md:text-sm">Rp {Number(hist.expectedCashToSettle || 0).toLocaleString("id-ID")}</p>
                          <span className="text-[7px] font-black uppercase text-slate-300 md:text-[8px]">Setoran</span>
                        </>
                      ) : (
                        <>
                          <p className="text-[12px] font-black tabular-nums text-primary md:text-sm">Rp {hist.total?.toLocaleString("id-ID")}</p>
                          <span className="text-[7px] font-black uppercase text-slate-300 md:text-[8px]">Total</span>
                          {isOwnerView && hist.keuntunganTotal != null && (
                            <p className="mt-1 text-[10px] font-black text-emerald-600 tabular-nums">Untung Rp {Number(hist.keuntunganTotal).toLocaleString("id-ID")}</p>
                          )}
                        </>
                      )}
                    </div>
                    {isOwnerView && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => hist.kind === "keuangan" ? handleDeleteKeuanganHistory(hist.id) : handleDeleteHistory(hist.id)}
                        className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-600 md:h-10 md:w-10"
                        title={hist.kind === "keuangan" ? "Hapus histori keuangan kontainer" : "Hapus histori closing"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {(!ownerHistoryList || ownerHistoryList.length === 0) && (
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
