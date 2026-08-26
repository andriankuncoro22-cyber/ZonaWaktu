"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  Plus, 
  Database, 
  Search, 
  Edit2, 
  Trash2, 
  FileUp, 
  FileDown, 
  FileSpreadsheet,
  Save,
  Trash,
  Download,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc, collection, doc } from "@/firebase";
import { addDoc, updateDoc, deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BahanBaku {
  id: string;
  code: string;
  nama: string;
  metodePembelian?: string;
  qtyBesar: number;
  satuanBesar: string;
  qtyKecil: number;
  satuanKecil: string;
  qtyMin?: number;
  qtyMinGudang?: number;
  qtyMinKontainer?: number;
  satuanKalibrasi?: "Gram" | "Pcs";
  gramPerBesar?: number;
  beratBungkusProduk?: number;
  totalGramasiPerProduk?: number;
  kalibrasiNote?: string;
}

export default function MasterBahanBakuPage() {
  const db = useFirestore();
  
  const materialsQuery = useMemoFirebase(() => collection(db, "bahan-baku"), [db]);
  const { data: materials, loading } = useCollection(materialsQuery);
  
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState<BahanBaku | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [satuanKalibrasiInput, setSatuanKalibrasiInput] = useState<"Gram" | "Pcs">("Gram");
  const [totalGramasiInput, setTotalGramasiInput] = useState(0);
  const [beratBungkusInput, setBeratBungkusInput] = useState(0);
  const [gramPerBesarInput, setGramPerBesarInput] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMaterials = (materials as BahanBaku[])
    ?.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    ?.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: 'base' }));

  const formatNumber = (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const parseExcelNumber = (val: any, defaultVal = 0) => {
    if (val === undefined || val === null || val === "") return defaultVal;
    if (typeof val === "number") return isNaN(val) ? defaultVal : val;
    const str = String(val).trim().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? defaultVal : num;
  };

  const getGramasiPerProduk = (item?: Partial<BahanBaku> | null) => {
    const gramPerBesar = Number(item?.gramPerBesar || 0);
    const beratBungkus = Number(item?.beratBungkusProduk || 0);
    return gramPerBesar + beratBungkus;
  };

  const getGramPerBesarFromTotal = (totalGrams: number, beratBungkus: number) => {
    return Math.max(0, totalGrams - beratBungkus);
  };

  const getUnitSuffix = (item?: Partial<BahanBaku> | null) => {
    return item?.satuanKalibrasi === "Pcs" ? "pcs" : "g";
  };

  useEffect(() => {
    queueMicrotask(() => {
      if (editingItem) {
        setSatuanKalibrasiInput(editingItem.satuanKalibrasi === "Pcs" ? "Pcs" : "Gram");
        setTotalGramasiInput(getGramasiPerProduk(editingItem));
        setBeratBungkusInput(Number(editingItem.beratBungkusProduk || 0));
        setGramPerBesarInput(Number(editingItem.gramPerBesar || 0));
      } else {
        setSatuanKalibrasiInput("Gram");
        setTotalGramasiInput(0);
        setBeratBungkusInput(0);
        setGramPerBesarInput(0);
      }
    });
  }, [editingItem]);

  const toTitleCase = (str: string) => {
    if (!str) return "-";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        "Code": "BB-067",
        "Nama Barang": "CREAMYFOAM",
        "Qty Besar": 0,
        "Satuan Besar": "cup",
        "Satuan Kalibrasi": "Pcs",
        "Nilai per Satuan Besar": 20,
        "Bungkus / Packaging": 0,
        "Total / Prod": 20,
        "Qty Kecil": 20,
        "Satuan Kecil": "cup",
        "Min Stok Gudang": 0,
        "Min Stok Kontainer": 5,
        "Metode Pembelian": "2. Beli Sendiri"
      },
      {
        "Code": "BB001",
        "Nama Barang": "Base Kopi",
        "Qty Besar": 0,
        "Satuan Besar": "Pack",
        "Satuan Kalibrasi": "Gram",
        "Nilai per Satuan Besar": 250,
        "Bungkus / Packaging": 10,
        "Total / Prod": 260,
        "Qty Kecil": 250,
        "Satuan Kecil": "gr",
        "Min Stok Gudang": 6,
        "Min Stok Kontainer": 3,
        "Metode Pembelian": "1. Supliyer"
      },
      {
        "Code": "BB004",
        "Nama Barang": "Gula Cair",
        "Qty Besar": 0,
        "Satuan Besar": "liter",
        "Satuan Kalibrasi": "Gram",
        "Nilai per Satuan Besar": 1000,
        "Bungkus / Packaging": 46,
        "Total / Prod": 1046,
        "Qty Kecil": 1000,
        "Satuan Kecil": "ml",
        "Min Stok Gudang": 2,
        "Min Stok Kontainer": 1,
        "Metode Pembelian": "1. Supliyer"
      },
      {
        "Code": "BB005",
        "Nama Barang": "Gula Aren",
        "Qty Besar": 0,
        "Satuan Besar": "liter",
        "Satuan Kalibrasi": "Gram",
        "Nilai per Satuan Besar": 1000,
        "Bungkus / Packaging": 23,
        "Total / Prod": 1023,
        "Qty Kecil": 1000,
        "Satuan Kecil": "ml",
        "Min Stok Gudang": 1,
        "Min Stok Kontainer": 0.5,
        "Metode Pembelian": "1. Supliyer"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Bahan Baku");
    XLSX.writeFile(wb, "template-master-bahan-baku.xlsx");
  };

  const handleExportExcel = () => {
    const exportData = (filteredMaterials || []).map((item) => ({
      Code: item.code || "-",
      "Nama Barang": item.nama || "-",
      "Qty Besar": formatNumber(item.qtyBesar),
      "Satuan Besar": item.satuanBesar || "-",
      "Satuan Kalibrasi": item.satuanKalibrasi || "Gram",
      "Nilai per Satuan Besar": formatNumber(item.gramPerBesar || 0),
      "Bungkus / Packaging": formatNumber(item.beratBungkusProduk || 0),
      "Total / Prod": formatNumber(item.totalGramasiPerProduk ?? getGramasiPerProduk(item)),
      "Qty Kecil": formatNumber(item.qtyKecil),
      "Satuan Kecil": item.satuanKecil || "-",
      "Min Stok Gudang": formatNumber(item.qtyMinGudang ?? item.qtyMin ?? 5),
      "Min Stok Kontainer": formatNumber(item.qtyMinKontainer ?? item.qtyMin ?? 5),
      "Metode Pembelian": item.metodePembelian === "Beli Sendiri" ? "2. Beli Sendiri" : "1. Supliyer",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Bahan Baku");
    XLSX.writeFile(wb, "master-bahan-baku-zonawaktu.xlsx");
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF();
    
    // Header / Kop
    if (settings?.logoHeader) {
      try {
        const response = await fetch(settings.logoHeader);
        const blob = await response.blob();
        const logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        docPDF.addImage(logoBase64 as string, 'PNG', 15, 10, 35, 12);
      } catch (e) {
        console.error("Failed to load logo for PDF", e);
      }
    }

    docPDF.setFontSize(18);
    docPDF.setTextColor(139, 26, 26);
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 105, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 105, 21, { align: 'center' });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 195, 28);
    
    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text("DAFTAR MASTER BAHAN BAKU", 105, 40, { align: 'center' });
    
    const tableData = (filteredMaterials || []).map(item => [
      item.code || "-",
      toTitleCase(item.nama),
      formatNumber(item.gramPerBesar || 0).toLocaleString('id-ID') + getUnitSuffix(item),
      formatNumber(item.qtyKecil).toLocaleString('id-ID'),
      item.satuanKecil || "-",
      item.metodePembelian === "Beli Sendiri" ? "2. Beli Sendiri" : "1. Supliyer",
    ]);

    autoTable(docPDF, {
      head: [["Code", "Nama Barang", "Qty Besar", "Satuan", "Gram/Pcs Sat.B", "Konversi Kecil", "Sat. Kecil", "Metode Pembelian"]],
      body: tableData,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [139, 26, 26], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        2: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    docPDF.save("master-bahan-baku-zonawaktu.pdf");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          toast({
            title: "Import Gagal",
            description: "File Excel kosong atau tidak memiliki data yang valid.",
            variant: "destructive"
          });
          setIsImporting(false);
          return;
        }

        const colRef = collection(db, "bahan-baku");
        const existingSnap = await getDocs(colRef);
        const existingMap = new Map<string, string>(); // code.toLowerCase() -> docId
        existingSnap.forEach((d) => {
          const c = d.data().code;
          if (c) existingMap.set(String(c).trim().toLowerCase(), d.id);
        });

        const batch = writeBatch(db);
        let count = 0;

        data.forEach((row: any) => {
          const codeValue = row["Code"] || row["code"] || row["Kode"] || row["KODE"] || "";
          const namaValue = row["Nama Barang"] || row["Nama barang"] || row["nama"] || row["Nama"] || row["BARANG"] || "";
          if (!codeValue && !namaValue) return;

          const rawMetode = String(row["Metode Pembelian"] || row["metodePembelian"] || row["Metode"] || "").trim().toLowerCase();
          const rawKalibrasi = String(row["Satuan Kalibrasi"] || row["satuanKalibrasi"] || row["Kalibrasi"] || "").trim().toLowerCase();

          const qtyBesar = parseExcelNumber(row["Qty Besar"] ?? row["Qty besar"] ?? row["qtyBesar"], 0);
          const satuanBesar = String(row["Satuan Besar"] || row["Satuan besar"] || row["satuanBesar"] || "").trim();
          const satuanKalibrasi: "Gram" | "Pcs" = rawKalibrasi.includes("pcs") ? "Pcs" : "Gram";

          let gramPerBesar = parseExcelNumber(
            row["Nilai per Satuan Besar"] ?? 
            row["Nilai Per Satuan Besar"] ?? 
            row["Nilai per Satuan"] ?? 
            row["Gram per Satuan Besar"] ?? 
            row["gramPerBesar"] ?? 
            row["Gram/Sat.B"],
            0
          );

          const beratBungkusProduk = parseExcelNumber(
            row["Bungkus / Packaging"] ?? 
            row["Bungkus/Packaging"] ?? 
            row["Bungkus"] ?? 
            row["Packaging"] ?? 
            row["beratBungkusProduk"],
            0
          );

          let totalGramasiPerProduk = parseExcelNumber(
            row["Total / Prod"] ?? 
            row["Total/Prod"] ?? 
            row["Total Prod"] ?? 
            row["totalGramasiPerProduk"],
            0
          );

          if (totalGramasiPerProduk === 0 && gramPerBesar > 0) {
            totalGramasiPerProduk = gramPerBesar + beratBungkusProduk;
          } else if (gramPerBesar === 0 && totalGramasiPerProduk > 0) {
            gramPerBesar = Math.max(0, totalGramasiPerProduk - beratBungkusProduk);
          }

          const qtyKecil = parseExcelNumber(
            row["Qty Kecil"] ?? 
            row["Qty kecil"] ?? 
            row["qtyKecil"] ?? 
            row["Konversi"] ?? 
            row["Isi Per Sat. Besar"],
            1
          );
          const satuanKecil = String(row["Satuan Kecil"] || row["Satuan kecil"] || row["satuanKecil"] || "").trim();

          const qtyMinGudang = parseExcelNumber(
            row["Min Stok Gudang"] ?? 
            row["Min Stok gudang"] ?? 
            row["Min Stok Gudang\n"] ?? 
            row["qtyMinGudang"] ?? 
            row["Min Stok"] ?? 
            row["Batas Minimum Stok Gudang"],
            0
          );

          const qtyMinKontainer = parseExcelNumber(
            row["Min Stok Kontainer"] ?? 
            row["Min Stok kontainer"] ?? 
            row["Min Stok Kontaine\nr"] ?? 
            row["qtyMinKontainer"] ?? 
            row["Batas Minimum Stok Kontainer"],
            0
          );

          const metodePembelian = (rawMetode.includes("beli sendiri") || rawMetode.includes("2.")) 
            ? "Beli Sendiri" 
            : "Supliyer";

          const cleanCode = String(codeValue).trim();
          const existingDocId = existingMap.get(cleanCode.toLowerCase());
          const targetDocRef = existingDocId ? doc(colRef, existingDocId) : doc(colRef);

          const payload: any = {
            code: cleanCode,
            nama: String(namaValue).trim(),
            metodePembelian,
            qtyBesar,
            satuanBesar,
            satuanKalibrasi,
            gramPerBesar,
            beratBungkusProduk,
            totalGramasiPerProduk,
            qtyKecil,
            satuanKecil,
            qtyMinGudang,
            qtyMinKontainer,
            qtyMin: qtyMinGudang,
          };

          batch.set(targetDocRef, payload, { merge: true });
          count++;
        });

        await batch.commit();
        toast({
          title: "Import Berhasil",
          description: `Berhasil mengimpor dan memperbarui ${count} data bahan baku.`,
        });
      } catch (err: any) {
        console.error("Error importing excel:", err);
        toast({
          title: "Import Gagal",
          description: err?.message || "Terjadi kesalahan saat memproses file Excel.",
          variant: "destructive"
        });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: string) => {
    if (confirm("Hapus bahan baku ini?")) {
      deleteDoc(doc(db, "bahan-baku", id));
    }
  };



  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const qtyKecil = formatNumber(formData.get("qtyKecil") || 1);
    const gramPerBesar = getGramPerBesarFromTotal(totalGramasiInput, beratBungkusInput);
    const beratBungkusProduk = beratBungkusInput;
    const totalGramasiPerProduk = totalGramasiInput;

    const data: any = {
      code: String(formData.get("code") || "").trim(),
      nama: String(formData.get("nama") || "").trim(),
      metodePembelian: String(formData.get("metodePembelian") || "Supliyer").trim(),
      satuanBesar: String(formData.get("satuanBesar") || "").trim(),
      qtyMin: formatNumber(formData.get("qtyMin") || 5),
      qtyMinGudang: formatNumber(formData.get("qtyMinGudang") || formData.get("qtyMin") || 5),
      qtyMinKontainer: formatNumber(formData.get("qtyMinKontainer") || formData.get("qtyMin") || 5),
      qtyKecil,
      satuanKecil: String(formData.get("satuanKecil") || "").trim(),
      satuanKalibrasi: satuanKalibrasiInput,
      gramPerBesar,
      beratBungkusProduk,
      totalGramasiPerProduk,
      kalibrasiNote: String(formData.get("kalibrasiNote") || "").trim(),
    };

    if (editingItem) {
      // Tidak merubah qtyBesar / stok gudang saat mengedit master bahan baku
      await updateDoc(doc(db, "bahan-baku", editingItem.id), data);
    } else {
      data.qtyBesar = 0;
      data.qtyGudangKecil = 0;
      data.qtyKontainerBesar = 0;
      data.qtyKontainerKecil = 0;
      await addDoc(collection(db, "bahan-baku"), data);
    }
    
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">Master Bahan Baku</h1>
          <p className="text-[11px] text-slate-600 font-bold uppercase tracking-[0.2em]">
            Database Logistik & Inventori • Zona Waktu
          </p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <Button 
              variant="ghost"
              onClick={handleDownloadTemplate}
              className="rounded-xl px-3 font-bold h-10 text-[10px] uppercase tracking-wider gap-1.5 text-slate-700 hover:bg-slate-50"
              title="Unduh Format Template Excel"
            >
              <Download className="h-4 w-4 text-blue-600" />
              Template
            </Button>
            <div className="w-[1px] h-6 bg-slate-100" />
            <Button 
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="rounded-xl px-4 font-bold h-10 text-[10px] uppercase tracking-wider gap-2 text-slate-700 hover:bg-slate-50"
            >
              {isImporting ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <FileUp className="h-4 w-4 text-primary" />}
              {isImporting ? "Mengimpor..." : "Import Excel"}
            </Button>
            <div className="w-[1px] h-6 bg-slate-100" />
            <Button 
              variant="ghost"
              onClick={handleExportExcel}
              className="rounded-xl px-4 font-bold h-10 text-[10px] uppercase tracking-wider gap-2 text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              XLSX
            </Button>
            <div className="w-[1px] h-6 bg-slate-100" />
            <Button 
              variant="ghost"
              onClick={handleExportPDF}
              className="rounded-xl px-4 font-bold h-10 text-[10px] uppercase tracking-wider gap-2 text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4 text-primary" />
              PDF
            </Button>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingItem(null);
          }}>
            <DialogTrigger asChild>
              <Button className="rounded-2xl bg-primary hover:bg-primary/90 px-8 font-black shadow-xl shadow-primary/20 h-12 uppercase tracking-widest text-[10px] gap-2 border-none">
                <Plus className="h-4 w-4" />
                Bahan Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto rounded-[1.25rem] border-none p-4 shadow-2xl sm:rounded-[2rem] sm:p-6 md:p-8 lg:p-10">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase italic tracking-tighter text-slate-900 sm:text-2xl">
                  {editingItem ? "Edit Bahan Baku" : "Tambah Bahan Baku"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Code Bahan</Label>
                  <Input name="code" defaultValue={editingItem?.code} placeholder="BB-001" className="rounded-xl border-slate-200 h-11" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nama Barang</Label>
                  <Input name="nama" defaultValue={editingItem?.nama} placeholder="Contoh: Kopi Arabika" className="rounded-xl border-slate-200 h-11" required />
                </div>
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Metode Pembelian</Label>
                  <select
                    name="metodePembelian"
                    defaultValue={editingItem?.metodePembelian || "Supliyer"}
                    className="w-full rounded-xl border border-slate-200 bg-white h-11 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="Supliyer">1. Supliyer</option>
                    <option value="Beli Sendiri">2. Beli Sendiri</option>
                  </select>
                </div>
                
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4 sm:p-6">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-primary">Konfigurasi Besar</h4>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Satuan Besar</Label>
                      <Input name="satuanBesar" defaultValue={editingItem?.satuanBesar} placeholder="Sak / Dus" className="rounded-xl bg-white border-slate-200" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Batas Minimum Stok Gudang</Label>
                      <Input name="qtyMinGudang" type="number" step="any" defaultValue={editingItem?.qtyMinGudang ?? editingItem?.qtyMin ?? 5} className="rounded-xl bg-white border-slate-200" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Batas Minimum Stok Kontainer</Label>
                      <Input name="qtyMinKontainer" type="number" step="any" defaultValue={editingItem?.qtyMinKontainer ?? editingItem?.qtyMin ?? 5} className="rounded-xl bg-white border-slate-200" />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4 sm:p-6">
                   <h4 className="text-[9px] font-black uppercase tracking-widest text-primary">Konfigurasi Kecil</h4>
                   <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Isi Per Sat. Besar</Label>
                      <Input name="qtyKecil" type="number" step="any" defaultValue={editingItem?.qtyKecil} className="rounded-xl bg-white border-slate-200" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Satuan Kecil</Label>
                      <Input name="satuanKecil" defaultValue={editingItem?.satuanKecil} placeholder="Pack / Pcs / Kg" className="rounded-xl bg-white border-slate-200" required />
                    </div>
                  </div>
                </div>

                <div className="col-span-1 rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4 sm:p-6 md:col-span-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-primary">Kalibrasi Gramasi / Pcs (Acuan)</h4>
                    <div className="flex items-center gap-2">
                      <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Pilih Satuan:</Label>
                      <select
                        name="satuanKalibrasi"
                        value={satuanKalibrasiInput}
                        onChange={(e) => setSatuanKalibrasiInput(e.target.value as "Gram" | "Pcs")}
                        className="rounded-xl border border-slate-200 bg-white h-9 px-3 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="Gram">Gram (g)</option>
                        <option value="Pcs">Pcs (pcs)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {satuanKalibrasiInput === "Pcs" ? "Total Pcs per Produk (pcs)" : "Total Gramasi per Produk (g)"}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        value={totalGramasiInput}
                        onChange={(e) => setTotalGramasiInput(formatNumber(e.target.value))}
                        className="rounded-xl bg-white border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {satuanKalibrasiInput === "Pcs" ? "Isi/Bungkus per Produk (pcs)" : "Berat Bungkus Produk (g)"}
                      </Label>
                      <Input
                        name="beratBungkusProduk"
                        type="number"
                        step="any"
                        value={beratBungkusInput}
                        onChange={(e) => setBeratBungkusInput(formatNumber(e.target.value))}
                        className="rounded-xl bg-white border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {satuanKalibrasiInput === "Pcs" ? "Pcs per Satuan Besar" : "Gram per Satuan Besar"}
                      </Label>
                      <Input
                        name="gramPerBesar"
                        type="number"
                        step="any"
                        readOnly
                        value={getGramPerBesarFromTotal(totalGramasiInput, beratBungkusInput)}
                        className="rounded-xl bg-white border-slate-200 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Catatan Kalibrasi</Label>
                      <Input name="kalibrasiNote" defaultValue={editingItem?.kalibrasiNote || ""} placeholder={satuanKalibrasiInput === "Pcs" ? "Opsional: mis. 1 pack = 10 pcs" : "Opsional: mis. 1 pack = 250 g"} className="rounded-xl bg-white border-slate-200" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    {satuanKalibrasiInput === "Pcs" 
                      ? "Saat stock opname dihitung, sistem akan otomatis mengurangi isi/bungkus dari total pcs sebelum menghitung qty aktif."
                      : "Saat stock opname ditimbang, sistem akan otomatis mengurangi berat bungkus dari total gram sebelum menghitung qty aktif."}
                  </p>
                </div>

                <div className="col-span-1 mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end md:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Batal</Button>
                  <Button type="submit" className="h-11 rounded-xl bg-primary px-8 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                    <Save className="h-4 w-4 mr-2" />
                    Simpan Data
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem] bg-white overflow-hidden">
        <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Cari kode atau nama bahan..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none placeholder:text-slate-500 text-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-100 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Database:</span>
            <span className="text-xs font-black text-slate-900">{filteredMaterials?.length || 0} Item</span>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-y border-slate-100">
                <th className="pl-4 pr-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500">Code</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-left">Nama Bahan</th>
                
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Gram/Besar</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Bungkus</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Total/Prod</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Min Gudang</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Min Kontainer</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Konversi</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-left">Sat. Kecil</th>
                <th className="px-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-center">Metode Beli</th>
                <th className="pr-4 pl-2 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredMaterials?.length > 0 ? (
                filteredMaterials.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="pl-4 pr-2 py-3">
                      <span className="text-[9px] font-bold text-primary/80 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 tracking-tighter uppercase tabular-nums">
                        {item.code || "-"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-left">
                      <span className="text-xs font-semibold text-slate-900 block truncate max-w-[150px]" title={item.nama}>
                        {toTitleCase(item.nama)}
                      </span>
                    </td>
                    
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.gramPerBesar || 0).toLocaleString('id-ID')}{getUnitSuffix(item)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.beratBungkusProduk || 0).toLocaleString('id-ID')}{getUnitSuffix(item)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.totalGramasiPerProduk ?? getGramasiPerProduk(item)).toLocaleString('id-ID')}{getUnitSuffix(item)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.qtyMinGudang ?? item.qtyMin ?? 5).toLocaleString('id-ID')}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.qtyMinKontainer ?? item.qtyMin ?? 5).toLocaleString('id-ID')}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-slate-800 tabular-nums text-xs">
                      {formatNumber(item.qtyKecil).toLocaleString('id-ID')}
                    </td>
                    <td className="px-2 py-3 text-left">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">{item.satuanKecil}</span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-tight whitespace-nowrap",
                        item.metodePembelian === "Beli Sendiri" 
                          ? "bg-amber-50 text-amber-700 border border-amber-200" 
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      )}>
                        {item.metodePembelian === "Beli Sendiri" ? "2. Beli Sendiri" : "1. Supliyer"}
                      </span>
                    </td>
                    <td className="pr-4 pl-2 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-primary transition-all"
                          onClick={() => {
                            setEditingItem(item);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-rose-600 transition-all"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-8 py-32 text-center">
                    <div className="max-w-xs mx-auto flex flex-col items-center">
                      <div className="h-16 w-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 shadow-sm">
                        <Database className="h-7 w-7 text-slate-300" />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 uppercase italic">Database Kosong</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 leading-relaxed tracking-wider">
                        Mulai dengan mengimpor file Excel atau tambah bahan baku secara manual.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>        {/* Mobile Card View */}
        <div className="block md:hidden p-3 bg-slate-50/20">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center gap-4">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Data...</p>
            </div>
          ) : filteredMaterials?.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {filteredMaterials.map((item) => (
                <Card key={item.id} className="relative rounded-2xl bg-white border border-slate-100 p-3.5 flex flex-col justify-between space-y-3 shadow-sm overflow-hidden min-h-[160px]">
                  {/* Actions absolute top-2 right-2 */}
                  <div className="absolute top-2 right-2 flex items-center gap-0.5">
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setIsDialogOpen(true);
                      }}
                      className="h-6 w-6 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="h-6 w-6 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="space-y-1 pr-11">
                    <span className="text-[8px] font-black uppercase text-primary/70 tracking-wider block">
                      {item.code || "-"}
                    </span>
                    <h4 className="text-[10px] sm:text-[11px] font-black text-slate-900 uppercase italic line-clamp-2 leading-tight">
                      {item.nama}
                    </h4>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100/60 text-[9px] sm:text-[10px]">
                    
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Konversi</span>
                      <span className="font-black text-slate-800">
                        {formatNumber(item.qtyKecil).toLocaleString('id-ID')} <span className="text-[7px] font-bold text-slate-400 uppercase">{item.satuanKecil}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Min Gudang</span>
                      <span className="font-black text-slate-700">{formatNumber(item.qtyMinGudang ?? item.qtyMin ?? 5)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Min Kontainer</span>
                      <span className="font-black text-slate-700">{formatNumber(item.qtyMinKontainer ?? item.qtyMin ?? 5)}</span>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-slate-100/60 flex flex-col gap-1">
                    <span className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Metode Beli</span>
                    <span className={cn(
                      "inline-flex items-center justify-center px-2 py-0.5 rounded text-[8px] font-bold tracking-tight w-full text-center border",
                      item.metodePembelian === "Beli Sendiri" 
                        ? "bg-amber-50 text-amber-700 border-amber-200" 
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                      {item.metodePembelian === "Beli Sendiri" ? "Beli Sendiri" : "Supliyer"}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <div className="max-w-xs mx-auto flex flex-col items-center">
                <div className="h-16 w-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 shadow-sm">
                  <Database className="h-7 w-7 text-slate-300" />
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase italic">Database Kosong</h3>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
