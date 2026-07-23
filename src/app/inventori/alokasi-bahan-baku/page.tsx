"use client";

import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { 
  Search, 
  Boxes, 
  GitMerge, 
  AlertCircle, 
  ClipboardCheck, 
  X, 
  ChevronRight,
  Info,
  Database,
  ArrowRight,
  HelpCircle,
  FolderOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types matching Firestore collections
interface BahanBaku {
  id: string;
  code: string;
  nama: string;
  qtyBesar: number;
  satuanBesar: string;
  qtyKecil: number;
  satuanKecil: string;
  satuanKalibrasi?: "Gram" | "Pcs";
  currentPrice?: number;
  avgPrice?: number;
  hargaBeliSatuanBesar?: number;
  hargaSatuanKecil?: number;
}

interface Product {
  id: string;
  code: string;
  nama: string;
  kategori: string;
  hargaJual: number;
  hargaDasar: number;
}

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

// Map product category to beautiful card/pill background & text colors
const getCategoryPillStyles = (category: string) => {
  const cat = (category || "").toLowerCase();
  
  if (cat.includes("hot coffee") || cat.includes("hot coffe")) {
    // Hot Coffee specific theme (Crimson red)
    return "bg-red-50 text-red-800 border-red-200/60";
  }
  if (cat.includes("coffee")) {
    // Amber / Coffee brown theme
    return "bg-amber-50 text-amber-800 border-amber-200/60";
  }
  if (cat.includes("smoothie")) {
    // Emerald green theme
    return "bg-emerald-50 text-emerald-800 border-emerald-200/60";
  }
  if (cat.includes("toast")) {
    // Warm orange / peach theme
    return "bg-orange-50 text-orange-800 border-orange-200/60";
  }
  if (cat.includes("pistachio")) {
    // Lime / bright pistachio green theme
    return "bg-lime-50 text-lime-900 border-lime-200/60";
  }
  if (cat.includes("matcha")) {
    // Forest / matcha green theme
    return "bg-green-50 text-green-900 border-green-200/60";
  }
  if (cat.includes("teh") || cat.includes("tea")) {
    // Teal / tea theme
    return "bg-teal-50 text-teal-800 border-teal-200/60";
  }
  if (cat.includes("milk")) {
    // Sky blue theme
    return "bg-sky-50 text-sky-800 border-sky-200/60";
  }
  if (cat.includes("hot") || cat.includes("variant")) {
    // Warm rose red theme
    return "bg-rose-50 text-rose-800 border-rose-200/60";
  }
  
  // Default neutral slate theme
  return "bg-slate-50 text-slate-700 border-slate-200/60";
};

export default function AlokasiBahanBakuPage() {
  const db = useFirestore();

  // Load collections from Firestore
  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("code", "asc")), [db]);
  const { data: materials, loading: loadingMaterials } = useCollection(materialsQuery);

  const productsQuery = useMemoFirebase(() => collection(db, "produk"), [db]);
  const { data: products, loading: loadingProducts } = useCollection(productsQuery);

  const recipesQuery = useMemoFirebase(() => collection(db, "resep"), [db]);
  const { data: recipes, loading: loadingRecipes } = useCollection(recipesQuery);

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "used" | "unused">("all");
  const [selectedCategory, setSelectedCategory] = useState("Semua Kategori");
  const [selectedMaterial, setSelectedMaterial] = useState<BahanBaku | null>(null);

  // Helper to calculate price per small unit of material
  const getPricePerSmallUnit = (mat: any) => {
    if (!mat) return 0;
    const explicitPriceKecil = Number(mat.hargaSatuanKecil || 0);
    if (explicitPriceKecil > 0) return explicitPriceKecil;

    const conversionRate = Number(mat.qtyKecil || 1);
    const unitPrice = Number(mat.currentPrice ?? mat.avgPrice ?? mat.hargaBeliSatuanBesar ?? 0);
    return conversionRate > 0 ? unitPrice / conversionRate : 0;
  };

  const formatUnitName = (unit?: string) => {
    if (!unit) return "pcs";
    const u = unit.trim().toLowerCase();
    if (u === "gram" || u === "g" || u === "gr") return "gr";
    if (u === "milliliter" || u === "ml" || u === "mili") return "ml";
    if (u === "piece" || u === "pcs" || u === "pc") return "pcs";
    return unit;
  };

  // Build the allocation mapping
  const allocationMap = useMemo(() => {
    if (!materials || !recipes || !products) return {};

    const map: Record<string, {
      productRecipes: {
        recipeId: string;
        productId: string;
        productCode: string;
        productName: string;
        productCategory: string;
        amount: number;
        unitName: string;
        unitPrice: number;
        cost: number;
      }[];
      pelengkapRecipes: {
        recipeId: string;
        namaPelengkap: string;
        amount: number;
        unitName: string;
        unitPrice: number;
        cost: number;
      }[];
      totalUses: number;
    }> = {};

    // Initialize map
    materials.forEach((mat: any) => {
      map[mat.id] = {
        productRecipes: [],
        pelengkapRecipes: [],
        totalUses: 0,
      };
    });

    // Populate usage from recipes
    recipes.forEach((recipe: any) => {
      const isProduct = recipe.type === 'produk' || (!recipe.type && recipe.produkId);
      const isPelengkap = recipe.type === 'pelengkap';

      if (isProduct && recipe.produkId) {
        const prod = (products as Product[]).find((p) => p.id === recipe.produkId);
        if (prod) {
          (recipe.komposisi || []).forEach((comp: any) => {
            if (comp.bahanBakuId && map[comp.bahanBakuId]) {
              const mat = (materials as BahanBaku[]).find((m) => m.id === comp.bahanBakuId);
              const pricePerSmallUnit = getPricePerSmallUnit(mat);
              const amount = Number(comp.jumlah || 0);
              const unitName = formatUnitName(comp.satuan || mat?.satuanKecil || mat?.satuanKalibrasi || "pcs");
              const cost = pricePerSmallUnit * amount;

              if (!map[comp.bahanBakuId].productRecipes.some(r => r.recipeId === recipe.id)) {
                map[comp.bahanBakuId].productRecipes.push({
                  recipeId: recipe.id,
                  productId: prod.id,
                  productCode: prod.code || "-",
                  productName: prod.nama || "-",
                  productCategory: prod.kategori || "Coffee Series",
                  amount: amount,
                  unitName: unitName,
                  unitPrice: pricePerSmallUnit,
                  cost: Math.round(cost),
                });
                map[comp.bahanBakuId].totalUses++;
              }
            }
          });
        }
      } else if (isPelengkap && recipe.namaPelengkap) {
        (recipe.komposisi || []).forEach((comp: any) => {
          if (comp.bahanBakuId && map[comp.bahanBakuId]) {
            const mat = (materials as BahanBaku[]).find((m) => m.id === comp.bahanBakuId);
            const pricePerSmallUnit = getPricePerSmallUnit(mat);
            const amount = Number(comp.jumlah || 0);
            const unitName = formatUnitName(comp.satuan || mat?.satuanKecil || mat?.satuanKalibrasi || "pcs");
            const cost = pricePerSmallUnit * amount;

            if (!map[comp.bahanBakuId].pelengkapRecipes.some(r => r.recipeId === recipe.id)) {
              map[comp.bahanBakuId].pelengkapRecipes.push({
                recipeId: recipe.id,
                namaPelengkap: recipe.namaPelengkap,
                amount: amount,
                unitName: unitName,
                unitPrice: pricePerSmallUnit,
                cost: Math.round(cost),
              });
              map[comp.bahanBakuId].totalUses++;
            }
          }
        });
      }
    });

    return map;
  }, [materials, recipes, products]);

  // Categories list extraction
  const categoriesList = useMemo(() => {
    if (!products) return ["Semua Kategori"];

    const cats = new Set<string>();
    products.forEach((p: any) => {
      if (p.kategori) cats.add(p.kategori);
    });

    const hasPelengkap = recipes?.some((r: any) => r.type === "pelengkap");

    const list = ["Semua Kategori", ...Array.from(cats)];
    if (hasPelengkap) {
      list.push("Resep Pelengkap");
    }
    return list;
  }, [products, recipes]);

  // Statistics calculations
  const stats = useMemo(() => {
    if (!materials) return { total: 0, used: 0, unused: 0 };
    
    let usedCount = 0;
    materials.forEach((mat: any) => {
      const allocation = allocationMap[mat.id];
      if (allocation && allocation.totalUses > 0) {
        usedCount++;
      }
    });

    return {
      total: materials.length,
      used: usedCount,
      unused: materials.length - usedCount
    };
  }, [materials, allocationMap]);

  // Filtered materials for rendering
  const filteredMaterials = useMemo(() => {
    if (!materials) return [];

    return (materials as BahanBaku[])
      .filter((mat) => {
        // Search Term Filter
        const nameMatch = mat.nama?.toLowerCase().includes(searchTerm.toLowerCase());
        const codeMatch = mat.code?.toLowerCase().includes(searchTerm.toLowerCase());
        const searchOk = !searchTerm || nameMatch || codeMatch;

        // Status Filter
        const allocation = allocationMap[mat.id];
        const isUsed = allocation && allocation.totalUses > 0;
        let statusOk = true;
        if (filterStatus === "used") statusOk = isUsed;
        if (filterStatus === "unused") statusOk = !isUsed;

        // Category Filter
        let categoryOk = true;
        if (selectedCategory !== "Semua Kategori") {
          if (!allocation) {
            categoryOk = false;
          } else if (selectedCategory === "Resep Pelengkap") {
            categoryOk = allocation.pelengkapRecipes.length > 0;
          } else {
            categoryOk = allocation.productRecipes.some(
              (r) => r.productCategory?.toLowerCase() === selectedCategory.toLowerCase()
            );
          }
        }

        return searchOk && statusOk && categoryOk;
      })
      .sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: 'base' }));
  }, [materials, searchTerm, filterStatus, selectedCategory, allocationMap]);

  const toTitleCase = (str: string) => {
    if (!str) return "-";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
  };

  const isLoading = loadingMaterials || loadingProducts || loadingRecipes;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">Alokasi Bahan Baku</h1>
          <p className="text-[11px] text-slate-700 font-bold uppercase tracking-[0.2em]">
            Pemetaan Penggunaan Bahan Baku pada Resep Produk • Zona Waktu
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-32 text-center flex flex-col items-center gap-4 bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest animate-pulse">Menghubungkan Data...</p>
        </div>
      ) : (
        <>
          {/* Stats Section */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <Card className="border-slate-100/60 shadow-sm rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 bg-white flex items-center gap-2 sm:gap-4 hover:shadow-md transition-all duration-300">
              <div className="p-2 sm:p-3 bg-amber-50 rounded-xl sm:rounded-2xl text-amber-700 shadow-inner shrink-0">
                <Boxes className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] truncate">Total Bahan</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 mt-0.5">{stats.total}</h3>
              </div>
            </Card>

            <Card className="border-slate-100/60 shadow-sm rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 bg-white flex items-center gap-2 sm:gap-4 hover:shadow-md transition-all duration-300">
              <div className="p-2 sm:p-3 bg-emerald-50 rounded-xl sm:rounded-2xl text-emerald-700 shadow-inner shrink-0">
                <GitMerge className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] truncate">Bahan Baku Aktif</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 mt-0.5">{stats.used}</h3>
              </div>
            </Card>

            <Card className="border-slate-100/60 shadow-sm rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 bg-white flex items-center gap-2 sm:gap-4 hover:shadow-md transition-all duration-300">
              <div className="p-2 sm:p-3 bg-rose-50 rounded-xl sm:rounded-2xl text-rose-700 shadow-inner shrink-0">
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] truncate">Belum Digunakan</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 mt-0.5">{stats.unused}</h3>
              </div>
            </Card>

            <Card className="border-slate-100/60 shadow-sm rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-6 bg-white flex items-center gap-2 sm:gap-4 hover:shadow-md transition-all duration-300">
              <div className="p-2 sm:p-3 bg-sky-50 rounded-xl sm:rounded-2xl text-sky-700 shadow-inner shrink-0">
                <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] truncate">Total Resep</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-950 mt-0.5">{recipes?.length || 0}</h3>
              </div>
            </Card>
          </div>

          {/* Filtering Controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
            <div className="flex flex-col sm:flex-row gap-4 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Cari kode atau nama bahan..."
                  className="pl-11 pr-4 rounded-2xl border-slate-200/80 h-11 text-xs font-semibold w-full bg-white shadow-sm focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="w-full sm:w-56 shrink-0">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="rounded-2xl border-slate-200/80 h-11 text-xs font-semibold bg-white shadow-sm focus:ring-primary/20">
                    <SelectValue placeholder="Pilih Kategori..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-xl">
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat} value={cat} className="rounded-lg text-xs font-semibold">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-slate-100/80 backdrop-blur-sm p-1 rounded-2xl flex items-center gap-1 shadow-inner border border-slate-200/20 shrink-0">
              <button
                onClick={() => setFilterStatus("all")}
                className={cn(
                  "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 w-full sm:w-auto text-center",
                  filterStatus === "all" 
                    ? "bg-white text-slate-900 shadow-md font-black scale-[1.02]" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Semua
              </button>
              <button
                onClick={() => setFilterStatus("used")}
                className={cn(
                  "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 w-full sm:w-auto text-center",
                  filterStatus === "used" 
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/10 font-black scale-[1.02]" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Digunakan
              </button>
              <button
                onClick={() => setFilterStatus("unused")}
                className={cn(
                  "rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 w-full sm:w-auto text-center",
                  filterStatus === "unused" 
                    ? "bg-rose-600 text-white shadow-md shadow-rose-500/10 font-black scale-[1.02]" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                Idle
              </button>
            </div>
          </div>

          {/* Card Grid */}
          {filteredMaterials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMaterials.map((mat) => {
                const allocation = allocationMap[mat.id] || { productRecipes: [], pelengkapRecipes: [], totalUses: 0 };
                const productRecipesFiltered = allocation.productRecipes.filter(
                  (r) => selectedCategory === "Semua Kategori" || r.productCategory?.toLowerCase() === selectedCategory.toLowerCase()
                );
                const pelengkapRecipesFiltered = (selectedCategory === "Semua Kategori" || selectedCategory === "Resep Pelengkap")
                  ? allocation.pelengkapRecipes
                  : [];
                const totalFilteredUses = productRecipesFiltered.length + pelengkapRecipesFiltered.length;
                const isUsed = totalFilteredUses > 0;

                return (
                  <Card 
                    key={mat.id} 
                    className="border-slate-100/70 shadow-md hover:shadow-xl hover:scale-[1.01] transition-all duration-300 rounded-[2rem] overflow-hidden bg-white/95 flex flex-col justify-between group"
                  >
                    <div className="p-6 space-y-4">
                      {/* Top Header */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="inline-flex items-center px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[9px] font-black tracking-wider uppercase">
                          {mat.code || "BB-NEW"}
                        </div>
                        {allocation.totalUses > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black tracking-widest uppercase bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Terpakai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black tracking-widest uppercase bg-slate-50 text-slate-400 border border-slate-200/50">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                            Belum Digunakan
                          </span>
                        )}
                      </div>

                      {/* Material Name & Unit */}
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tight mb-1 group-hover:text-primary transition-colors">
                          {toTitleCase(mat.nama)}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          1 {mat.satuanBesar || "-"} = {mat.qtyKecil || 1} {mat.satuanKecil || "-"}
                        </p>
                      </div>

                      {/* Allocation Pills list */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 block">
                          Alokasi Produk/Resep ({selectedCategory === "Semua Kategori" ? allocation.totalUses : `${totalFilteredUses}/${allocation.totalUses}`})
                        </span>
                        <div className="flex flex-wrap gap-1.5 min-h-[50px] items-center">
                          {isUsed ? (
                            <>
                              {productRecipesFiltered.map((r) => (
                                <span 
                                  key={r.recipeId} 
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black border shadow-sm uppercase tracking-wider animate-in fade-in",
                                    getCategoryPillStyles(r.productCategory)
                                  )}
                                  title={`${r.productCode} - ${r.productName} (${r.productCategory}): ${r.amount} ${r.unitName} @ Rp ${r.cost.toLocaleString("id-ID")}`}
                                >
                                  <span>{r.productName}</span>
                                  <span className="font-bold text-[8px] bg-black/5 px-1.5 py-0.5 rounded-md text-slate-800 border border-black/5">
                                    {r.amount} {r.unitName} • Rp {r.cost.toLocaleString("id-ID")}
                                  </span>
                                </span>
                              ))}
                              {pelengkapRecipesFiltered.map((r) => (
                                <span 
                                  key={r.recipeId} 
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black bg-slate-100 text-slate-800 border border-slate-200 shadow-sm uppercase tracking-wider"
                                  title={`Pelengkap: ${r.namaPelengkap}: ${r.amount} ${r.unitName} @ Rp ${r.cost.toLocaleString("id-ID")}`}
                                >
                                  <span>{r.namaPelengkap}</span>
                                  <span className="font-bold text-[8px] bg-slate-200 px-1.5 py-0.5 rounded-md text-slate-800 border border-slate-300">
                                    {r.amount} {r.unitName} • Rp {r.cost.toLocaleString("id-ID")}
                                  </span>
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 font-bold italic opacity-60 w-full text-center">Tidak ada alokasi aktif</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center mt-auto">
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                        Biaya / Unit: Rp {getPricePerSmallUnit(mat).toLocaleString("id-ID", { maximumFractionDigits: 1 })} / {formatUnitName(mat.satuanKecil || mat.satuanKalibrasi)}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedMaterial(mat)}
                        className="rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 text-primary hover:text-primary/80 transition-all font-black text-[9px] uppercase tracking-widest px-3 h-8 gap-1"
                      >
                        Detail
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="py-24 text-center flex flex-col items-center gap-4 bg-white rounded-[2.5rem] border border-slate-100">
              <FolderOpen className="h-16 w-16 text-slate-300" />
              <h3 className="text-sm font-black text-slate-900 uppercase italic">Bahan Baku Tidak Ditemukan</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Silakan ubah kata kunci pencarian atau status filter Anda.
              </p>
            </div>
          )}
        </>
      )}

      {/* Details Dialog */}
      <Dialog open={selectedMaterial !== null} onOpenChange={(open) => { if (!open) setSelectedMaterial(null); }}>
        {selectedMaterial && (
          <DialogContent className="max-w-3xl rounded-[2.5rem] p-10 border-none shadow-2xl overflow-y-auto max-h-[90vh] bg-white text-slate-900">
            <DialogHeader className="flex flex-col justify-between items-start pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{selectedMaterial.code || "BB-NEW"}</span>
                <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                  Detail Alokasi: {selectedMaterial.nama}
                </DialogTitle>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Rincian Penggunaan Resep Terkait & Biaya HPP Satuan
                </p>
              </div>
            </DialogHeader>

            <div className="mt-6 space-y-6">
              {/* Material Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Satuan Besar / Pembelian</span>
                  <span className="text-sm font-black text-slate-800 uppercase block mt-1">{selectedMaterial.satuanBesar || "-"}</span>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Satuan Kecil / Resep</span>
                  <span className="text-sm font-black text-slate-800 uppercase block mt-1">{formatUnitName(selectedMaterial.satuanKecil || selectedMaterial.satuanKalibrasi)}</span>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Rasio Konversi Satuan</span>
                  <span className="text-sm font-black text-slate-800 uppercase block mt-1">1 = {selectedMaterial.qtyKecil || 1} {formatUnitName(selectedMaterial.satuanKecil || selectedMaterial.satuanKalibrasi)}</span>
                </div>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Harga Beli Satuan Besar</span>
                  <span className="text-sm font-black text-slate-800 block mt-1">
                    Rp {Number(selectedMaterial.currentPrice ?? selectedMaterial.avgPrice ?? selectedMaterial.hargaBeliSatuanBesar ?? 0).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Harga Estimasi per {formatUnitName(selectedMaterial.satuanKecil || selectedMaterial.satuanKalibrasi)}</span>
                  <span className="text-sm font-black text-slate-800 block mt-1">
                    Rp {getPricePerSmallUnit(selectedMaterial).toLocaleString("id-ID", { maximumFractionDigits: 2 })} / {formatUnitName(selectedMaterial.satuanKecil || selectedMaterial.satuanKalibrasi)}
                  </span>
                </div>
              </div>

              {/* Mapped Recipes Table */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Alokasi pada Resep Aktif</h4>
                
                {(() => {
                  const allocation = allocationMap[selectedMaterial.id] || { productRecipes: [], pelengkapRecipes: [], totalUses: 0 };
                  const productRecipesFiltered = allocation.productRecipes.filter(
                    (r) => selectedCategory === "Semua Kategori" || r.productCategory?.toLowerCase() === selectedCategory.toLowerCase()
                  );
                  const pelengkapRecipesFiltered = (selectedCategory === "Semua Kategori" || selectedCategory === "Resep Pelengkap")
                    ? allocation.pelengkapRecipes
                    : [];
                  const totalFilteredUses = productRecipesFiltered.length + pelengkapRecipesFiltered.length;
                  
                  if (totalFilteredUses === 0) {
                    return (
                      <div className="py-12 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center bg-slate-50/30">
                        <Info className="h-8 w-8 text-slate-400 mb-2" />
                        <span className="text-xs text-slate-500 font-bold uppercase">Tidak ada alokasi resep untuk kategori &quot;{selectedCategory}&quot;</span>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50">
                            <th className="p-4 text-[9px] font-black uppercase tracking-wider text-slate-700">Nama Resep / Produk</th>
                            <th className="p-4 text-[9px] font-black uppercase tracking-wider text-slate-700">Kategori / Tipe</th>
                            <th className="p-4 text-[9px] font-black uppercase tracking-wider text-slate-700 text-right">Takaran Resep</th>
                            <th className="p-4 text-[9px] font-black uppercase tracking-wider text-slate-700 text-right">Harga & HPP Resep</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {productRecipesFiltered.map((r, i) => (
                            <tr key={`prod-${i}`} className="hover:bg-slate-50/30 transition-colors">
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{r.productCode}</span>
                                  <span className="text-xs font-black text-slate-800 uppercase italic">{r.productName}</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                  getCategoryPillStyles(r.productCategory)
                                )}>
                                  {r.productCategory}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="text-xs font-black text-slate-800">{r.amount} <span className="text-[10px] font-bold text-slate-500 uppercase">{r.unitName}</span></span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-black text-emerald-700">Rp {r.cost.toLocaleString("id-ID")}</span>
                                  <span className="text-[9px] font-bold text-slate-400">@ Rp {r.unitPrice.toLocaleString("id-ID", { maximumFractionDigits: 1 })}/{r.unitName}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                          
                          {pelengkapRecipesFiltered.map((r, i) => (
                            <tr key={`pel-${i}`} className="hover:bg-slate-50/30 transition-colors">
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">RESEP PELENGKAP</span>
                                  <span className="text-xs font-black text-slate-800 uppercase italic">{r.namaPelengkap}</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                                  Resep Pelengkap
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="text-xs font-black text-slate-800">{r.amount} <span className="text-[10px] font-bold text-slate-500 uppercase">{r.unitName}</span></span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-black text-emerald-700">Rp {r.cost.toLocaleString("id-ID")}</span>
                                  <span className="text-[9px] font-bold text-slate-400">@ Rp {r.unitPrice.toLocaleString("id-ID", { maximumFractionDigits: 1 })}/{r.unitName}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => setSelectedMaterial(null)}
                className="rounded-2xl border border-slate-100 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-all font-black text-[10px] uppercase tracking-widest px-8 h-12"
              >
                Tutup
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
