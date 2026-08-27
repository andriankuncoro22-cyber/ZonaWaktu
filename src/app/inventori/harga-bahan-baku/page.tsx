"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase, collection, doc } from "@/firebase";
import { query, orderBy, serverTimestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Save, 
  Package, 
  RefreshCw, 
  ShoppingBag, 
  Truck, 
  ChefHat, 
  FileSpreadsheet, 
  Upload, 
  Download, 
  FileDown,
  Loader2 
} from "lucide-react";
import { applyPriceUpdate } from "@/lib/hpp";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

function parseExcelPrice(val: any): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export default function HargaBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [priceBesarInput, setPriceBesarInput] = useState<string>("");
  const [priceKecilInput, setPriceKecilInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  const filteredMaterials = useMemo(() => {
    return (materials as any[])?.filter((item: any) => {
      // Abaikan bahan yang dibuat sendiri (3. Pembuatan Sendiri)
      const isSelfMade = item.metodePembelian === "Pembuatan Sendiri" || 
                         item.metodePembelian?.toLowerCase().includes("pembuatan sendiri") ||
                         item.metodePembelian?.toLowerCase().includes("3.");
      if (isSelfMade) return false;

      const q = searchTerm.toLowerCase();
      return !q || item.nama?.toLowerCase().includes(q) || item.code?.toLowerCase().includes(q);
    }) || [];
  }, [materials, searchTerm]);

  const selectedMaterial = useMemo(() => {
    return filteredMaterials.find((item: any) => item.id === selectedId) || filteredMaterials[0] || null;
  }, [filteredMaterials, selectedId]);

  // Sync inputs whenever selected material changes
  useEffect(() => {
    if (selectedMaterial) {
      const conversionRate = Number(selectedMaterial.qtyKecil || 1);
      const priceBesar = Number(selectedMaterial.currentPrice ?? selectedMaterial.avgPrice ?? selectedMaterial.hargaBeliSatuanBesar ?? 0);
      const priceKecil = selectedMaterial.hargaSatuanKecil ?? (conversionRate > 0 ? priceBesar / conversionRate : 0);

      queueMicrotask(() => {
        setPriceBesarInput(priceBesar ? String(priceBesar) : "0");
        setPriceKecilInput(priceKecil ? String(Math.round(priceKecil * 100) / 100) : "0");
      });
    }
  }, [selectedMaterial?.id]);

  const handleSelect = (material: any) => {
    setSelectedId(material.id);
  };

  // Bidirectional calculations: Besar -> Kecil
  const handleBesarChange = (val: string) => {
    setPriceBesarInput(val);
    const numBesar = Number(val);
    const rate = Number(selectedMaterial?.qtyKecil || 1);
    if (!isNaN(numBesar) && rate > 0) {
      const numKecil = Math.round((numBesar / rate) * 100) / 100;
      setPriceKecilInput(String(numKecil));
    } else if (val === "") {
      setPriceKecilInput("");
    }
  };

  // Bidirectional calculations: Kecil -> Besar
  const handleKecilChange = (val: string) => {
    setPriceKecilInput(val);
    const numKecil = Number(val);
    const rate = Number(selectedMaterial?.qtyKecil || 1);
    if (!isNaN(numKecil)) {
      const numBesar = Math.round((numKecil * rate) * 100) / 100;
      setPriceBesarInput(String(numBesar));
    } else if (val === "") {
      setPriceBesarInput("");
    }
  };

  const handleSave = async () => {
    if (!selectedMaterial) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "bahan-baku", selectedMaterial.id);
      
      const updated = applyPriceUpdate(selectedMaterial, priceBesarInput, priceKecilInput);
      
      batch.update(materialRef, {
        currentPrice: updated.currentPrice,
        hargaSatuanKecil: updated.hargaSatuanKecil,
        avgPrice: updated.avgPrice,
        avgPriceKecil: updated.avgPriceKecil,
        priceHistory: updated.priceHistory,
        updatedAt: serverTimestamp(),
      });
      
      await batch.commit();
      toast({ 
        title: "Harga Diperbarui", 
        description: `Harga per ${selectedMaterial.satuanBesar || 'Satuan Besar'} (Rp ${Number(priceBesarInput).toLocaleString('id-ID')}) & per ${selectedMaterial.satuanKecil || 'Satuan Kecil'} (Rp ${Number(priceKecilInput).toLocaleString('id-ID')}) berhasil disimpan.` 
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan harga bahan baku." });
    } finally {
      setSaving(false);
    }
  };

  // Export Excel (Hanya bahan baku supliyer & beli sendiri)
  const handleExportExcel = () => {
    const validMaterials = (materials as any[])?.filter((mat: any) => {
      const isSelfMade = mat.metodePembelian === "Pembuatan Sendiri" || 
                         mat.metodePembelian?.toLowerCase().includes("pembuatan sendiri") ||
                         mat.metodePembelian?.toLowerCase().includes("3.");
      return !isSelfMade;
    }) || [];

    if (validMaterials.length === 0) {
      toast({
        variant: "destructive",
        title: "Gagal Ekspor",
        description: "Tidak ada data bahan baku untuk diekspor."
      });
      return;
    }

    const exportData = validMaterials.map((mat) => {
      const conversion = Number(mat.qtyKecil || 1);
      const priceBesar = Number(mat.currentPrice ?? mat.avgPrice ?? mat.hargaBeliSatuanBesar ?? 0);
      const priceKecil = mat.hargaSatuanKecil ?? (conversion > 0 ? priceBesar / conversion : 0);
      const avgPriceBesar = Number(mat.avgPrice || priceBesar || 0);
      const avgPriceKecil = Number(mat.avgPriceKecil || priceKecil || 0);

      return {
        "Code": mat.code || "-",
        "Nama Bahan": mat.nama || "-",
        "Metode Pembelian": mat.metodePembelian === "Beli Sendiri" 
          ? "2. Beli Sendiri" 
          : "1. Supliyer",
        "Satuan Besar": mat.satuanBesar || "-",
        "Isi per Sat. Besar (Qty Kecil)": conversion,
        "Satuan Kecil": mat.satuanKecil || "-",
        "Harga Satuan Besar (Rp)": Math.round(priceBesar),
        "Harga Satuan Kecil (Rp)": Math.round(priceKecil * 100) / 100,
        "Rata-Rata Sat. Besar (Rp)": Math.round(avgPriceBesar),
        "Rata-Rata Sat. Kecil (Rp)": Math.round(avgPriceKecil * 100) / 100,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Harga Bahan Baku");
    XLSX.writeFile(wb, `harga-bahan-baku-zonawaktu_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Ekspor Berhasil",
      description: `${exportData.length} data harga bahan baku berhasil diekspor ke Excel.`
    });
  };

  // Download Template Excel
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Code": "BB005",
        "Nama Bahan": "Gula Aren",
        "Satuan Besar": "liter",
        "Isi per Sat. Besar (Qty Kecil)": 1000,
        "Satuan Kecil": "ml",
        "Harga Satuan Besar (Rp)": 24000,
        "Harga Satuan Kecil (Rp)": 24
      },
      {
        "Code": "BB006",
        "Nama Bahan": "Susu UHT",
        "Satuan Besar": "liter",
        "Isi per Sat. Besar (Qty Kecil)": 1000,
        "Satuan Kecil": "ml",
        "Harga Satuan Besar (Rp)": 19000,
        "Harga Satuan Kecil (Rp)": 19
      },
      {
        "Code": "BB007",
        "Nama Bahan": "Cup 16oz",
        "Satuan Besar": "Dus",
        "Isi per Sat. Besar (Qty Kecil)": 1000,
        "Satuan Kecil": "pcs",
        "Harga Satuan Besar (Rp)": 250000,
        "Harga Satuan Kecil (Rp)": 250
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Update Harga");
    XLSX.writeFile(wb, "template-update-harga-bahan-baku.xlsx");
  };

  // Import Excel
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
        const rows: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rows || rows.length === 0) {
          toast({
            variant: "destructive",
            title: "Import Gagal",
            description: "File Excel kosong atau tidak memiliki data yang valid."
          });
          setIsImporting(false);
          return;
        }

        const currentMaterials = (materials as any[]) || [];
        const batch = writeBatch(db);
        let updatedCount = 0;

        rows.forEach((row: any) => {
          const rawCode = String(row["Code"] || row["code"] || row["Kode"] || row["KODE"] || "").trim();
          const rawName = String(row["Nama Bahan"] || row["Nama barang"] || row["Nama Barang"] || row["nama"] || row["Nama"] || "").trim();

          if (!rawCode && !rawName) return;

          // Match material by code or name
          const targetMat = currentMaterials.find((m: any) => {
            const mCode = String(m.code || "").trim().toUpperCase();
            const mName = String(m.nama || "").trim().toLowerCase();
            const cleanMCode = mCode.replace(/[\s-_]/g, '');
            const cleanTargetCode = rawCode.toUpperCase().replace(/[\s-_]/g, '');

            if (rawCode && (mCode === rawCode.toUpperCase() || cleanMCode === cleanTargetCode)) {
              return true;
            }
            if (rawName && mName === rawName.toLowerCase()) {
              return true;
            }
            return false;
          });

          if (!targetMat) return;

          // Abaikan bahan pembuatan sendiri
          const isSelfMade = targetMat.metodePembelian === "Pembuatan Sendiri" || 
                             targetMat.metodePembelian?.toLowerCase().includes("pembuatan sendiri") ||
                             targetMat.metodePembelian?.toLowerCase().includes("3.");
          if (isSelfMade) return;

          const rate = Number(targetMat.qtyKecil || 1);

          // Parse prices
          let priceBesar = parseExcelPrice(
            row["Harga Satuan Besar (Rp)"] ?? 
            row["Harga Satuan Besar"] ?? 
            row["Harga Besar"] ?? 
            row["Harga Beli Satuan Besar"] ?? 
            row["currentPrice"] ?? 
            row["Harga Beli"]
          );

          let priceKecil = parseExcelPrice(
            row["Harga Satuan Kecil (Rp)"] ?? 
            row["Harga Satuan Kecil"] ?? 
            row["Harga Kecil"] ?? 
            row["hargaSatuanKecil"] ?? 
            row["Harga Per Cup/Gram/Ml"]
          );

          // If only Besar is provided, calculate Kecil
          if (priceBesar !== null && priceKecil === null && rate > 0) {
            priceKecil = Math.round((priceBesar / rate) * 100) / 100;
          }
          // If only Kecil is provided, calculate Besar
          else if (priceKecil !== null && priceBesar === null && rate > 0) {
            priceBesar = Math.round(priceKecil * rate);
          }

          if (priceBesar === null && priceKecil === null) return;

          const finalBesar = priceBesar ?? 0;
          const finalKecil = priceKecil ?? (rate > 0 ? finalBesar / rate : 0);

          const updated = applyPriceUpdate(targetMat, finalBesar, finalKecil);
          const matRef = doc(db, "bahan-baku", targetMat.id);

          batch.update(matRef, {
            currentPrice: updated.currentPrice,
            hargaSatuanKecil: updated.hargaSatuanKecil,
            avgPrice: updated.avgPrice,
            avgPriceKecil: updated.avgPriceKecil,
            priceHistory: updated.priceHistory,
            updatedAt: serverTimestamp(),
          });

          updatedCount++;
        });

        if (updatedCount > 0) {
          await batch.commit();
          toast({
            title: "Import Harga Berhasil",
            description: `${updatedCount} harga bahan baku berhasil diperbarui dari Excel.`
          });
        } else {
          toast({
            variant: "destructive",
            title: "Tidak Ada Data Cocok",
            description: "Tidak ditemukan kode atau nama bahan yang cocok di database (bahan pembuatan sendiri dilewati)."
          });
        }
      } catch (err) {
        console.error("Gagal import harga excel:", err);
        toast({
          variant: "destructive",
          title: "Gagal Import",
          description: "Terjadi kesalahan saat memproses file Excel."
        });
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-8 p-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Harga Bahan Baku</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Manajemen Harga Bahan Baku Pembelian (1. Supliyer & 2. Beli Sendiri) • Konversi Otomatis
          </p>
        </div>

        {/* Action Buttons: Template, Export, Import */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="rounded-2xl border-slate-200 hover:bg-slate-50 font-black uppercase tracking-wider text-[9px] gap-1.5 h-10 px-3.5 shadow-sm"
          >
            <FileDown className="h-3.5 w-3.5 text-slate-500" />
            Template Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="rounded-2xl border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 text-emerald-800 font-black uppercase tracking-wider text-[9px] gap-1.5 h-10 px-4 shadow-sm"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Ekspor Excel
          </Button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx, .xls"
            className="hidden"
          />

          <Button
            variant="default"
            size="sm"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-wider text-[9px] gap-1.5 h-10 px-4 shadow-md shadow-primary/20"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Impor Excel
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left List Pane */}
        <Card className="lg:col-span-1 rounded-[2rem] border-none shadow-sm p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">Daftar Bahan</h2>
          </div>
          <div className="relative mb-4">
            <Input 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder="Cari nama atau kode bahan..." 
              className="rounded-2xl" 
            />
          </div>
          <div className="space-y-2 max-h-[140px] md:max-h-[600px] overflow-y-auto pr-1">
            {filteredMaterials.map((material: any) => {
              const conversion = Number(material.qtyKecil || 1);
              const pBesar = Number(material.currentPrice ?? material.avgPrice ?? 0);
              const pKecil = material.hargaSatuanKecil ?? (conversion > 0 ? pBesar / conversion : 0);
              const isBeliSendiri = material.metodePembelian === "Beli Sendiri";

              return (
                <button 
                  key={material.id} 
                  onClick={() => handleSelect(material)} 
                  className={cn(
                    "w-full text-left rounded-xl md:rounded-2xl border p-2.5 md:p-3.5 transition-all space-y-1 md:space-y-2",
                    selectedMaterial?.id === material.id ? "border-primary bg-primary/5 shadow-sm" : "border-slate-100 bg-white hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 line-clamp-1">{material.nama}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{material.code || "-"}</span>
                  </div>

                  <div className="hidden md:flex items-center justify-between gap-2 pt-1 border-t border-slate-100/60">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-tight",
                      isBeliSendiri 
                        ? "bg-amber-50 text-amber-700 border border-amber-200" 
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    )}>
                      {isBeliSendiri ? "2. Beli Sendiri" : "1. Supliyer"}
                    </span>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-800">
                        Rp {pBesar.toLocaleString("id-ID")} <span className="text-[8px] font-bold text-slate-400">/{material.satuanBesar || 'Unit'}</span>
                      </div>
                      <div className="text-[9px] font-semibold text-slate-500">
                        Rp {Math.round(pKecil).toLocaleString("id-ID")} <span className="text-[8px] font-medium text-slate-400">/{material.satuanKecil || 'Pcs'}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Detail & Pricing Configuration Pane */}
        <Card className="lg:col-span-2 rounded-[2rem] border-none shadow-sm p-4 md:p-6 lg:sticky lg:top-4">
          {selectedMaterial ? (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bahan Terpilih</span>
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight",
                      selectedMaterial.metodePembelian === "Beli Sendiri" 
                        ? "bg-amber-100 text-amber-800 border border-amber-200" 
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    )}>
                      {selectedMaterial.metodePembelian === "Beli Sendiri" 
                        ? "2. Beli Sendiri" 
                        : "1. Supliyer"}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900">{selectedMaterial.nama}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Kode: <span className="font-bold text-slate-700">{selectedMaterial.code || "-"}</span> • Qty Gudang: <span className="font-bold text-slate-700">{Number(selectedMaterial.qtyBesar || 0)} {selectedMaterial.satuanBesar || "Unit"}</span> ({Number(selectedMaterial.qtyBesar || 0) * Number(selectedMaterial.qtyKecil || 1)} {selectedMaterial.satuanKecil || "Pcs"})
                  </p>
                </div>

                {/* Dual Average Summary Cards */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <div className="rounded-2xl bg-amber-50/80 border border-amber-100 p-3 text-right">
                    <p className="text-[8px] font-black uppercase tracking-wider text-amber-700">Rata-Rata Sat. Besar</p>
                    <p className="text-sm font-black text-amber-800 mt-0.5">
                      Rp {Number(selectedMaterial.avgPrice || selectedMaterial.currentPrice || 0).toLocaleString("id-ID")}
                    </p>
                    <p className="text-[8px] font-bold text-amber-600">/{selectedMaterial.satuanBesar || "Sat.Besar"}</p>
                  </div>
                  <div className="rounded-2xl bg-blue-50/80 border border-blue-100 p-3 text-right">
                    <p className="text-[8px] font-black uppercase tracking-wider text-blue-700">Rata-Rata Sat. Kecil</p>
                    <p className="text-sm font-black text-blue-800 mt-0.5">
                      Rp {Math.round(Number(selectedMaterial.avgPriceKecil || selectedMaterial.hargaSatuanKecil || 0)).toLocaleString("id-ID")}
                    </p>
                    <p className="text-[8px] font-bold text-blue-600">/{selectedMaterial.satuanKecil || "Sat.Kecil"}</p>
                  </div>
                </div>
              </div>

              {/* Redaksi Metode Pembelian Context */}
              <div className={cn(
                "rounded-2xl p-4 border text-xs space-y-1.5",
                selectedMaterial.metodePembelian === "Beli Sendiri" 
                  ? "bg-amber-50/50 border-amber-200/70 text-amber-900" 
                  : "bg-blue-50/50 border-blue-200/70 text-blue-900"
              )}>
                <div className="flex items-center gap-2 font-black uppercase text-[10px] tracking-wider">
                  {selectedMaterial.metodePembelian === "Beli Sendiri" ? (
                    <>
                      <ShoppingBag className="h-4 w-4 text-amber-600" />
                      Redaksi: Pembelian Fleksibel (Beli Sendiri)
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4 text-blue-600" />
                      Redaksi: Pembelian Baku (Supliyer)
                    </>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed opacity-90 font-medium">
                  {selectedMaterial.metodePembelian === "Beli Sendiri" 
                    ? `Item ini dikategorikan "Beli Sendiri" (misal: belanja per pack/box/pcs dengan berat/isi yang bervariasi). Penginputan harga per satuan kecil (${selectedMaterial.satuanKecil || 'satuan kecil'}) akan menjadi acuan fleksibel saat input belanja langsung.`
                    : `Item ini dikategorikan "Supliyer" dengan patokan baku paket/dus dari supliyer utama. Penghitungan konversi ke ${selectedMaterial.satuanKecil || 'satuan kecil'} terkalkulasi secara standar.`
                  }
                </p>
              </div>

              {/* Dynamic Inputs Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-primary" /> Input Harga (Kalkulasi Otomatis 2 Arah)
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    1 {selectedMaterial.satuanBesar || 'Sat.Besar'} = {selectedMaterial.qtyKecil || 1} {selectedMaterial.satuanKecil || 'Sat.Kecil'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Input Satuan Besar */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Harga Per {selectedMaterial.satuanBesar || "Satuan Besar"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">Rp</span>
                      <Input 
                        value={priceBesarInput} 
                        onChange={(e) => handleBesarChange(e.target.value)} 
                        className="pl-10 rounded-2xl h-12 text-sm font-bold border-slate-200 focus:border-primary" 
                        placeholder="0" 
                      />
                    </div>
                  </div>

                  {/* Input Satuan Kecil */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Harga Per {selectedMaterial.satuanKecil || "Satuan Kecil"}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">Rp</span>
                      <Input 
                        value={priceKecilInput} 
                        onChange={(e) => handleKecilChange(e.target.value)} 
                        className="pl-10 rounded-2xl h-12 text-sm font-bold border-slate-200 focus:border-primary" 
                        placeholder="0" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Price History Section */}
              <div className="space-y-2 pt-2">
                <Label className="text-[10px] font-black uppercase tracking-wider text-slate-600">Histori Perubahan Harga</Label>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs text-slate-600">
                  {Array.isArray(selectedMaterial.priceHistory) && selectedMaterial.priceHistory.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {selectedMaterial.priceHistory.slice(-4).reverse().map((entry: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-2 text-[11px]">
                          <span className="font-semibold text-slate-500">
                            {entry.recordedAt ? new Date(entry.recordedAt).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}
                          </span>
                          <div className="text-right space-x-3">
                            <span className="font-black text-slate-800">
                              Rp {Number(entry.price || 0).toLocaleString("id-ID")} <span className="text-[9px] text-slate-400 font-normal">/{selectedMaterial.satuanBesar || 'Besar'}</span>
                            </span>
                            {entry.priceKecil !== undefined && (
                              <span className="font-bold text-slate-600">
                                (Rp {Math.round(Number(entry.priceKecil || 0)).toLocaleString("id-ID")} <span className="text-[9px] text-slate-400 font-normal">/{selectedMaterial.satuanKecil || 'Kecil'}</span>)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="italic text-slate-400 text-xs">Belum ada riwayat update harga.</span>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="w-full sm:w-auto rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-slate-900/10"
              >
                <Save className="h-4 w-4" /> {saving ? "Menyimpan Data..." : "Simpan Pembaruan Harga"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <Package className="h-12 w-12 mb-3 text-slate-300" />
              <p className="text-xs font-black uppercase tracking-[0.2em]">Belum ada bahan yang dipilih</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
