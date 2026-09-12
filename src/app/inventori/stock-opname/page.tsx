"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  FileDown, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Archive, 
  Layers, 
  BarChart3, 
  Upload, 
  Building2, 
  Store, 
  Save, 
  Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  useDoc, 
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
import { getStoreConfigDocId, filterContainerMaterials } from "@/lib/branch-helper";
import { query, orderBy, writeBatch, serverTimestamp, addDoc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
  qtyBesar?: number;
  qtyGudangKecil?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  qtyKecil?: number;
  gramPerBesar?: number | string;
  beratBungkusProduk?: number | string;
  totalGramasiPerProduk?: number | string;
  satuanKalibrasi?: string;
  metodePembelian?: string;
  [key: string]: unknown;
}

export default function StockOpnamePage() {
  const db = useFirestore();
  const { toast } = useToast();
  const activeBranch = useActiveBranch();

  const [activeTab, setActiveTab] = useState<"gudang" | "kontainer" | "akhir">("gudang");
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseId>(() => getWarehouseForBranch(activeBranch));
  const [selectedBranch, setSelectedBranch] = useState<BranchId>(activeBranch);
  const [searchTerm, setSearchTerm] = useState("");
  const [processing, setProcessing] = useState(false);

  // Sync default warehouse & branch when activeBranch changes
  useEffect(() => {
    queueMicrotask(() => {
      setSelectedWarehouse(getWarehouseForBranch(activeBranch));
      setSelectedBranch(activeBranch);
    });
  }, [activeBranch]);

  // Settings for logo / store info in PDF
  const settingsRef = useMemoFirebase(() => doc(db, "settings", getStoreConfigDocId()), [db]);
  const { data: settings } = useDoc(settingsRef);

  // Fetch Materials Scoped dynamically
  // 1. Gudang Materials
  const warehouseQuery = useMemoFirebase(
    () => query(warehouseCollection(db, "bahan-baku", selectedWarehouse), orderBy("code", "asc")),
    [db, selectedWarehouse]
  );
  const { data: rawWarehouseMats, loading: loadingWarehouse } = useCollection(warehouseQuery);

  // 2. Kontainer Materials
  const containerQuery = useMemoFirebase(
    () => query(branchCollection(db, "bahan-baku", selectedBranch), orderBy("code", "asc")),
    [db, selectedBranch]
  );
  const { data: rawContainerMats, loading: loadingContainer } = useCollection(containerQuery);

  const materials = useMemo(() => {
    if (activeTab === "gudang") {
      const list = (rawWarehouseMats as BahanBaku[]) || [];
      return list.filter(m => m.metodePembelian !== "Pembuatan Sendiri");
    }
    const containerList = (rawContainerMats as BahanBaku[]) || [];
    return filterContainerMaterials(containerList, selectedBranch);
  }, [activeTab, rawWarehouseMats, rawContainerMats, selectedBranch]);

  const loading = activeTab === "gudang" ? loadingWarehouse : loadingContainer;

  const filteredMaterials = useMemo(() => {
    return materials.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [materials, searchTerm]);

  const cleanNumber = (val: unknown): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const getUnitWeight = (item: BahanBaku) => {
    const gramPerBesar = cleanNumber(item?.gramPerBesar);
    const konversi = cleanNumber(item?.qtyKecil) || 1;
    const res = konversi > 0 ? gramPerBesar / konversi : 0;
    return isNaN(res) ? 0 : res;
  };

  const getAktifFromGrams = (item: BahanBaku, gramsValue: unknown) => {
    const beratBungkus = cleanNumber(item?.beratBungkusProduk);
    const netGrams = Math.max(0, cleanNumber(gramsValue) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    const res = unitWeight > 0 ? netGrams / unitWeight : 0;
    return isNaN(res) ? 0 : res;
  };

  // Local state for Gudang inputs
  const [warehouseInputs, setWarehouseInputs] = useState<Record<string, { besar: number | string; kecil: number | string }>>({});

  // Local state for Kontainer inputs
  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number | string; grams: number | string }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number | string>>({});

  // Initialize inputs when active list loads
  useEffect(() => {
    if (!materials || materials.length === 0) return;
    const nextGudang: Record<string, { besar: number | string; kecil: number | string }> = {};
    const nextKontainer: Record<string, { aktif: number | string; grams: number | string }> = {};
    const nextBulk: Record<string, number | string> = {};

    materials.forEach((it) => {
      nextGudang[it.id] = { besar: it.qtyBesar ?? 0, kecil: it.qtyGudangKecil ?? 0 };
      nextKontainer[it.id] = { aktif: it.qtyKontainerKecil ?? 0, grams: "" };
      nextBulk[it.id] = it.qtyKontainerBesar ?? 0;
    });

    queueMicrotask(() => {
      setWarehouseInputs(nextGudang);
      setKontainerInputs(nextKontainer);
      setBulkInputs(nextBulk);
    });
  }, [materials, activeTab, selectedWarehouse, selectedBranch]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Excel Import Handler
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const excelData = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        if (!excelData || excelData.length === 0) {
          toast({ variant: "destructive", title: "Excel Kosong", description: "Berkas Excel tidak memiliki data." });
          return;
        }

        const newBulk = { ...bulkInputs };
        const newKontainer = { ...kontainerInputs };
        const newGudang = { ...warehouseInputs };

        let matchedCount = 0;
        const cleanStr = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

        excelData.forEach((row) => {
          const codeVal = row["KODE"] || row["Kode"] || row["code"] || row["KODE BAHAN"];
          const nameVal = row["NAMA"] || row["Nama"] || row["nama"] || row["NAMA BAHAN"];

          const mat = materials.find(m => 
            (codeVal && cleanStr(m.code) === cleanStr(codeVal)) || 
            (nameVal && cleanStr(m.nama) === cleanStr(nameVal))
          );

          if (!mat) return;

          if (activeTab === "gudang") {
            const besarRaw = row["STOK GUDANG (BESAR)"] || row["GUDANG (B)"] || row["Gudang"] || row["Besar"];
            const kecilRaw = row["STOK KECIL GUDANG"] || row["GUDANG (K)"] || row["Sisa Gudang"] || row["Kecil"];
            if (besarRaw !== undefined || kecilRaw !== undefined) {
              newGudang[mat.id] = {
                besar: besarRaw !== undefined ? cleanNumber(besarRaw) : (newGudang[mat.id]?.besar ?? 0),
                kecil: kecilRaw !== undefined ? cleanNumber(kecilRaw) : (newGudang[mat.id]?.kecil ?? 0)
              };
              matchedCount++;
            }
          } else {
            const bulkRaw = row["BULK KONTAINER"] || row["Bulk"] || row["KONT. BULK"];
            const aktifRaw = row["AKTIF KONTAINER"] || row["Aktif"] || row["KONT. AKTIF"];
            if (bulkRaw !== undefined) {
              newBulk[mat.id] = cleanNumber(bulkRaw);
            }
            if (aktifRaw !== undefined) {
              newKontainer[mat.id] = {
                aktif: cleanNumber(aktifRaw),
                grams: cleanNumber(aktifRaw)
              };
            }
            if (bulkRaw !== undefined || aktifRaw !== undefined) matchedCount++;
          }
        });

        if (activeTab === "gudang") setWarehouseInputs(newGudang);
        else {
          setBulkInputs(newBulk);
          setKontainerInputs(newKontainer);
        }

        toast({
          title: "Impor Berhasil",
          description: `Berhasil mengisi data opname ${matchedCount} bahan baku dari Excel.`
        });
      } catch (err) {
        console.error("Error reading opname excel:", err);
        toast({ variant: "destructive", title: "Gagal Impor", description: "Format berkas Excel tidak dikenali." });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatTotalStock = (item: BahanBaku) => {
    const qtyGudang = Number(item.qtyBesar || 0);
    const qtyBulk = Number(item.qtyKontainerBesar || 0);
    const qtyAktif = Number(item.qtyKontainerKecil || 0);
    const konversi = Number(item.qtyKecil || 1);

    const totalKecil = ((qtyGudang + qtyBulk) * konversi) + qtyAktif;
    const hasilBesar = Math.floor(totalKecil / konversi);
    const hasilKecil = Math.round(totalKecil % konversi);

    if (hasilKecil === 0) return `${hasilBesar} ${item.satuanBesar}`;
    if (hasilBesar === 0) return `${hasilKecil} ${item.satuanKecil}`;
    return `${hasilBesar} ${item.satuanBesar} ${hasilKecil} ${item.satuanKecil}`;
  };

  const handleExportExcel = () => {
    const wsData = filteredMaterials.map(item => ({
      "Kode": item.code,
      "Nama Bahan": item.nama,
      "Stok Gudang (Sistem)": item.qtyBesar || 0,
      "Sisa Gudang (Sistem)": item.qtyGudangKecil || 0,
      "Satuan Besar": item.satuanBesar,
      "Bulk Kontainer (Sistem)": item.qtyKontainerBesar || 0,
      "Aktif Kontainer (Sistem)": item.qtyKontainerKecil || 0,
      "Satuan Kecil": item.satuanKecil,
      "Total Gabungan": formatTotalStock(item)
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    const locTitle = activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].shortName : BRANCH_LIST[selectedBranch].shortName;
    XLSX.utils.book_append_sheet(wb, ws, "Stock Opname");
    XLSX.writeFile(wb, `Stock_Opname_${locTitle}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF('l', 'mm', 'a4');
    const locTitle = activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[selectedBranch].name;

    docPDF.setFontSize(18);
    docPDF.setTextColor(15, 23, 42);
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 148, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(`LAPORAN STOCK OPNAME • ${locTitle.toUpperCase()}`, 148, 22, { align: 'center' });
    docPDF.setDrawColor(200);
    docPDF.line(15, 28, 282, 28);
    
    const tableData = filteredMaterials.map(item => [
      item.code || "-",
      item.nama?.toUpperCase() || "-",
      `${item.qtyBesar || 0} ${item.satuanBesar || ""}`,
      `${item.qtyGudangKecil || 0} ${item.satuanKecil || ""}`,
      `${item.qtyKontainerBesar || 0} ${item.satuanBesar || ""}`,
      `${Math.round(Number(item.qtyKontainerKecil || 0))} ${item.satuanKecil || ""}`,
      formatTotalStock(item)
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG (B)", "GUDANG (K)", "KONT. BULK", "KONT. AKTIF", "TOTAL GABUNGAN"]],
      body: tableData,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 }
    });

    docPDF.save(`Stock_Opname_${activeTab === "gudang" ? selectedWarehouse : selectedBranch}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ==========================================
  // SAVE OPNAME (GUDANG VS KONTAINER)
  // ==========================================
  const handleSaveOpname = async () => {
    if (processing) return;
    
    const isGudang = activeTab === "gudang";
    const locName = isGudang ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[selectedBranch].name;

    const confirmed = window.confirm(`Simpan dan sinkronisasikan hasil fisik Stock Opname untuk ${locName}?`);
    if (!confirmed) return;

    setProcessing(true);
    try {
      const batch = writeBatch(db);
      const historyItems: Array<Record<string, unknown>> = [];

      filteredMaterials.forEach((it) => {
        if (isGudang) {
          const beforeBesar = Number(it.qtyBesar ?? 0);
          const beforeKecil = Number(it.qtyGudangKecil ?? 0);
          const inputBesar = warehouseInputs[it.id]?.besar;
          const inputKecil = warehouseInputs[it.id]?.kecil;

          const afterBesar = Math.max(0, cleanNumber(inputBesar === "" || inputBesar === undefined ? beforeBesar : inputBesar));
          const afterKecil = Math.max(0, cleanNumber(inputKecil === "" || inputKecil === undefined ? beforeKecil : inputKecil));

          const ref = warehouseDoc(db, "bahan-baku", it.id, selectedWarehouse);
          batch.update(ref, {
            qtyBesar: afterBesar,
            qtyGudangKecil: afterKecil
          });

          historyItems.push({
            id: it.id,
            code: it.code || "-",
            nama: it.nama || "-",
            unitBesar: it.satuanBesar || "-",
            unitKecil: it.satuanKecil || "-",
            beforeQtyBesar: beforeBesar,
            afterQtyBesar: afterBesar,
            diffQtyBesar: afterBesar - beforeBesar,
            beforeQtyGudangKecil: beforeKecil,
            afterQtyGudangKecil: afterKecil,
            diffQtyGudangKecil: afterKecil - beforeKecil
          });
        } else {
          // Kontainer
          const beforeBulk = Number(it.qtyKontainerBesar ?? 0);
          const beforeAktif = Number(it.qtyKontainerKecil ?? 0);
          const inputBulk = bulkInputs[it.id];
          const inputAktif = kontainerInputs[it.id]?.aktif;

          const afterBulk = Math.max(0, cleanNumber(inputBulk === "" || inputBulk === undefined ? beforeBulk : inputBulk));
          const afterAktif = Math.max(0, cleanNumber(inputAktif === "" || inputAktif === undefined ? beforeAktif : inputAktif));

          const ref = branchDoc(db, "bahan-baku", it.id, selectedBranch);
          batch.update(ref, {
            qtyKontainerBesar: afterBulk,
            qtyKontainerKecil: afterAktif
          });

          historyItems.push({
            id: it.id,
            code: it.code || "-",
            nama: it.nama || "-",
            unitBesar: it.satuanBesar || "-",
            unitKecil: it.satuanKecil || "-",
            before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif },
            after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif },
            diffBulk: afterBulk - beforeBulk,
            diffAktif: afterAktif - beforeAktif
          });
        }
      });

      await batch.commit();

      // Log history
      if (isGudang) {
        await addDoc(warehouseCollection(db, "opnam_gudang", selectedWarehouse), {
          date: serverTimestamp(),
          warehouse: selectedWarehouse,
          warehouseName: locName,
          note: `Stock Opname Gudang Utama (${locName})`,
          items: historyItems
        });
      } else {
        await addDoc(branchCollection(db, "opnam_harian", selectedBranch), {
          date: serverTimestamp(),
          branch: selectedBranch,
          branchName: locName,
          note: `Stock Opname Kontainer (${locName})`,
          items: historyItems
        });
      }

      toast({
        title: "Opname Berhasil Disimpan",
        description: `Stok fisik ${locName} telah disinkronisasi ke sistem.`
      });
    } catch (err) {
      console.error("Gagal menyimpan opname:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: "Terjadi kesalahan sistem saat memperbarui stok."
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Stock Opname
          </h1>
          <p className="text-[10px] sm:text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
            Verifikasi Fisik & Sinkronisasi Inventori Multi-Gudang & Kontainer
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
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
            className="rounded-xl border-slate-200 px-3.5 h-9 font-black uppercase text-[10px] gap-1.5 bg-white hover:bg-slate-50 hover:text-indigo-600 shadow-xs"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600" /> 
            <span>Impor</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportExcel}
            className="rounded-xl border-slate-200 px-3.5 h-9 font-black uppercase text-[10px] gap-1.5 bg-white hover:bg-slate-50 shadow-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> 
            <span>Excel</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportPDF}
            className="rounded-xl border-slate-200 px-3.5 h-9 font-black uppercase text-[10px] gap-1.5 bg-white hover:bg-slate-50 shadow-xs"
          >
            <FileDown className="h-3.5 w-3.5 text-primary" /> 
            <span>PDF</span>
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "gudang" | "kontainer" | "akhir")} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-100/80 p-1.5 rounded-2xl">
          <TabsList className="bg-transparent h-10 p-0 gap-1">
            <TabsTrigger 
              value="gudang" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
            >
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              <span>Gudang Utama</span>
            </TabsTrigger>
            <TabsTrigger 
              value="kontainer" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
            >
              <Store className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
              <span>Area Kontainer</span>
            </TabsTrigger>
            <TabsTrigger 
              value="akhir" 
              className="rounded-xl px-4 font-black uppercase tracking-wider text-[10px] sm:text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              <span>Hasil Akhir</span>
            </TabsTrigger>
          </TabsList>

          {/* Sub Location Switcher */}
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
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSelectedBranch("gdm")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "gdm" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW GDM
              </button>
              <button
                type="button"
                onClick={() => setSelectedBranch("tehwarga")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "tehwarga" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Teh Warga GDM
              </button>
              <button
                type="button"
                onClick={() => setSelectedBranch("kedungreja")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedBranch === "kedungreja" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                ZW Kedungreja
              </button>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="my-4 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kode atau nama bahan..."
              className="pl-10 h-10 rounded-2xl bg-white border-slate-200 text-xs font-bold"
            />
          </div>
          <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            {activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[selectedBranch].name} • {filteredMaterials.length} Bahan
          </div>
        </div>

        {/* Content Card */}
        <Card className="border-slate-200/80 shadow-sm rounded-3xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            {/* ── TAB 1: GUDANG UTAMA ── */}
            <TabsContent value="gudang" className="m-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Bahan Baku</th>
                    <th className="py-3 px-4 text-right">Stok Besar (Sistem)</th>
                    <th className="py-3 px-4 text-right">Sisa Kecil (Sistem)</th>
                    <th className="py-3 px-4 text-center">Fisik Gudang (Besar)</th>
                    <th className="py-3 px-4 text-center">Fisik Sisa (Kecil)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Memuat data stok gudang...</span>
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                        Tidak ada bahan baku.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-black text-indigo-950 font-mono block">{item.code}</span>
                          <span className="font-black text-slate-900 uppercase italic">{item.nama}</span>
                          <span className="text-[10px] text-slate-500 block">1 {item.satuanBesar} = {item.qtyKecil} {item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                          {item.qtyBesar || 0} <span className="text-[10px] text-slate-500 font-normal">{item.satuanBesar}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-700">
                          {item.qtyGudangKecil || 0} <span className="text-[10px] text-slate-500 font-normal">{item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input
                              type="number"
                              value={warehouseInputs[item.id]?.besar ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWarehouseInputs(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    besar: val === "" ? "" : Number(val),
                                    kecil: prev[item.id]?.kecil ?? 0
                                  }
                                }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{item.satuanBesar}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input
                              type="number"
                              value={warehouseInputs[item.id]?.kecil ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWarehouseInputs(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    besar: prev[item.id]?.besar ?? 0,
                                    kecil: val === "" ? "" : Number(val)
                                  }
                                }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{item.satuanKecil}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TabsContent>

            {/* ── TAB 2: AREA KONTAINER ── */}
            <TabsContent value="kontainer" className="m-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Bahan Baku</th>
                    <th className="py-3 px-4 text-right">Bulk (Sistem)</th>
                    <th className="py-3 px-4 text-right">Aktif (Sistem)</th>
                    <th className="py-3 px-4 text-center">Fisik (Bulk)</th>
                    <th className="py-3 px-4 text-center">Fisik (Aktif / Gramasi)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        <span>Memuat data stok kontainer...</span>
                      </td>
                    </tr>
                  ) : filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                        Tidak ada bahan baku.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-black text-indigo-950 font-mono block">{item.code}</span>
                          <span className="font-black text-slate-900 uppercase italic">{item.nama}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-indigo-600 text-sm">
                          {item.qtyKontainerBesar || 0} <span className="text-[10px] text-slate-500 font-normal">{item.satuanBesar}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600 text-sm">
                          {Math.round(Number(item.qtyKontainerKecil || 0))} <span className="text-[10px] text-slate-500 font-normal">{item.satuanKecil}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative w-32 mx-auto">
                            <Input
                              type="number"
                              value={bulkInputs[item.id] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBulkInputs(prev => ({ ...prev, [item.id]: val === "" ? "" : Number(val) }));
                              }}
                              placeholder="0"
                              className="h-9 rounded-xl text-xs font-black text-center pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-indigo-400 uppercase">{item.satuanBesar}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative w-28">
                              <Input
                                type="number"
                                value={kontainerInputs[item.id]?.aktif ?? ""}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 0);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: { aktif: val, grams: val }
                                  }));
                                }}
                                placeholder="0"
                                className="h-9 rounded-xl text-xs font-black text-center pr-8"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-emerald-400 uppercase">{item.satuanKecil}</span>
                            </div>
                            <div className="relative w-28">
                              <Input
                                type="number"
                                value={kontainerInputs[item.id]?.grams ?? ""}
                                onChange={(e) => {
                                  const gramsVal = Number(e.target.value || 0);
                                  setKontainerInputs(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      grams: gramsVal,
                                      aktif: Math.round(getAktifFromGrams(item, gramsVal) * 100) / 100
                                    }
                                  }));
                                }}
                                placeholder={item.satuanKalibrasi === "Pcs" ? "0 pcs" : "0 g"}
                                className="h-9 rounded-xl text-xs font-black text-center pr-8"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">
                                {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TabsContent>

            {/* ── TAB 3: HASIL AKHIR ── */}
            <TabsContent value="akhir" className="m-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Bahan Baku</th>
                    <th className="py-3 px-4 text-right">Gudang Utama</th>
                    <th className="py-3 px-4 text-right">Kont. Bulk</th>
                    <th className="py-3 px-4 text-right">Kont. Aktif</th>
                    <th className="py-3 px-4 text-right">Total Keseluruhan</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                  {filteredMaterials.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-black text-slate-900 uppercase italic">{item.nama}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">{item.code}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        {item.qtyBesar || 0} <span className="text-[10px] text-slate-400 font-normal">{item.satuanBesar}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-indigo-600">
                        {item.qtyKontainerBesar || 0} <span className="text-[10px] text-slate-400 font-normal">{item.satuanBesar}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-600">
                        {Math.round(Number(item.qtyKontainerKecil || 0))} <span className="text-[10px] text-slate-400 font-normal">{item.satuanKecil}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-indigo-950">
                        {formatTotalStock(item)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Stabil
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
          </div>

          {/* Footer Banner & Save Action */}
          <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider">
                  Simpan Hasil Stock Opname {activeTab === "gudang" ? WAREHOUSE_LIST[selectedWarehouse].name : BRANCH_LIST[selectedBranch].name}
                </p>
                <p className="text-[10px] text-slate-400">
                  Data fisik akan disinkronisasikan langsung ke database master inventori.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSaveOpname}
              disabled={processing}
              className="rounded-xl h-10 px-6 font-black uppercase text-xs tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md gap-2"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Simpan & Sinkronisasi</span>
            </Button>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
