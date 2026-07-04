
"use client";

import React, { useState } from "react";
import { Layers, Plus, Save, Trash2, Edit2, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface Category {
  id: string;
  nama: string;
  deskripsi: string;
}

export default function KategoriBahanPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [form, setForm] = useState({ nama: "", deskripsi: "" });
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const categoriesQuery = useMemoFirebase(() => query(collection(db, "kategori-bahan"), orderBy("nama", "asc")), [db]);
  const { data: categories, loading } = useCollection(categoriesQuery);

  const resetForm = () => {
    setForm({ nama: "", deskripsi: "" });
    setEditingItem(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama.trim()) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Nama kategori wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nama: form.nama.trim(),
        deskripsi: form.deskripsi.trim(),
        updatedAt: serverTimestamp(),
      };
      if (editingItem) {
        await updateDoc(doc(db, "kategori-bahan", editingItem.id), payload);
        toast({ title: "Kategori Diperbarui", description: "Kategori berhasil disimpan." });
      } else {
        await addDoc(collection(db, "kategori-bahan"), { ...payload, createdAt: serverTimestamp() });
        toast({ title: "Kategori Disimpan", description: "Kategori baru berhasil ditambahkan." });
      }
      resetForm();
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan kategori." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus kategori ini?")) return;
    try {
      await deleteDoc(doc(db, "kategori-bahan", id));
      toast({ title: "Kategori Dihapus", description: "Data kategori dihapus." });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menghapus", description: "Tidak dapat menghapus kategori." });
    }
  };

  const filteredCategories = (categories as Category[] | undefined)?.filter((item) => item.nama?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kategori Bahan Baku</h1>
          <p className="text-slate-500">Klasifikasikan bahan baku Anda untuk manajemen yang lebih baik.</p>
        </div>
        <Button className="gap-2" onClick={resetForm}>
          <Plus className="h-4 w-4" />
          Tambah Kategori
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-3xl border-none bg-white p-6 shadow-sm">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kategori..." className="pl-10" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data...</div>
          ) : filteredCategories?.length ? (
            <div className="space-y-3">
              {filteredCategories.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{item.nama}</p>
                    <p className="text-xs text-slate-400">{item.deskripsi || "-"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setForm({ nama: item.nama, deskripsi: item.deskripsi }); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Belum ada kategori tersimpan.</div>
          )}
        </Card>

        <Card className="rounded-3xl border-none bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{editingItem ? "Edit Kategori" : "Tambah Kategori"}</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Kategori</Label>
              <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required placeholder="Contoh: Bahan Mentah" />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Input value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} placeholder="Keterangan tambahan" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Batal</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
