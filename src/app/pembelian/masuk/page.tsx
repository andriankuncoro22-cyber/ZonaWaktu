
"use client";

import React, { useState } from "react";
import { ShoppingCart, Plus, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore } from "@/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function PembelianMasukPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [form, setForm] = useState({ nomorNota: "", supplier: "", tanggal: "", keterangan: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nomorNota.trim()) {
      toast({ variant: "destructive", title: "Input Tidak Lengkap", description: "Nomor nota wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "pembelian_masuk"), {
        nomorNota: form.nomorNota.trim(),
        supplier: form.supplier.trim(),
        tanggal: form.tanggal || new Date().toISOString().split("T")[0],
        keterangan: form.keterangan.trim(),
        createdAt: serverTimestamp(),
      });
      toast({ title: "Pembelian Tercatat", description: "Data pembelian berhasil disimpan ke Firestore." });
      setForm({ nomorNota: "", supplier: "", tanggal: "", keterangan: "" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat mencatat pembelian." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pembelian Bahan Baku</h1>
          <p className="text-slate-500">Catat setiap bahan baku yang masuk dari supplier.</p>
        </div>
      </div>

      <Card className="rounded-3xl border-none bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nomor Nota</Label>
            <Input value={form.nomorNota} onChange={(e) => setForm({ ...form, nomorNota: e.target.value })} required placeholder="INV/2026/001" />
          </div>
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Nama supplier" />
          </div>
          <div className="space-y-2">
            <Label>Tanggal</Label>
            <Input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Keterangan</Label>
            <Input value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} placeholder="Catatan pembelian" />
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Pembelian
          </Button>
        </form>
      </Card>
    </div>
  );
}
