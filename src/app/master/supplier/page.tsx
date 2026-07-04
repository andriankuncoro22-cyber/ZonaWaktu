"use client";

import React, { useState } from "react";
import { Truck, Plus, Save, Trash2, Edit2, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface Supplier {
  id: string;
  nama: string;
  kontak: string;
  telepon: string;
  alamat: string;
}

export default function SupplierPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [form, setForm] = useState({ nama: "", kontak: "", telepon: "", alamat: "" });
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const suppliersQuery = useMemoFirebase(() => query(collection(db, "supplier"), orderBy("nama", "asc")), [db]);
  const { data: suppliers, loading } = useCollection(suppliersQuery);

  const resetForm = () => {
    setForm({ nama: "", kontak: "", telepon: "", alamat: "" });
    setEditingSupplier(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama.trim()) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Nama supplier wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nama: form.nama.trim(),
        kontak: form.kontak.trim(),
        telepon: form.telepon.trim(),
        alamat: form.alamat.trim(),
        updatedAt: serverTimestamp(),
      };

      if (editingSupplier) {
        await updateDoc(doc(db, "supplier", editingSupplier.id), payload);
        toast({ title: "Supplier Diperbarui", description: "Data supplier berhasil disimpan." });
      } else {
        await addDoc(collection(db, "supplier"), { ...payload, createdAt: serverTimestamp() });
        toast({ title: "Supplier Disimpan", description: "Supplier baru berhasil ditambahkan." });
      }

      resetForm();
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan supplier." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus supplier ini?")) return;
    try {
      await deleteDoc(doc(db, "supplier", id));
      toast({ title: "Supplier Dihapus", description: "Data supplier telah dihapus." });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menghapus", description: "Tidak dapat menghapus supplier." });
    }
  };

  const filteredSuppliers = (suppliers as Supplier[] | undefined)?.filter((item) =>
    item.nama?.toLowerCase().includes(search.toLowerCase()) ||
    item.kontak?.toLowerCase().includes(search.toLowerCase()) ||
    item.telepon?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daftar Supplier</h1>
          <p className="text-slate-500">Kelola informasi kontak dan data pemasok bahan baku.</p>
        </div>
        <Button className="gap-2" onClick={resetForm}>
          <Plus className="h-4 w-4" />
          Tambah Supplier
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-3xl border-none bg-white p-6 shadow-sm">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari supplier..."
              className="pl-10"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data...
            </div>
          ) : filteredSuppliers?.length ? (
            <div className="space-y-3">
              {filteredSuppliers.map((supplier) => (
                <div key={supplier.id} className="flex items-start justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{supplier.nama}</p>
                    <p className="text-sm text-slate-500">{supplier.kontak || "-"}</p>
                    <p className="text-sm text-slate-500">{supplier.telepon || "-"}</p>
                    <p className="text-xs text-slate-400">{supplier.alamat || "-"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingSupplier(supplier); setForm({ nama: supplier.nama, kontak: supplier.kontak, telepon: supplier.telepon, alamat: supplier.alamat }); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier.id)}>
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Belum ada supplier tersimpan.
            </div>
          )}
        </Card>

        <Card className="rounded-3xl border-none bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">{editingSupplier ? "Edit Supplier" : "Tambah Supplier"}</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Supplier</Label>
              <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required placeholder="Contoh: CV Bahan Sejahtera" />
            </div>
            <div className="space-y-2">
              <Label>Kontak Person</Label>
              <Input value={form.kontak} onChange={(e) => setForm({ ...form, kontak: e.target.value })} placeholder="Nama PIC" />
            </div>
            <div className="space-y-2">
              <Label>Nomor Telepon</Label>
              <Input value={form.telepon} onChange={(e) => setForm({ ...form, telepon: e.target.value })} placeholder="08xxxxxxxx" />
            </div>
            <div className="space-y-2">
              <Label>Alamat</Label>
              <Input value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} placeholder="Alamat supplier" />
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