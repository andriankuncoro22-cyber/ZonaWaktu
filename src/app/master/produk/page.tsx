
"use client";

import React, { useState, useRef } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  FileUp, 
  FileDown, 
  Save,
  Trash,
  Soup
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

interface Product {
  id: string;
  code: string;
  nama: string;
  kategori: string;
  hargaJual: number;
  hargaDasar: number;
}

export default function ProdukPage() {
  const db = useFirestore();
  
  const productsQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const { data: products, loading } = useCollection(productsQuery);
  
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered and sorted products (Sorted by code ascending)
  const filteredProducts = (products as Product[])
    ?.filter(item => 
      item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kategori?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }));

  const formatNumber = (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const toTitleCase = (str: string) => {
    if (!str) return "-";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
  };

  const parseExcelNumber = (val: any) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/\./g, '').replace(/[^0-9]/g, '');
      return parseInt(cleaned, 10) || 0;
    }
    return 0;
  };

  const findVal = (row: any, ...keys: string[]) => {
    const rowKeys = Object.keys(row);
    for (const searchKey of keys) {
      if (row[searchKey] !== undefined) return row[searchKey];
      const matchedKey = rowKeys.find(rk => 
        rk.toLowerCase().includes(searchKey.toLowerCase()) || 
        searchKey.toLowerCase().includes(rk.toLowerCase())
      );
      if (matchedKey) return row[matchedKey];
    }
    return 0;
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
    docPDF.text("KATALOG PRODUK JADI", 105, 40, { align: 'center' });
    
    const tableData = (filteredProducts || []).map(item => [
      item.code || "-",
      toTitleCase(item.nama),
      item.kategori || "-",
      formatNumber(item.hargaJual).toLocaleString('id-ID'),
      formatNumber(item.hargaDasar).toLocaleString('id-ID'),
    ]);

    autoTable(docPDF, {
      head: [["Code", "Nama Produk", "Kategori", "Harga Jual", "Harga Dasar"]],
      body: tableData,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [139, 26, 26], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    docPDF.save("katalog-produk-zonawaktu.pdf");
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
        const colRef = collection(db, "produk");

        data.forEach((row: any) => {
          const codeValue = findVal(row, "Code", "code", "Kode") || "";
          const namaValue = findVal(row, "Nama", "Nama Produk", "nama") || "";
          const kategoriValue = findVal(row, "Kategori", "kategori") || "";
          
          const hjValue = findVal(row, "Harga Jual", "Harga Ju", "hargaJual", "HARGA JUAL");
          const hdValue = findVal(row, "Harga Dasar", "Harga D", "hargaDasar", "HARGA DASAR");

          const newDocRef = doc(colRef);
          batch.set(newDocRef, {
            code: String(codeValue).trim(),
            nama: String(namaValue).trim(),
            kategori: String(kategoriValue).trim(),
            hargaJual: parseExcelNumber(hjValue),
            hargaDasar: parseExcelNumber(hdValue),
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
    if (confirm("Hapus produk ini?")) {
      deleteDoc(doc(db, "produk", id));
    }
  };

  const handleDeleteAll = async () => {
    if (confirm("PERINGATAN: Hapus SELURUH data produk? Tindakan ini tidak dapat dibatalkan.")) {
      try {
        const snapshot = await getDocs(collection(db, "produk"));
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
      kategori: String(formData.get("kategori") || "").trim(),
      hargaJual: formatNumber(formData.get("hargaJual")),
      hargaDasar: formatNumber(formData.get("hargaDasar")),
    };

    if (editingItem) {
      updateDoc(doc(db, "produk", editingItem.id), data);
    } else {
      addDoc(collection(db, "produk"), data);
    }
    
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">Katalog Produk</h1>
          <p className="text-[11px] text-slate-600 font-bold uppercase tracking-[0.2em]">
            Manajemen Inventori & Penetapan Harga • Zona Waktu
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


          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingItem(null);
          }}>
            <DialogTrigger asChild>
              <Button className="rounded-2xl bg-primary hover:bg-primary/90 px-8 font-black shadow-xl shadow-primary/20 h-12 uppercase tracking-widest text-[10px] gap-2 border-none">
                <Plus className="h-4 w-4" />
                Produk Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-[2.5rem] p-10 border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                  {editingItem ? "Edit Produk" : "Tambah Produk"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Kode Produk</Label>
                  <Input name="code" defaultValue={editingItem?.code} placeholder="PRD-001" className="rounded-xl border-slate-200 focus:ring-primary h-11 font-medium" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nama Produk</Label>
                  <Input name="nama" defaultValue={editingItem?.nama} placeholder="Contoh: Kopi Gula Aren" className="rounded-xl border-slate-200 focus:ring-primary h-11 font-medium" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Kategori</Label>
                  <Input name="kategori" defaultValue={editingItem?.kategori} placeholder="Coffee / Non-Coffee" className="rounded-xl border-slate-200 focus:ring-primary h-11 font-medium" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Harga Jual</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                      <Input name="hargaJual" type="number" defaultValue={editingItem?.hargaJual} className="rounded-xl border-slate-200 pl-10 h-11 font-medium" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">Harga Dasar</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                      <Input name="hargaDasar" type="number" defaultValue={editingItem?.hargaDasar} className="rounded-xl border-slate-200 pl-10 h-11 font-medium" required />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Batal</Button>
                  <Button type="submit" className="rounded-xl bg-primary px-8 font-black uppercase tracking-widest text-[10px] h-11 shadow-lg shadow-primary/20">
                    <Save className="h-4 w-4 mr-2" />
                    Simpan
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
              placeholder="Cari produk atau kategori..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none placeholder:text-slate-500 text-slate-900 focus:bg-white focus:ring-1 focus:ring-slate-100 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Database:</span>
            <span className="text-xs font-black text-slate-900">{filteredProducts?.length || 0} Item</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Desktop Table View */}
          <table className="hidden md:table w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-y border-slate-100 border-t-primary/10">
                <th className="pl-8 pr-4 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5">Code</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-left">Nama Produk</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-left">Kategori</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Harga Jual (Rp)</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Harga Dasar (Rp)</th>
                <th className="pl-6 pr-8 py-5 text-[10px] font-black uppercase tracking-wider text-slate-700 border-b-primary/5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Katalog...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts?.length > 0 ? (
                filteredProducts.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/40 transition-colors">
                    <td className="pl-8 pr-4 py-5">
                      <div className="inline-flex items-center px-2 py-1 rounded-lg bg-primary/5 border border-primary/10 transition-colors group-hover:bg-primary/10">
                        <span className="text-[10px] font-bold text-primary/70 tracking-tighter uppercase tabular-nums">
                          {item.code || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-left">
                      <span className="text-sm font-medium text-slate-900 block truncate max-w-[200px]">
                        {toTitleCase(item.nama)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-left">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 whitespace-nowrap">
                        {item.kategori || "Uncategorized"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right font-medium text-slate-900 tabular-nums">
                      {formatNumber(item.hargaJual).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-5 text-right font-medium text-slate-600 tabular-nums">
                      {formatNumber(item.hargaDasar).toLocaleString('id-ID')}
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
                  <td colSpan={6} className="px-8 py-32 text-center">
                    <div className="max-w-xs mx-auto flex flex-col items-center">
                      <div className="h-16 w-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 shadow-sm">
                        <Soup className="h-7 w-7 text-slate-300" />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 uppercase italic">Katalog Belum Tersedia</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 leading-relaxed tracking-wider">
                        Mulai dengan mengimpor file Excel atau tambah produk secara manual.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Cards View */}
          <div className="md:hidden p-2 grid grid-cols-3 gap-1.5 sm:gap-2.5 bg-slate-50/20">
            {loading ? (
              <div className="col-span-3 py-20 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Katalog...</p>
                </div>
              </div>
            ) : filteredProducts?.length > 0 ? (
              filteredProducts.map((item) => (
                <Card key={item.id} className="relative rounded-xl bg-white border border-slate-100 p-2 flex flex-col justify-between min-h-[110px] sm:min-h-[125px] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  {/* Actions absolute top-1 right-1 */}
                  <div className="absolute top-1 right-1 flex items-center gap-0.5">
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setIsDialogOpen(true);
                      }}
                      className="h-5 w-5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                    >
                      <Edit2 className="h-2.5 w-2.5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="h-5 w-5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center bg-slate-50 border border-slate-100"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>

                  <div className="space-y-0.5 pr-9">
                    <span className="text-[7px] font-black uppercase text-primary/70 tracking-tight block">
                      {item.code || "-"}
                    </span>
                    <h4 className="text-[9px] sm:text-[10px] font-black text-slate-900 uppercase italic line-clamp-2 leading-tight">
                      {item.nama}
                    </h4>
                  </div>

                  <div className="space-y-1 pt-1.5 border-t border-slate-100/60 mt-1">
                    {/* Category */}
                    <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[6px] sm:text-[7px] font-black uppercase tracking-wider text-slate-600 truncate max-w-full">
                      {item.kategori || "General"}
                    </span>
                    {/* Prices */}
                    <div className="text-[8px] sm:text-[9px] font-bold text-slate-800 tabular-nums italic">
                      Rp {formatNumber(item.hargaJual).toLocaleString('id-ID')}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-3 py-20 text-center">
                <h3 className="text-xs font-black text-slate-900 uppercase italic">Katalog Belum Tersedia</h3>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
