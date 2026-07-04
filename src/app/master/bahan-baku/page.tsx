
"use client";

import React, { useState, useRef } from "react";
import { 
  Plus, 
  Database, 
  Search, 
  Edit2, 
  Trash2, 
  FileUp, 
  FileDown, 
  Save,
  Trash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  qtyBesar: number;
  satuanBesar: string;
  qtyKecil: number;
  satuanKecil: string;
}

export default function MasterBahanBakuPage() {
  const db = useFirestore();
  
  const materialsQuery = useMemoFirebase(() => collection(db, "bahan-baku"), [db]);
  const { data: materials, loading } = useCollection(materialsQuery);
  
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState<BahanBaku | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const toTitleCase = (str: string) => {
    if (!str) return "-";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
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
      formatNumber(item.qtyBesar).toLocaleString('id-ID'),
      item.satuanBesar || "-",
      formatNumber(item.qtyKecil).toLocaleString('id-ID'),
      item.satuanKecil || "-",
    ]);

    autoTable(docPDF, {
      head: [["Code", "Nama Barang", "Qty Besar", "Satuan", "Konversi Kecil", "Sat. Kecil"]],
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
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const batch = writeBatch(db);
        const colRef = collection(db, "bahan-baku");

        data.forEach((row: any) => {
          const codeValue = row["Code"] || row["code"] || row["Kode"] || "";
          const namaValue = row["Nama Barang"] || row["nama"] || row["Nama"] || "";

          const newDocRef = doc(colRef);
          batch.set(newDocRef, {
            code: String(codeValue).trim(),
            nama: String(namaValue).trim(),
            qtyBesar: formatNumber(row["Qty Besar"] || 0),
            satuanBesar: String(row["Satuan Besar"] || "").trim(),
            qtyKecil: formatNumber(row["Qty Kecil"] || row["Konversi"] || 0),
            satuanKecil: String(row["Satuan Kecil"] || "").trim(),
          });
        });

        await batch.commit();
      } catch (err) {
        console.error("Error importing excel:", err);
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

  const handleDeleteAll = async () => {
    if (confirm("PERINGATAN: Hapus SELURUH data bahan baku? Tindakan ini tidak dapat dibatalkan.")) {
      try {
        const snapshot = await getDocs(collection(db, "bahan-baku"));
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      } catch (err) {
        console.error("Error deleting all:", err);
      }
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      code: String(formData.get("code") || "").trim(),
      nama: String(formData.get("nama") || "").trim(),
      qtyBesar: formatNumber(formData.get("qtyBesar")),
      satuanBesar: String(formData.get("satuanBesar") || "").trim(),
      qtyKecil: formatNumber(formData.get("qtyKecil")),
      satuanKecil: String(formData.get("satuanKecil") || "").trim(),
    };

    if (editingItem) {
      updateDoc(doc(db, "bahan-baku", editingItem.id), data);
    } else {
      addDoc(collection(db, "bahan-baku"), data);
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
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl px-4 font-bold h-10 text-[10px] uppercase tracking-wider gap-2 text-slate-700 hover:bg-slate-50"
            >
              <FileUp className="h-4 w-4 text-primary" />
              Import
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
          
          <Button 
            variant="destructive"
            onClick={handleDeleteAll}
            className="rounded-2xl px-6 font-bold h-12 uppercase tracking-widest text-[10px] gap-2 shadow-sm border-none bg-rose-50 text-rose-600 hover:bg-rose-100"
          >
            <Trash className="h-4 w-4" />
            Hapus Semua
          </Button>

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
            <DialogContent className="max-w-xl rounded-[2.5rem] p-10 border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                  {editingItem ? "Edit Bahan Baku" : "Tambah Bahan Baku"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-6 mt-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Code Bahan</Label>
                  <Input name="code" defaultValue={editingItem?.code} placeholder="BB-001" className="rounded-xl border-slate-200 h-11" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nama Barang</Label>
                  <Input name="nama" defaultValue={editingItem?.nama} placeholder="Contoh: Kopi Arabika" className="rounded-xl border-slate-200 h-11" required />
                </div>
                
                <div className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-100">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-primary">Konfigurasi Besar</h4>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Qty Gudang</Label>
                      <Input name="qtyBesar" type="number" step="any" defaultValue={editingItem?.qtyBesar} className="rounded-xl bg-white border-slate-200" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Satuan Besar</Label>
                      <Input name="satuanBesar" defaultValue={editingItem?.satuanBesar} placeholder="Sak / Dus" className="rounded-xl bg-white border-slate-200" required />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-100">
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

                <div className="col-span-2 flex justify-end gap-3 mt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Batal</Button>
                  <Button type="submit" className="rounded-xl bg-primary px-8 font-black uppercase tracking-widest text-[10px] h-11 shadow-lg shadow-primary/20">
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
        <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-y border-slate-100 border-t-primary/10">
                <th className="pl-8 pr-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5">Code</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-left">Nama Bahan</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Qty Besar</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-left">Satuan</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Konversi</th>
                <th className="px-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-left">Sat. Kecil</th>
                <th className="pl-6 pr-8 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredMaterials?.length > 0 ? (
                filteredMaterials.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/40 transition-colors">
                    <td className="pl-8 pr-4 py-5">
                      <div className="inline-flex items-center px-2 py-1 rounded-lg bg-primary/5 border border-primary/10 transition-colors group-hover:bg-primary/10">
                        <span className="text-[10px] font-bold text-primary/70 tracking-tighter uppercase tabular-nums">
                          {item.code || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-left">
                      <span className="text-sm font-medium text-slate-900 block truncate max-w-[180px]">
                        {toTitleCase(item.nama)}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-right font-medium text-slate-900 tabular-nums">
                      {formatNumber(item.qtyBesar).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-5 text-left">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{item.satuanBesar}</span>
                    </td>
                    <td className="px-4 py-5 text-right font-medium text-slate-900 tabular-nums">
                      {formatNumber(item.qtyKecil).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-5 text-left">
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{item.satuanKecil}</span>
                    </td>
                    <td className="pl-6 pr-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-primary transition-all"
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
                          className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-rose-600 transition-all"
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
                  <td colSpan={7} className="px-8 py-32 text-center">
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
        </div>
      </Card>
    </div>
  );
}
