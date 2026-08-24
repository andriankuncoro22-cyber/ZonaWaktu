"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save,
  ClipboardList,
  Utensils,
  Layers,
  Boxes,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, deleteDoc, setDoc } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError, type SecurityRuleContext } from "@/firebase/errors";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface Ingredient {
  bahanBakuId: string;
  jumlah: number;
}

interface Recipe {
  id: string;
  produkId?: string;
  namaPelengkap?: string;
  type?: 'produk' | 'pelengkap';
  komposisi: Ingredient[];
}

const CATEGORY_STYLES: { [key: string]: string } = {
  "Coffee Series": "border-l-[6px] border-l-amber-700 bg-amber-50/20",
  "Teh Tarik Bakar": "border-l-[6px] border-l-primary bg-primary/5",
  "Milk Based": "border-l-[6px] border-l-sky-500 bg-sky-50/20",
  "Smoothies": "border-l-[6px] border-l-emerald-500 bg-emerald-50/20",
  "Hot Variant": "border-l-[6px] border-l-rose-500 bg-rose-50/20",
  "Matcha Premium": "border-l-[6px] border-l-green-600 bg-green-50/20",
  "default": "border-l-[6px] border-l-slate-200 bg-slate-50/30",
  "pelengkap": "border-l-[6px] border-l-slate-900 bg-slate-50/50"
};

export default function ResepProdukPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const productsQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const materialsQuery = useMemoFirebase(() => collection(db, "bahan-baku"), [db]);
  const recipesQuery = useMemoFirebase(() => collection(db, "resep"), [db]);

  const { data: products } = useCollection(productsQuery);
  const { data: materials } = useCollection(materialsQuery);
  const { data: recipes, loading: loadingRecipes } = useCollection(recipesQuery);
  
  const [activeTab, setActiveTab] = useState("produk");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("all");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [localRecipes, setLocalRecipes] = useState<Recipe[]>([]);
  
  const [selectedProductId, setSelectedProductId] = useState("");
  const [namaPelengkap, setNamaPelengkap] = useState("");
  const [composition, setComposition] = useState<Ingredient[]>([{ bahanBakuId: "", jumlah: 0 }]);

  const sortedProductsForSelect = useMemo(() => {
    if (!products) return [];
    return [...products].sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));
  }, [products]);

  const sortedMaterialsForSelect = useMemo(() => {
    if (!materials) return [];
    return [...materials].sort((a: any, b: any) => (a.nama || "").localeCompare(b.nama || ""));
  }, [materials]);

  useEffect(() => {
    if (recipes) {
      queueMicrotask(() => {
        setLocalRecipes(recipes as Recipe[]);
      });
    }
  }, [recipes]);

  const recipeList = useMemo(() => {
    return ((localRecipes.length > 0 ? localRecipes : recipes) as Recipe[]) || [];
  }, [localRecipes, recipes]);

  const getProductRecipe = (productId: string) => {
    return recipeList.find(r => (r.produkId === productId && (r.type === 'produk' || !r.type))) as Recipe | undefined;
  };

  // Filter resep pelengkap (Tab 2) berdasarkan tipe, search, dan filter bahan baku
  const filteredPelengkapRecipes = useMemo(() => {
    return recipeList.filter(r => {
      if (r.type !== 'pelengkap') return false;

      // Filter Bahan Baku
      if (selectedMaterialId && selectedMaterialId !== "all") {
        const hasMaterial = r.komposisi?.some(c => c.bahanBakuId === selectedMaterialId);
        if (!hasMaterial) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        return r.namaPelengkap?.toLowerCase().includes(search);
      }

      return true;
    });
  }, [recipeList, searchTerm, selectedMaterialId]);

  // List Produk untuk Tab 1 (Resep Produk) terfilter berdasarkan search & bahan baku
  const sortedAndFilteredProducts = useMemo(() => {
    if (activeTab !== 'produk') return [];

    return (products as any[])
      ?.filter(product => {
        // Search term check
        const search = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm.trim() || 
          product.nama?.toLowerCase().includes(search) ||
          product.code?.toLowerCase().includes(search);

        if (!matchesSearch) return false;

        // Material filter check
        if (selectedMaterialId && selectedMaterialId !== "all") {
          const recipe = getProductRecipe(product.id);
          if (!recipe) return false;
          const hasMaterial = recipe.komposisi?.some(c => c.bahanBakuId === selectedMaterialId);
          if (!hasMaterial) return false;
        }

        return true;
      })
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  }, [products, searchTerm, activeTab, selectedMaterialId, recipeList]);

  const selectedMaterialDetail = useMemo(() => {
    if (!selectedMaterialId || selectedMaterialId === "all") return null;
    return materials?.find(m => m.id === selectedMaterialId);
  }, [materials, selectedMaterialId]);

  const getMaterialDetail = (id: string) => {
    return materials?.find(m => m.id === id);
  };

  const handleAddIngredient = () => {
    setComposition([...composition, { bahanBakuId: "", jumlah: 0 }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setComposition(composition.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof Ingredient, value: any) => {
    const newComposition = [...composition];
    newComposition[index] = { ...newComposition[index], [field]: value };
    setComposition(newComposition);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const formType = editingRecipe?.type === 'pelengkap' ? 'pelengkap' : activeTab;
    const normalizedComposition = composition
      .filter((c) => c.bahanBakuId)
      .map((c) => ({
        bahanBakuId: c.bahanBakuId,
        jumlah: Number(c.jumlah) || 0,
      }));

    const data: any = {
      type: formType,
      komposisi: normalizedComposition
    };

    if (formType === 'produk') {
      data.produkId = selectedProductId;
      delete data.namaPelengkap;
    } else {
      data.namaPelengkap = namaPelengkap.trim();
      delete data.produkId;
    }

    try {
      if (editingRecipe) {
        const docRef = doc(db, "resep", editingRecipe.id);
        await setDoc(docRef, data, { merge: true });
        setLocalRecipes(prev => prev.map((recipe) =>
          recipe.id === editingRecipe.id ? { ...recipe, ...data, id: editingRecipe.id } : recipe
        ));
        toast({ title: "Resep diperbarui", description: "Perubahan resep telah disimpan." });
      } else {
        const docRef = doc(collection(db, "resep"));
        await setDoc(docRef, data);
        setLocalRecipes(prev => [{ ...data, id: docRef.id } as Recipe, ...prev]);
        toast({ title: "Resep dibuat", description: "Resep baru telah berhasil ditambahkan." });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      const targetPath = editingRecipe
        ? doc(db, "resep", editingRecipe.id).path
        : collection(db, "resep").path;
      const permissionError = new FirestorePermissionError({
        path: targetPath,
        operation: editingRecipe ? 'update' : 'create',
        requestResourceData: data,
      } satisfies SecurityRuleContext);
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const resetForm = () => {
    setEditingRecipe(null);
    setSelectedProductId("");
    setNamaPelengkap("");
    setComposition([{ bahanBakuId: "", jumlah: 0 }]);
  };

  const openEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setActiveTab(recipe.type === 'pelengkap' ? 'pelengkap' : 'produk');

    if (recipe.type === 'pelengkap') {
      setNamaPelengkap(recipe.namaPelengkap || "");
      setSelectedProductId("");
    } else {
      setSelectedProductId(recipe.produkId || "");
      setNamaPelengkap("");
    }

    setComposition((recipe.komposisi || []).map((item: Ingredient) => ({ ...item })));
    if (!recipe.komposisi?.length) {
      setComposition([{ bahanBakuId: "", jumlah: 0 }]);
    }
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Hapus resep ini?")) return;
    
    const docRef = doc(db, "resep", id);
    deleteDoc(docRef)
      .then(() => {
        toast({ title: "Resep dihapus", variant: "destructive" });
      })
      .catch(async () => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const toTitleCase = (str: string) => {
    if (!str) return "-";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
  };

  const getPricePerSmallUnitGlobal = (mat: any) => {
    if (!mat) return 0;
    const explicitPriceKecil = Number(mat.hargaSatuanKecil || 0);
    if (explicitPriceKecil > 0) return explicitPriceKecil;
    const conversionRate = Number(mat.qtyKecil || 1);
    const unitPrice = Number(mat.currentPrice ?? mat.avgPrice ?? mat.hargaBeliSatuanBesar ?? 0);
    return conversionRate > 0 ? unitPrice / conversionRate : 0;
  };

  const buildExportData = () => {
    const allRows: any[] = [];

    // --- Tab Produk ---
    sortedAndFilteredProducts?.forEach((product: any) => {
      const recipe = getProductRecipe(product.id);
      if (!recipe || !recipe.komposisi?.length) {
        allRows.push({
          Tipe: "Produk",
          Kode: product.code || "-",
          "Nama Produk / Pelengkap": toTitleCase(product.nama),
          Kategori: product.kategori || "-",
          "No": "-",
          "Kode Bahan": "-",
          "Nama Bahan": "Belum ada resep",
          "Qty": "-",
          "Satuan": "-",
          "Harga Satuan (Rp)": 0,
          "Total Harga (Rp)": 0,
          "Total HPP (Rp)": 0,
        });
        return;
      }

      let totalHpp = 0;
      recipe.komposisi.forEach((comp: any, idx: number) => {
        const mat = getMaterialDetail(comp.bahanBakuId);
        const hargaSatuan = getPricePerSmallUnitGlobal(mat);
        const totalHarga = hargaSatuan * Number(comp.jumlah || 0);
        totalHpp += totalHarga;

        allRows.push({
          Tipe: idx === 0 ? "Produk" : "",
          Kode: idx === 0 ? (product.code || "-") : "",
          "Nama Produk / Pelengkap": idx === 0 ? toTitleCase(product.nama) : "",
          Kategori: idx === 0 ? (product.kategori || "-") : "",
          "No": idx + 1,
          "Kode Bahan": mat?.code || "-",
          "Nama Bahan": toTitleCase(mat?.nama),
          "Qty": comp.jumlah,
          "Satuan": mat?.satuanKecil || "-",
          "Harga Satuan (Rp)": hargaSatuan,
          "Total Harga (Rp)": totalHarga,
          "Total HPP (Rp)": idx === recipe.komposisi.length - 1 ? totalHpp : "",
        });
      });

      // Blank row separator
      allRows.push({});
    });

    // --- Tab Pelengkap ---
    filteredPelengkapRecipes.forEach((recipe: any) => {
      if (!recipe.komposisi?.length) {
        allRows.push({
          Tipe: "Pelengkap",
          Kode: "PELENGKAP",
          "Nama Produk / Pelengkap": toTitleCase(recipe.namaPelengkap || "Tanpa Nama"),
          Kategori: "Resep Internal",
          "No": "-",
          "Kode Bahan": "-",
          "Nama Bahan": "Belum ada komposisi",
          "Qty": "-",
          "Satuan": "-",
          "Harga Satuan (Rp)": 0,
          "Total Harga (Rp)": 0,
          "Total HPP (Rp)": 0,
        });
        return;
      }

      let totalHpp = 0;
      recipe.komposisi.forEach((comp: any, idx: number) => {
        const mat = getMaterialDetail(comp.bahanBakuId);
        const hargaSatuan = getPricePerSmallUnitGlobal(mat);
        const totalHarga = hargaSatuan * Number(comp.jumlah || 0);
        totalHpp += totalHarga;

        allRows.push({
          Tipe: idx === 0 ? "Pelengkap" : "",
          Kode: idx === 0 ? "PELENGKAP" : "",
          "Nama Produk / Pelengkap": idx === 0 ? toTitleCase(recipe.namaPelengkap || "Tanpa Nama") : "",
          Kategori: idx === 0 ? "Resep Internal" : "",
          "No": idx + 1,
          "Kode Bahan": mat?.code || "-",
          "Nama Bahan": toTitleCase(mat?.nama),
          "Qty": comp.jumlah,
          "Satuan": mat?.satuanKecil || "-",
          "Harga Satuan (Rp)": hargaSatuan,
          "Total Harga (Rp)": totalHarga,
          "Total HPP (Rp)": idx === recipe.komposisi.length - 1 ? totalHpp : "",
        });
      });

      allRows.push({});
    });

    return allRows;
  };

  const handleDownloadExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = buildExportData();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column width
    ws['!cols'] = [
      { wch: 10 }, // Tipe
      { wch: 12 }, // Kode
      { wch: 30 }, // Nama
      { wch: 18 }, // Kategori
      { wch: 5  }, // No
      { wch: 12 }, // Kode Bahan
      { wch: 28 }, // Nama Bahan
      { wch: 8  }, // Qty
      { wch: 10 }, // Satuan
      { wch: 18 }, // Harga Satuan
      { wch: 18 }, // Total Harga
      { wch: 18 }, // Total HPP
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resep Produk");
    XLSX.writeFile(wb, `Resep_Produk_ZonaWaktu_${new Date().toLocaleDateString("id-ID").replace(/\//g, "-")}.xlsx`);
  };

  const handleDownloadPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date();
    const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    // Header
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RESEP PRODUK — ZONA WAKTU", 14, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Dicetak: ${dateStr}`, 14, 17);
    doc.setTextColor(30, 41, 59);

    // --- Produk Recipes ---
    let startY = 28;

    const allProductsWithRecipes = (sortedAndFilteredProducts || []);
    const allPelengkap = filteredPelengkapRecipes;

    const buildProdukSection = (product: any, recipe: any, startYPos: number) => {
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(14, startYPos, pageWidth - 28, 10, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`[${product.code || "-"}]  ${toTitleCase(product.nama)}`, 18, startYPos + 6.5);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(product.kategori || "-", pageWidth - 18, startYPos + 6.5, { align: "right" });

      if (!recipe || !recipe.komposisi?.length) {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("Belum ada resep.", 18, startYPos + 18);
        return startYPos + 24;
      }

      let totalHpp = 0;
      const tableBody: any[][] = recipe.komposisi.map((comp: any, idx: number) => {
        const mat = getMaterialDetail(comp.bahanBakuId);
        const hargaSatuan = getPricePerSmallUnitGlobal(mat);
        const totalHarga = hargaSatuan * Number(comp.jumlah || 0);
        totalHpp += totalHarga;
        return [
          idx + 1,
          mat?.code || "-",
          toTitleCase(mat?.nama),
          comp.jumlah,
          mat?.satuanKecil || "-",
          `Rp ${hargaSatuan.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`,
          `Rp ${totalHarga.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`,
        ];
      });

      let finalY = startYPos + 10;
      autoTable(doc, {
        startY: finalY,
        head: [["No", "Kode", "Nama Bahan", "Qty", "Satuan", "Harga/Satuan", "Total Harga"]],
        body: tableBody,
        foot: [["", "", "", "", "", "Total HPP:", `Rp ${totalHpp.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`]],
        margin: { left: 14, right: 14 },
        styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59] },
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold", fontSize: 7 },
        footStyles: { fillColor: [241, 245, 249], textColor: [99, 102, 241], fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 18 },
          2: { cellWidth: "auto" },
          3: { cellWidth: 15, halign: "right" },
          4: { cellWidth: 18 },
          5: { cellWidth: 32, halign: "right" },
          6: { cellWidth: 32, halign: "right" },
        },
        didDrawPage: () => {},
      });

      return (doc as any).lastAutoTable.finalY + 8;
    };

    // Section Resep Produk
    if (allProductsWithRecipes.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(99, 102, 241);
      doc.text("▌ RESEP PRODUK", 14, startY);
      startY += 6;

      for (const product of allProductsWithRecipes) {
        const recipe = getProductRecipe(product.id);
        if (startY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          startY = 15;
        }
        startY = buildProdukSection(product, recipe, startY);
      }
    }

    // Section Resep Pelengkap
    if (allPelengkap.length > 0) {
      if (startY > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        startY = 15;
      }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(99, 102, 241);
      doc.text("▌ RESEP PELENGKAP", 14, startY);
      startY += 6;

      for (const recipe of allPelengkap) {
        if (startY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          startY = 15;
        }
        const fakeProduct = {
          code: "PLNGKP",
          nama: recipe.namaPelengkap || "Tanpa Nama",
          kategori: "Resep Internal",
          id: "",
        };
        startY = buildProdukSection(fakeProduct, recipe, startY);
      }
    }

    // Footer on each page
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Halaman ${i} dari ${pageCount}  •  Zona Waktu`, pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: "center" });
    }

    doc.save(`Resep_Produk_ZonaWaktu_${new Date().toLocaleDateString("id-ID").replace(/\//g, "-")}.pdf`);
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">Resep Produk</h1>
          <p className="text-[11px] text-slate-700 font-bold uppercase tracking-[0.2em]">
            Manajemen Komposisi Bahan Baku • Zona Waktu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Download Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 transition-all duration-200"
              title="Download Excel"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 transition-all duration-200"
              title="Download PDF"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
          </div>

        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl bg-primary hover:bg-primary/90 px-8 font-black shadow-xl shadow-primary/20 h-12 uppercase tracking-widest text-[10px] gap-2">
              <Plus className="h-4 w-4" />
              {activeTab === 'produk' ? 'Buat Resep Baru' : 'Buat Resep Pelengkap'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl rounded-[2.5rem] p-10 border-none shadow-2xl overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                {editingRecipe ? "Edit Resep" : (activeTab === 'produk' ? "Tambah Resep Baru" : "Tambah Resep Pelengkap")}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-8 mt-6">
              {activeTab === 'produk' ? (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">Pilih Produk</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId} required>
                    <SelectTrigger className="rounded-xl border-slate-200 h-12 font-medium">
                      <SelectValue placeholder="Pilih produk jadi..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-xl">
                      {sortedProductsForSelect.map((p: any) => (
                        <SelectItem key={p.id} value={p.id} className="rounded-lg">
                          {p.code} - {p.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">Nama Resep Pelengkap</Label>
                  <Input 
                    value={namaPelengkap}
                    onChange={(e) => setNamaPelengkap(e.target.value)}
                    placeholder="Contoh: Base Gula Aren / Sirup Pandan"
                    className="rounded-xl border-slate-200 h-12 font-medium"
                    required
                  />
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-700">Komposisi Bahan</Label>
                  <Button type="button" variant="ghost" onClick={handleAddIngredient} className="text-[10px] font-black text-primary uppercase tracking-widest gap-2">
                    <Plus className="h-3 w-3" /> Tambah Bahan
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {composition.map((item, index) => (
                    <div key={index} className="flex gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100 group transition-all">
                      <div className="flex-1 space-y-2">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Bahan Baku</Label>
                        <Select 
                          value={item.bahanBakuId} 
                          onValueChange={(val) => handleIngredientChange(index, 'bahanBakuId', val)}
                        >
                          <SelectTrigger className="rounded-xl bg-white border-slate-200 h-11 text-xs font-bold">
                            <SelectValue placeholder="Pilih bahan..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-none shadow-xl">
                            {sortedMaterialsForSelect.map((m: any) => (
                              <SelectItem key={m.id} value={m.id} className="rounded-lg">
                                {m.code} - {m.nama}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24 space-y-2">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Qty</Label>
                        <Input 
                          type="number" 
                          step="any"
                          value={item.jumlah} 
                          onChange={(e) => handleIngredientChange(index, 'jumlah', Number(e.target.value))}
                          className="rounded-xl bg-white border-slate-200 h-11 text-xs font-bold"
                        />
                      </div>
                      <div className="w-20 space-y-2">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Satuan</Label>
                        <div className="h-11 flex items-center px-3 bg-white rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-600">
                          {getMaterialDetail(item.bahanBakuId)?.satuanKecil || "-"}
                        </div>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveIngredient(index)}
                        className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Batal</Button>
                <Button type="submit" className="rounded-xl bg-primary px-10 font-black uppercase tracking-widest text-[10px] h-12 shadow-lg shadow-primary/20 gap-2">
                  <Save className="h-4 w-4" />
                  Simpan Resep
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 h-14 w-full max-w-md grid grid-cols-2 gap-2 mb-8">
          <TabsTrigger 
            value="produk" 
            className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
          >
            <Utensils className="h-4 w-4 mr-2" /> Resep Produk
          </TabsTrigger>
          <TabsTrigger 
            value="pelengkap" 
            className="rounded-xl font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
          >
            <Layers className="h-4 w-4 mr-2" /> Resep Pelengkap
          </TabsTrigger>
        </TabsList>

        {/* Filter Controls: Search & Filter Bahan Baku */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-8">
          {/* Search Input */}
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder={activeTab === 'produk' ? "Cari resep produk..." : "Cari resep pelengkap..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border-none shadow-sm rounded-2xl text-xs font-bold outline-none placeholder:text-slate-400 text-slate-900 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Filter Bahan Baku Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-80 shrink-0">
            <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
              <SelectTrigger className="w-full h-11 bg-white border-none shadow-sm rounded-2xl text-xs font-bold text-slate-800">
                <div className="flex items-center gap-2 truncate">
                  <Boxes className="h-4 w-4 text-primary shrink-0" />
                  <SelectValue placeholder="Semua Bahan Baku" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-2xl max-h-72">
                <SelectItem value="all" className="rounded-xl font-bold text-xs">
                  ✨ Semua Bahan Baku
                </SelectItem>
                {sortedMaterialsForSelect.map((m: any) => (
                  <SelectItem key={m.id} value={m.id} className="rounded-xl font-medium text-xs">
                    {m.code ? `[${m.code}] ` : ""}{m.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(selectedMaterialId !== "all" || searchTerm) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedMaterialId("all");
                  setSearchTerm("");
                }}
                className="h-11 px-3 rounded-2xl text-rose-600 hover:bg-rose-50 font-bold text-xs shrink-0"
                title="Reset filter"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Selected Filter Banner Indicator */}
        {selectedMaterialDetail && (
          <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Boxes className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filter Resep Mengandung Bahan Baku:</p>
                <p className="text-xs font-black uppercase text-slate-900 mt-0.5">
                  [{selectedMaterialDetail.code}] {selectedMaterialDetail.nama}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedMaterialId("all")}
              className="text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 rounded-xl"
            >
              Hapus Filter
            </Button>
          </div>
        )}

        <TabsContent value="produk" className="m-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {loadingRecipes ? (
              <div className="col-span-full py-20 text-center flex flex-col items-center gap-4 bg-white rounded-[2.5rem]">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Menyusun Resep...</p>
              </div>
            ) : sortedAndFilteredProducts?.length > 0 ? (
              sortedAndFilteredProducts.map((product) => {
                const recipe = getProductRecipe(product.id);
                const categoryStyle = CATEGORY_STYLES[product.kategori] || CATEGORY_STYLES["default"];
                
                return (
                  <RecipeCard 
                    key={product.id}
                    title={product.nama}
                    code={product.code}
                    subtitle={product.kategori}
                    style={categoryStyle}
                    recipe={recipe}
                    highlightMaterialId={selectedMaterialId}
                    onEdit={() => recipe && openEdit(recipe)}
                    onDelete={() => recipe && handleDelete(recipe.id)}
                    onAdd={() => {
                      setSelectedProductId(product.id);
                      setIsDialogOpen(true);
                    }}
                    getMaterialDetail={getMaterialDetail}
                    toTitleCase={toTitleCase}
                  />
                );
              })
            ) : (
              <EmptyState icon={<Utensils className="h-16 w-16" />} message="Tidak ada produk ditemukan untuk bahan baku ini" />
            )}
          </div>
        </TabsContent>

        <TabsContent value="pelengkap" className="m-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {loadingRecipes ? (
              <div className="col-span-full py-20 text-center flex flex-col items-center gap-4 bg-white rounded-[2.5rem]">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Menyusun Resep...</p>
              </div>
            ) : filteredPelengkapRecipes.length > 0 ? (
              filteredPelengkapRecipes.map((recipe) => (
                <RecipeCard 
                  key={recipe.id}
                  title={recipe.namaPelengkap || "Tanpa Nama"}
                  code="PELENGKAP"
                  subtitle="RESEP INTERNAL"
                  style={CATEGORY_STYLES["pelengkap"]}
                  recipe={recipe}
                  highlightMaterialId={selectedMaterialId}
                  onEdit={() => openEdit(recipe)}
                  onDelete={() => handleDelete(recipe.id)}
                  getMaterialDetail={getMaterialDetail}
                  toTitleCase={toTitleCase}
                />
              ))
            ) : (
              <EmptyState icon={<Layers className="h-16 w-16" />} message="Belum ada resep pelengkap ditemukan untuk bahan baku ini" />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecipeCard({ 
  title, 
  code, 
  subtitle, 
  style, 
  recipe, 
  highlightMaterialId,
  onEdit, 
  onDelete, 
  onAdd, 
  getMaterialDetail, 
  toTitleCase 
}: any) {
  const getPricePerSmallUnit = (mat: any) => {
    if (!mat) return 0;
    const explicitPriceKecil = Number(mat.hargaSatuanKecil || 0);
    if (explicitPriceKecil > 0) return explicitPriceKecil;

    const conversionRate = Number(mat.qtyKecil || 1);
    const unitPrice = Number(mat.currentPrice ?? mat.avgPrice ?? mat.hargaBeliSatuanBesar ?? 0);
    return conversionRate > 0 ? unitPrice / conversionRate : 0;
  };

  const totalHpp = recipe ? recipe.komposisi.reduce((sum: number, comp: any) => {
    const mat = getMaterialDetail(comp.bahanBakuId);
    return sum + (getPricePerSmallUnit(mat) * Number(comp.jumlah || 0));
  }, 0) : 0;

  return (
    <Card 
      className={cn(
        "border-none shadow-sm rounded-[2.5rem] overflow-hidden group hover:shadow-xl transition-all duration-500",
        style
      )}
    >
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-[10px] font-black text-primary tracking-tighter uppercase">
                {code || "No Code"}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">
              {toTitleCase(title)}
            </h3>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/80 shadow-sm text-slate-700 border border-slate-100">
                {subtitle || "Uncategorized"}
              </span>
            </div>
          </div>
          
          <div className="flex gap-2 self-end sm:self-start">
            {recipe && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onEdit}
                  className="h-9 w-9 rounded-xl bg-white/60 text-slate-700 hover:text-primary transition-colors border border-white/40 shadow-sm"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onDelete}
                  className="h-9 w-9 rounded-xl bg-rose-50/60 text-rose-600 hover:bg-rose-100 transition-colors border border-rose-100/40 shadow-sm"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-5 border border-white/60">
          <div className="flex items-center gap-2 mb-4">
            <Utensils className="h-4 w-4 text-primary" />
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Komposisi Bahan</h4>
          </div>
          
          {recipe && recipe.komposisi.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/50">
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-700">Bahan</th>
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-700 text-right">Harga / Rincian</th>
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-700 text-right">Qty</th>
                    <th className="pb-3 pl-3 text-[9px] font-black uppercase tracking-widest text-slate-700">Satuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {recipe.komposisi.map((comp: any, idx: number) => {
                    const mat = getMaterialDetail(comp.bahanBakuId);
                    const isHighlighted = highlightMaterialId && highlightMaterialId !== "all" && comp.bahanBakuId === highlightMaterialId;

                    return (
                      <tr 
                        key={idx} 
                        className={cn(
                          "group/row transition-colors",
                          isHighlighted ? "bg-primary/10 font-bold" : ""
                        )}
                      >
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-primary/60 mb-0.5">
                              {mat?.code || "-"}
                            </span>
                            <span className={cn("text-xs font-semibold", isHighlighted ? "text-primary font-black" : "text-slate-800")}>
                              {toTitleCase(mat?.nama)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-xs font-semibold text-slate-600 tabular-nums">
                            Rp {(getPricePerSmallUnit(mat) * comp.jumlah).toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={cn("text-xs tabular-nums", isHighlighted ? "font-black text-primary" : "font-black text-slate-900")}>
                            {comp.jumlah}
                          </span>
                        </td>
                        <td className="py-3 pl-3">
                          <span className="text-[10px] font-bold text-slate-700 uppercase">{mat?.satuanKecil || "-"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200/50 font-black">
                    <td className="py-3 text-[9px] font-black uppercase tracking-widest text-slate-700">Total HPP Resep:</td>
                    <td className="py-3 text-right text-xs font-black text-primary tabular-nums">
                      Rp {totalHpp.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <ClipboardList className="h-6 w-6 text-slate-200 mx-auto mb-3" />
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Belum ada resep</p>
              {onAdd && (
                <Button 
                  variant="ghost" 
                  onClick={onAdd}
                  className="mt-2 text-[9px] font-black text-primary uppercase h-auto p-0"
                >
                  Klik untuk membuat
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ icon, message }: any) {
  return (
    <div className="col-span-full py-40 text-center bg-white rounded-[3rem]">
      <div className="text-slate-200 mx-auto mb-6 flex justify-center">{icon}</div>
      <h3 className="text-sm font-black text-slate-900 uppercase italic">{message}</h3>
    </div>
  );
}
