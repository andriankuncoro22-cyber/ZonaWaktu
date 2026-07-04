"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, query, orderBy, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Search, Save, TrendingUp, Package } from "lucide-react";
import { applyPriceUpdate } from "@/lib/hpp";

export default function HargaBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);

  const materialsQuery = useMemoFirebase(() => query(collection(db, "bahan-baku"), orderBy("nama", "asc")), [db]);
  const { data: materials } = useCollection(materialsQuery);

  const filteredMaterials = useMemo(() => {
    return (materials as any[])?.filter((item: any) => {
      const query = searchTerm.toLowerCase();
      return !query || item.nama?.toLowerCase().includes(query) || item.code?.toLowerCase().includes(query);
    }) || [];
  }, [materials, searchTerm]);

  const selectedMaterial = useMemo(() => {
    return filteredMaterials.find((item: any) => item.id === selectedId) || filteredMaterials[0] || null;
  }, [filteredMaterials, selectedId]);

  const handleSelect = (material: any) => {
    setSelectedId(material.id);
    setPriceInput(String(material.currentPrice ?? material.avgPrice ?? material.hargaBeliSatuanBesar ?? 0));
  };

  const handleSave = async () => {
    if (!selectedMaterial) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "bahan-baku", selectedMaterial.id);
      const updated = applyPriceUpdate(selectedMaterial, priceInput);
      batch.update(materialRef, {
        currentPrice: updated.currentPrice,
        avgPrice: updated.avgPrice,
        priceHistory: updated.priceHistory,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: "Harga Diperbarui", description: `${selectedMaterial.nama} sekarang memakai harga rata-rata terbaru.` });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan harga bahan." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 p-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Harga Bahan Baku</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Pantau harga pembelian, rata-rata biaya, dan perubahan harga bahan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="lg:col-span-1 rounded-[2rem] border-none shadow-sm p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">Daftar Bahan</h2>
          </div>
          <div className="relative mb-4">
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari bahan..." className="rounded-2xl" />
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {filteredMaterials.map((material: any) => (
              <button key={material.id} onClick={() => handleSelect(material)} className={`w-full text-left rounded-2xl border p-3 transition ${selectedMaterial?.id === material.id ? "border-primary bg-primary/5" : "border-slate-100 bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-800">{material.nama}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{material.code}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Harga rata-rata: Rp {Number(material.avgPrice || material.currentPrice || 0).toLocaleString("id-ID")}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2 rounded-[2rem] border-none shadow-sm p-4 md:p-6 lg:sticky lg:top-4">
          {selectedMaterial ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Bahan yang dipilih</p>
                  <h2 className="text-2xl font-black text-slate-900">{selectedMaterial.nama}</h2>
                  <p className="text-sm text-slate-500">Kode: {selectedMaterial.code} • Stok: {Number(selectedMaterial.qtyBesar || 0)} {selectedMaterial.satuanBesar || "unit"}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-right">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-amber-700">Harga rata-rata</p>
                  <p className="text-xl font-black text-amber-700">Rp {Number(selectedMaterial.avgPrice || selectedMaterial.currentPrice || 0).toLocaleString("id-ID")}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Harga pembelian saat ini</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} className="pl-10 rounded-2xl h-12" placeholder="0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Perubahan harga</Label>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                    {Array.isArray(selectedMaterial.priceHistory) && selectedMaterial.priceHistory.length > 0 ? selectedMaterial.priceHistory.slice(-3).reverse().map((entry: any, idx: number) => (
                      <div key={idx} className="flex justify-between gap-3 py-1">
                        <span>{new Date(entry.recordedAt || Date.now()).toLocaleDateString("id-ID")}</span>
                        <span className="font-black text-slate-800">Rp {Number(entry.price || 0).toLocaleString("id-ID")}</span>
                      </div>
                    )) : <span>Belum ada riwayat update harga.</span>}
                  </div>
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="rounded-2xl bg-slate-900 text-white px-6 h-12 font-black uppercase tracking-widest gap-2">
                <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan Harga"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <Package className="h-12 w-12 mb-3" />
              <p className="text-sm font-black uppercase tracking-[0.2em]">Belum ada data bahan</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
