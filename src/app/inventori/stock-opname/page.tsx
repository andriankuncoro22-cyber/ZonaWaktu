
"use client";

import React, { useState, useEffect } from "react";
import { 
  ClipboardList, 
  Search, 
  FileDown, 
  FileSpreadsheet, 
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Archive,
  Layers,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, query, orderBy, doc, writeBatch, addDoc, serverTimestamp } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function StockOpnamePage() {
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  
  const materialsQuery = useMemoFirebase(() => 
    query(collection(db, "bahan-baku"), orderBy("code", "asc")), 
    [db]
  );
  
  const { data: materials, loading } = useCollection(materialsQuery);

  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const filteredMaterials = (materials as any[])?.filter(item => 
    item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUnitWeight = (item: any) => {
    const gramPerBesar = Number(item.gramPerBesar || 0);
    const konversi = Number(item.qtyKecil || 1);
    return konversi > 0 ? gramPerBesar / konversi : 0;
  };

  const getTotalWeightFromAktif = (item: any, aktifQty: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    return Number(aktifQty || 0) * getUnitWeight(item) + beratBungkus;
  };

  const getAktifFromGrams = (item: any, gramsValue: number) => {
    const beratBungkus = Number(item.beratBungkusProduk || 0);
    const netGrams = Math.max(0, Number(gramsValue || 0) - beratBungkus);
    const unitWeight = getUnitWeight(item);
    return unitWeight > 0 ? netGrams / unitWeight : 0;
  };

  // Local state to hold kontainer opname inputs per item
  const [kontainerInputs, setKontainerInputs] = useState<Record<string, { aktif: number; grams: number }>>({});
  const [bulkInputs, setBulkInputs] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);

  // history
  const historyQuery = useMemoFirebase(() => query(collection(db, "opnam_harian"), orderBy("date", "desc")), [db]);
  const { data: histories } = useCollection(historyQuery);

  useEffect(() => {
    // initialize inputs from materials (depend on raw materials + searchTerm to avoid loop)
    if (!materials) return;
    const filtered = (materials as any[])
      .filter(item => item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) || item.code?.toLowerCase().includes(searchTerm.toLowerCase()));
    const next: Record<string, { aktif: number; grams: number }> = {};
    const nextBulk: Record<string, number> = {};
    filtered.forEach((it: any) => {
      const aktif = Number(it.qtyKontainerKecil || 0);
      const grams = getTotalWeightFromAktif(it, aktif);
      next[it.id] = { aktif, grams };
      nextBulk[it.id] = Number(it.qtyKontainerBesar || 0);
    });
    queueMicrotask(() => {
      setKontainerInputs(next);
      setBulkInputs(nextBulk);
    });
  }, [materials, searchTerm]);

  const formatTotalStock = (item: any) => {
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
      "Satuan Besar": item.satuanBesar,
      "Bulk Kontainer (Sistem)": item.qtyKontainerBesar || 0,
      "Aktif Kontainer (Sistem)": item.qtyKontainerKecil || 0,
      "Satuan Kecil": item.satuanKecil,
      "Total Keseluruhan": formatTotalStock(item)
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Opname");
    XLSX.writeFile(wb, `Stock_Opname_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF('l', 'mm', 'a4'); // Landscape for opname

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
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 148, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 148, 21, { align: 'center' });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 28, 282, 28);

    docPDF.setFontSize(14);
    docPDF.setTextColor(0);
    docPDF.text("LAPORAN STOCK OPNAME", 148, 40, { align: 'center' });
    docPDF.setFontSize(10);
    docPDF.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 148, 46, { align: 'center' });
    
    const tableData = filteredMaterials.map(item => [
      item.code,
      item.nama.toUpperCase(),
      `${item.qtyBesar || 0} ${item.satuanBesar}`,
      `${item.qtyKontainerBesar || 0} ${item.satuanBesar}`,
      `${Math.round(item.qtyKontainerKecil || 0)} ${item.satuanKecil}`,
      formatTotalStock(item)
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "GUDANG", "KONT. BULK", "KONT. AKTIF", "TOTAL GABUNGAN"]],
      body: tableData,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [139, 26, 26] },
      styles: { fontSize: 8 }
    });

    docPDF.save(`Stock_Opname_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Stock Oknam</h1>
          <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Verifikasi Fisik & Sinkronisasi Inventori Operasional
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            className="rounded-2xl border-slate-200 px-6 h-12 font-black uppercase tracking-widest text-[10px] gap-2 bg-white hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPDF}
            className="rounded-2xl border-slate-200 px-6 h-12 font-black uppercase tracking-widest text-[10px] gap-2 bg-white hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4 text-primary" /> PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="gudang" className="w-full">
        <TabsList className="bg-white p-2 rounded-[2rem] shadow-sm border border-slate-100 h-16 w-full max-w-2xl grid grid-cols-3 gap-2 mb-8 mx-auto lg:mx-0">
          <TabsTrigger value="gudang" className="rounded-2xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all flex items-center gap-2">
            <Archive className="h-4 w-4" /> Stock Gudang
          </TabsTrigger>
          <TabsTrigger value="kontainer" className="rounded-2xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all flex items-center gap-2">
            <Layers className="h-4 w-4" /> Stock Kontainer
          </TabsTrigger>
          <TabsTrigger value="akhir" className="rounded-2xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Hasil Akhir
          </TabsTrigger>
        </TabsList>

        <Card className="border-none shadow-sm rounded-[3rem] bg-white overflow-hidden">
          <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input 
                type="text" 
                placeholder="Cari bahan berdasarkan kode atau nama..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border-none rounded-2xl text-xs font-bold outline-none shadow-sm focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
               <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-indigo-500" /> Stok Bulk</span>
               <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-emerald-500" /> Stok Aktif</span>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <TabsContent value="gudang" className="m-0 min-w-[800px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Bahan Baku</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Sistem</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Satuan</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Input Fisik Gudang</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={5} className="py-32 text-center"><RefreshCcw className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></td></tr>
                  ) : filteredMaterials?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-6">
                        <p className="text-[10px] font-bold text-primary mb-1">{item.code}</p>
                        <p className="text-sm font-black text-slate-900 uppercase italic">{item.nama}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                            Bungkus: {Number(item.beratBungkusProduk || 0).toLocaleString('id-ID')} {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                          </span>
                          <span className="rounded-full bg-primary/5 px-2 py-1 font-semibold text-primary">
                            Total/produk: {Number(item.totalGramasiPerProduk ?? (Number(item.gramPerBesar || 0) + Number(item.beratBungkusProduk || 0))).toLocaleString('id-ID')} {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right font-black text-slate-900 text-xl tabular-nums">{(item.qtyBesar || 0)}</td>
                      <td className="px-8 py-6 text-center text-[10px] font-black uppercase text-slate-400">{item.satuanBesar}</td>
                      <td className="px-8 py-6">
                         <div className="relative w-40">
                           <Input type="number" placeholder="0" className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12" />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300 uppercase">{item.satuanBesar}</span>
                         </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                         <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-emerald-500 hover:bg-emerald-50">
                           <CheckCircle2 className="h-5 w-5" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="kontainer" className="m-0 min-w-[1000px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Bahan Baku</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Bulk (Sistem)</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Aktif (Sistem)</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Input Fisik (Bulk)</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Input Fisik (Aktif)</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMaterials?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-6">
                        <p className="text-[10px] font-bold text-primary mb-1">{item.code}</p>
                        <p className="text-sm font-black text-slate-900 uppercase italic">{item.nama}</p>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <p className="font-black text-indigo-600 text-xl tabular-nums">{(item.qtyKontainerBesar || 0)}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">{item.satuanBesar}</p>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <p className="font-black text-emerald-600 text-xl tabular-nums">{Math.round(item.qtyKontainerKecil || 0)}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">{item.satuanKecil}</p>
                      </td>
                      <td className="px-8 py-6">
                         <div className="relative w-36">
                           <Input
                             type="number"
                             value={bulkInputs[item.id] ?? ""}
                             onChange={(e) => setBulkInputs(prev => ({ ...prev, [item.id]: Number(e.target.value || 0) }))}
                             placeholder="0"
                             className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                           />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-indigo-300 uppercase">{item.satuanBesar}</span>
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex items-center gap-2">
                           <div className="relative w-36">
                             <Input
                               type="number"
                               value={kontainerInputs[item.id]?.aktif ?? ''}
                               onChange={(e) => {
                                 const val = Number(e.target.value || 0);
                                 setKontainerInputs(prev => ({
                                   ...prev,
                                   [item.id]: {
                                     ...(prev[item.id] || { aktif: 0, grams: 0 }),
                                     aktif: val,
                                     grams: getTotalWeightFromAktif(item, val),
                                   },
                                 }));
                               }}
                               placeholder="0"
                               className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                             />
                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-emerald-300 uppercase">{item.satuanKecil}</span>
                           </div>

                           <div className="relative w-36">
                             <Input
                               type="number"
                               value={kontainerInputs[item.id]?.grams ?? ''}
                               onChange={(e) => {
                                 const gramsVal = Number(e.target.value || 0);
                                 setKontainerInputs(prev => ({
                                   ...prev,
                                   [item.id]: {
                                     ...(prev[item.id] || { aktif: 0, grams: 0 }),
                                     grams: gramsVal,
                                     aktif: Math.round(getAktifFromGrams(item, gramsVal) * 100) / 100,
                                   },
                                 }));
                               }}
                               placeholder={item.satuanKalibrasi === "Pcs" ? "0 pcs" : "0 g"}
                               className="rounded-xl h-12 bg-slate-50 border-none font-black text-center text-lg pr-12"
                             />
                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-black text-slate-400 uppercase">
                               {item.satuanKalibrasi === "Pcs" ? "pcs" : "g"}
                             </span>
                           </div>
                         </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                         <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-primary hover:bg-primary/5">
                           <CheckCircle2 className="h-5 w-5" />
                         </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="akhir" className="m-0 min-w-[1000px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest">Bahan Baku</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Gudang Utama</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Kont. Bulk</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Kont. Aktif</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Keseluruhan (Besar)</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMaterials?.map((item: any) => {
                    const qtyGudang = Number(item.qtyBesar || 0);
                    const qtyBulk = Number(item.qtyKontainerBesar || 0);
                    const qtyAktif = Number(item.qtyKontainerKecil || 0);
                    const konversi = Number(item.qtyKecil || 1);

                    const totalKecil = ((qtyGudang + qtyBulk) * konversi) + qtyAktif;
                    const hasilBesar = Math.floor(totalKecil / konversi);
                    const hasilKecil = Math.round(totalKecil % konversi);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6">
                          <p className="text-sm font-black text-slate-900 uppercase italic">{item.nama}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">{item.code}</p>
                        </td>
                        <td className="px-6 py-6 text-right font-black text-slate-900 tabular-nums">
                          {qtyGudang} <span className="text-[9px] text-slate-400 font-bold ml-1">{item.satuanBesar}</span>
                        </td>
                        <td className="px-6 py-6 text-right font-black text-indigo-600 tabular-nums">
                          {qtyBulk} <span className="text-[9px] text-slate-400 font-bold ml-1">{item.satuanBesar}</span>
                        </td>
                        <td className="px-6 py-6 text-right font-black text-emerald-600 tabular-nums">
                          {qtyAktif} <span className="text-[9px] text-slate-400 font-bold ml-1">{item.satuanKecil}</span>
                        </td>
                        <td className="px-8 py-6 text-right font-black text-primary tabular-nums">
                          <div className="flex flex-col items-end">
                            <div className="text-2xl leading-none">
                              {hasilBesar}
                              <span className="text-[10px] text-slate-400 font-black ml-2 uppercase">{item.satuanBesar}</span>
                            </div>
                            {hasilKecil !== 0 && (
                              <div className="text-[10px] text-slate-400 uppercase mt-1">
                                {hasilKecil} {item.satuanKecil}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6 text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase border border-emerald-100">
                            <CheckCircle2 className="h-3 w-3" /> Stabil
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabsContent>
          </div>

          <div className="p-10 bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
             <div className="flex items-center gap-4">
               <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
                 <AlertCircle className="h-6 w-6" />
               </div>
               <div>
                 <p className="text-xs font-black uppercase tracking-widest">Sinkronisasi Data Fisik</p>
                 <p className="text-[10px] font-medium text-slate-400 mt-1 max-w-md leading-relaxed">
                   Pastikan semua tim operasional telah menyelesaikan input fisik untuk stok Bulk dan Aktif sebelum melakukan finalisasi update sistem.
                 </p>
               </div>
             </div>
             <Button className="w-full md:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-white px-10 h-14 font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20">
                Finalisasi & Update Stok Sistem
             </Button>
            <div className="mt-3">
              <Button
                onClick={async () => {
                  if (processing) return;
                  setProcessing(true);
                  try {
                    const batch = writeBatch(db);
                    const historyItems: any[] = [];
                    (filteredMaterials || []).forEach((it: any) => {
                      const beforeBulk = Number(it.qtyKontainerBesar || 0);
                      const beforeAktif = Number(it.qtyKontainerKecil || 0);
                      const afterBulk = Number(bulkInputs[it.id] ?? beforeBulk);
                      const afterAktif = Number(kontainerInputs[it.id]?.aktif ?? beforeAktif);
                      const ref = doc(db, "bahan-baku", it.id);
                      batch.update(ref, { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif });
                      historyItems.push({ id: it.id, code: it.code, nama: it.nama, before: { qtyKontainerBesar: beforeBulk, qtyKontainerKecil: beforeAktif }, after: { qtyKontainerBesar: afterBulk, qtyKontainerKecil: afterAktif } });
                    });
                    await batch.commit();
                    await addDoc(collection(db, "opnam_harian"), { date: serverTimestamp(), note: "Finalisasi Opnam Harian (manual)", items: historyItems });
                    window.alert("Finalisasi berhasil dan stok sistem diperbarui.");
                  } catch (err) {
                    console.error(err);
                    window.alert("Terjadi kesalahan saat finalisasi. Cek console.");
                  } finally {
                    setProcessing(false);
                  }
                }}
                className="w-full md:w-auto rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white px-10 h-14 font-black uppercase tracking-widest text-[11px] shadow-xl shadow-emerald-200"
                disabled={processing}
              >
                {processing ? "Memproses..." : "Finalisasi & Update Stok Sistem (langsung)"}
              </Button>
            </div>
          </div>
          <div className="p-6 bg-white border-t">
            <h3 className="text-sm font-black uppercase text-slate-700 mb-2">Histori Opnam Harian Terakhir</h3>
            <div className="space-y-3">
              {(histories || []).slice(0, 10).map((h: any) => (
                <div key={h.id || h.date?.seconds} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{h.note || "Opnam Harian"}</div>
                    <div className="text-xs text-slate-400">{h.date?.toDate ? h.date.toDate().toLocaleString() : "-"}</div>
                  </div>
                  <div className="text-[12px] text-slate-600 mt-2">Items: {Array.isArray(h.items) ? h.items.length : 0}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}
