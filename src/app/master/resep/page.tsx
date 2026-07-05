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
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, updateDoc, deleteDoc, query, orderBy, setDoc } from "firebase/firestore";
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
    return [...materials].sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));
  }, [materials]);

  useEffect(() => {
    if (recipes) {
      setLocalRecipes(recipes as Recipe[]);
    }
  }, [recipes]);

  const recipeList = useMemo(() => {
    return ((localRecipes.length > 0 ? localRecipes : recipes) as Recipe[]) || [];
  }, [localRecipes, recipes]);

  // Filter resep berdasarkan tipe dan search
  const filteredRecipes = useMemo(() => {
    return recipeList.filter(r => {
      const typeMatch = activeTab === 'produk' 
        ? (r.type === 'produk' || (!r.type && r.produkId))
        : (r.type === 'pelengkap');
      
      if (!typeMatch) return false;

      const search = searchTerm.toLowerCase();
      if (activeTab === 'produk') {
        const prod = products?.find(p => p.id === r.produkId);
        return prod?.nama?.toLowerCase().includes(search) || prod?.code?.toLowerCase().includes(search);
      } else {
        return r.namaPelengkap?.toLowerCase().includes(search);
      }
    });
  }, [recipeList, activeTab, searchTerm, products]);

  // List Produk untuk Tab 1 (Resep Produk)
  const sortedAndFilteredProducts = useMemo(() => {
    if (activeTab !== 'produk') return [];
    return (products as any[])
      ?.filter(item => 
        item.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  }, [products, searchTerm, activeTab]);

  const getProductRecipe = (productId: string) => {
    return recipeList.find(r => (r.produkId === productId && (r.type === 'produk' || !r.type))) as Recipe | undefined;
  };

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
      .catch(async (err) => {
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

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">Resep Produk</h1>
          <p className="text-[11px] text-slate-700 font-bold uppercase tracking-[0.2em]">
            Manajemen Komposisi Bahan Baku • Zona Waktu
          </p>
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

        <div className="relative w-full md:w-96 group mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder={activeTab === 'produk' ? "Cari resep produk..." : "Cari resep pelengkap..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border-none shadow-sm rounded-2xl text-xs font-bold outline-none placeholder:text-slate-500 text-slate-900 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

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
              <EmptyState icon={<Utensils className="h-16 w-16" />} message="Tidak ada produk ditemukan" />
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
            ) : filteredRecipes.length > 0 ? (
              filteredRecipes.map((recipe) => (
                <RecipeCard 
                  key={recipe.id}
                  title={recipe.namaPelengkap || "Tanpa Nama"}
                  code="PELENGKAP"
                  subtitle="RESEP INTERNAL"
                  style={CATEGORY_STYLES["pelengkap"]}
                  recipe={recipe}
                  onEdit={() => openEdit(recipe)}
                  onDelete={() => handleDelete(recipe.id)}
                  getMaterialDetail={getMaterialDetail}
                  toTitleCase={toTitleCase}
                />
              ))
            ) : (
              <EmptyState icon={<Layers className="h-16 w-16" />} message="Belum ada resep pelengkap" />
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
  onEdit, 
  onDelete, 
  onAdd, 
  getMaterialDetail, 
  toTitleCase 
}: any) {
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
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-700 text-right">Qty</th>
                    <th className="pb-3 pl-3 text-[9px] font-black uppercase tracking-widest text-slate-700">Satuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {recipe.komposisi.map((comp: any, idx: number) => {
                    const mat = getMaterialDetail(comp.bahanBakuId);
                    return (
                      <tr key={idx} className="group/row">
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-primary/60 mb-0.5">
                              {mat?.code || "-"}
                            </span>
                            <span className="text-xs font-semibold text-slate-800">{toTitleCase(mat?.nama)}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-xs font-black text-slate-900 tabular-nums">{comp.jumlah}</span>
                        </td>
                        <td className="py-3 pl-3">
                          <span className="text-[10px] font-bold text-slate-700 uppercase">{mat?.satuanKecil || "-"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
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
