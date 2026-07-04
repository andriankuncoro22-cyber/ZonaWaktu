
"use client";

import React, { useState } from "react";
import { Factory, Plus, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore } from "@/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function BatchProduksiPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [form, setForm] = useState({ produk: "", jumlah: "", tanggal: "", keterangan: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.produk.trim() || !form.jumlah.trim()) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Produk dan jumlah wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "produksi_batch"), {
        produk: form.produk.trim(),
        jumlah: Number(form.jumlah),
        tanggal: form.tanggal || new Date().toISOString().split("T")[0],
        keterangan: form.keterangan.trim(),
        createdAt: serverTimestamp(),
      });
      toast({ title: "Batch Produksi Tercatat", description: "Data batch produksi berhasil disimpan ke Firestore." });
      setForm({ produk: "", jumlah: "", tanggal: "", keterangan: "" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat mencatat batch produksi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Batch Produksi</h1>
          <p className="text-slate-500">Kelola proses pembuatan produk jadi.</p>
        </div>
      </div>

      <Card className="rounded-3xl border-none bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nama Produk</Label>
            <Input value={form.produk} onChange={(e) => setForm({ ...form, produk: e.target.value })} required placeholder="Contoh: Kopi Gula Aren" />
          </div>
          <div className="space-y-2">
            <Label>Jumlah Produksi</Label>
            <Input type="number" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: e.target.value })} required placeholder="10" />
          </div>
          <div className="space-y-2">
            <Label>Tanggal</Label>
            <Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Keterangan</Label>
            <Input value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} placeholder="Catatan produksi" />
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Batch
          </Button>
        </form>
      </Card>
    </div>
  );
}
