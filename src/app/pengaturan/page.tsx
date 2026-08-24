"use client";

import React, { useState, useEffect } from "react";
import { 
  Store, 
  ShieldCheck, 
  Printer, 
  Save, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  Upload, 
  Loader2, 
  Gift, 
  Search, 
  Users, 
  Sparkles, 
  AlertCircle 
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp, 
  collection, 
  query, 
  orderBy, 
  writeBatch 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface EmployeeCredential {
  username: string;
  password: string;
}

export default function PengaturanPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Store settings
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: storeSettings } = useDoc(settingsRef);

  // Employee credentials
  const credentialsRef = useMemoFirebase(() => doc(db, "employee_credentials", "logins"), [db]);
  const [credentials, setCredentials] = useState<EmployeeCredential[]>([]);
  const [newCredential, setNewCredential] = useState<EmployeeCredential>({ username: "", password: "" });

  // Free Karyawan Quota Settings
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: listKaryawan, loading: loadingKaryawan } = useCollection(karyawanQuery);
  const [freeQuotas, setFreeQuotas] = useState<Record<string, number>>({});
  const [quotaSearch, setQuotaSearch] = useState("");
  const [globalQuotaBatch, setGlobalQuotaBatch] = useState<string>("");

  useEffect(() => {
    if (listKaryawan) {
      const initial: Record<string, number> = {};
      (listKaryawan as any[]).forEach((k) => {
        initial[k.id] = Number(k.freeQuota ?? k.quotaFreeBulanan ?? 0);
      });
      setFreeQuotas(initial);
    }
  }, [listKaryawan]);

  const handleSaveFreeQuotas = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      Object.entries(freeQuotas).forEach(([karyawanId, quotaVal]) => {
        const ref = doc(db, "karyawan", karyawanId);
        const qNum = Math.max(0, Number(quotaVal || 0));
        batch.set(ref, { 
          freeQuota: qNum,
          quotaFreeBulanan: qNum,
          updatedAt: serverTimestamp() 
        }, { merge: true });
      });

      const configRef = doc(db, "settings", "free_karyawan_config");
      batch.set(configRef, {
        quotas: freeQuotas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      toast({ 
        title: "Kuota Free Tersimpan", 
        description: "Batas klaim produk free per bulan untuk semua karyawan berhasil diperbarui." 
      });
    } catch (error) {
      console.error(error);
      toast({ 
        variant: "destructive", 
        title: "Gagal Menyimpan", 
        description: "Terjadi kesalahan saat menyimpan kuota Free Karyawan." 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyBatchQuota = () => {
    const num = parseInt(globalQuotaBatch);
    if (isNaN(num) || num < 0) {
      toast({ variant: "destructive", title: "Angka Tidak Valid", description: "Masukkan angka kuota yang valid." });
      return;
    }
    const updated: Record<string, number> = {};
    (listKaryawan as any[])?.forEach((k) => {
      updated[k.id] = num;
    });
    setFreeQuotas(updated);
    toast({ title: "Diterapkan ke Semua", description: `Semua karyawan diatur kuota ${num} produk/bulan. Klik Simpan untuk memperbarui.` });
  };

  // Admin credentials
  const adminCredentialsRef = useMemoFirebase(() => doc(db, "employee_credentials", "admin"), [db]);
  const [adminUsername, setAdminUsername] = useState("adminzona");
  const [adminPassword, setAdminPassword] = useState("admin00");

  useEffect(() => {
    const fetchCredentials = async () => {
      const docSnap = await getDoc(credentialsRef);
      if (docSnap.exists()) {
        setCredentials(docSnap.data().users || []);
      }

      const adminSnap = await getDoc(adminCredentialsRef);
      if (adminSnap.exists()) {
        const adminData = adminSnap.data();
        setAdminUsername(adminData.username || "adminzona");
        setAdminPassword(adminData.password || "admin00");
      }
    };
    fetchCredentials();
  }, [credentialsRef, adminCredentialsRef]);

  const [formData, setFormData] = useState({
    name: "Zona Waktu",
    tagline: "Coffee & Teh Bakar Autentik",
    logoLanding: "",
    logoHeader: ""
  });

  useEffect(() => {
    if (storeSettings) {
      queueMicrotask(() => {
        setFormData({
          name: storeSettings.name || "Zona Waktu",
          tagline: storeSettings.tagline || "Coffee & Teh Bakar Autentik",
          logoLanding: storeSettings.logoLanding || "",
          logoHeader: storeSettings.logoHeader || ""
        });
      });
    }
  }, [storeSettings]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logoLanding' | 'logoHeader') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setFormData((prev) => ({ ...prev, [type]: result }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Upload", description: "Logo tidak dapat diproses." });
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await setDoc(settingsRef, {
        name: formData.name,
        tagline: formData.tagline,
        logoLanding: formData.logoLanding,
        logoHeader: formData.logoHeader,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ title: "Pengaturan Tersimpan", description: "Data toko berhasil disimpan ke Firestore." });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Pengaturan toko gagal disimpan." });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredential = () => {
    if (newCredential.username && newCredential.password) {
      setCredentials([...credentials, newCredential]);
      setNewCredential({ username: "", password: "" });
    } else {
      toast({
        variant: "destructive",
        title: "Input Kosong",
        description: "Username dan password tidak boleh kosong.",
      });
    }
  };

  const handleRemoveCredential = (index: number) => {
    setCredentials(credentials.filter((_, i) => i !== index));
  };
  
  const handleSyncCredentials = async () => {
    setLoading(true);
    try {
      await setDoc(credentialsRef, { users: credentials }, { merge: true });
      await setDoc(adminCredentialsRef, { username: adminUsername, password: adminPassword }, { merge: true });
      toast({ title: "Sinkronisasi Berhasil", description: "Hak akses karyawan & admin telah diperbarui." });
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" });
    } finally {
      setLoading(false);
    }
  };

  const settingsGroups = [
    { id: "toko", title: "Toko", icon: Store, desc: "Identitas toko, logo, dan profil bisnis" },
    { id: "free-karyawan", title: "Free Karyawan", icon: Gift, desc: "Batas maksimal produk gratis yang dapat diklaim karyawan per bulan" },
    { id: "hak-akses", title: "Hak Akses", icon: ShieldCheck, desc: "Kaderisasi login untuk sistem karyawan" },
    { id: "hardware", title: "Hardware", icon: Printer, desc: "Printer thermal dan integrasi scanner" },
  ];
  if (activeSection === "free-karyawan") {
    const filteredKaryawanList = (listKaryawan as any[])?.filter((k) => {
      const term = quotaSearch.toLowerCase();
      return (
        k.nama?.toLowerCase().includes(term) ||
        k.kode?.toLowerCase().includes(term) ||
        k.jabatan?.toLowerCase().includes(term)
      );
    }) || [];

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic">
                Pengaturan Kuota Free Karyawan
              </h1>
              <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
                Atur batas maksimal produk (pcs) yang dapat diklaim per karyawan setiap bulannya
              </p>
            </div>
          </div>

          <Button 
            onClick={handleSaveFreeQuotas} 
            disabled={loading || loadingKaryawan}
            className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200 text-white gap-2 px-6"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Semua Kuota
          </Button>
        </div>

        {/* Global Batch Controls */}
        <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Terapkan Kuota Serentak (Batch)
                </h3>
              </div>
              <p className="text-xs font-bold text-slate-500">
                Isi angka kuota dan terapkan ke seluruh {listKaryawan?.length || 0} karyawan sekaligus
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                {[5, 10, 15, 30].map((quickNum) => (
                  <Button
                    key={quickNum}
                    type="button"
                    variant="outline"
                    onClick={() => setGlobalQuotaBatch(String(quickNum))}
                    className="h-10 rounded-xl text-xs font-black uppercase px-3 border-slate-200 hover:bg-slate-50"
                  >
                    {quickNum} Pcs
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-28">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={globalQuotaBatch}
                    onChange={(e) => setGlobalQuotaBatch(e.target.value)}
                    className="h-10 rounded-xl bg-slate-50 border-none text-center font-black text-sm pr-8"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-slate-400">
                    Pcs
                  </span>
                </div>

                <Button
                  type="button"
                  onClick={handleApplyBatchQuota}
                  className="h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase px-4"
                >
                  Terapkan Ke Semua
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* List of Employees with Individual Quotas */}
        <Card className="rounded-[2.5rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
            <div>
              <h3 className="text-base font-black uppercase italic tracking-tight text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Daftar Karyawan ({filteredKaryawanList.length})
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                Isi kuota 0 jika tidak ada kuota atau tidak berhak klaim produk gratis
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Cari nama karyawan..."
                value={quotaSearch}
                onChange={(e) => setQuotaSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl bg-slate-50 border-none text-xs font-bold"
              />
            </div>
          </div>

          {loadingKaryawan ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-black uppercase tracking-wider">Memuat data karyawan...</p>
            </div>
          ) : filteredKaryawanList.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-black uppercase tracking-wider">Tidak ada data karyawan ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKaryawanList.map((karyawan: any) => {
                const currentVal = freeQuotas[karyawan.id] ?? 0;
                return (
                  <div
                    key={karyawan.id}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 font-black text-sm uppercase">
                        {karyawan.nama ? karyawan.nama.substring(0, 2) : "KW"}
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase text-slate-900 leading-tight">
                          {karyawan.nama}
                        </h4>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                          {karyawan.jabatan || karyawan.kode || "Staff Karyawan"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min="0"
                          value={currentVal}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setFreeQuotas((prev) => ({ ...prev, [karyawan.id]: val }));
                          }}
                          className="h-10 rounded-xl bg-white border-slate-200 text-center font-black text-sm pr-8 shadow-sm"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-slate-400">
                          Pcs
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <Button 
              onClick={handleSaveFreeQuotas} 
              disabled={loading || loadingKaryawan}
              className="h-14 rounded-2xl bg-primary px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:bg-primary/90 text-white gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Simpan Semua Kuota Free
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (activeSection === "hak-akses") {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Hak Akses Karyawan</h1>
            <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Buat dan kelola akun login untuk sistem karyawan</p>
          </div>
        </div>

        <Card className="rounded-[3rem] border-none shadow-sm bg-white p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Form Tambah Karyawan */}
            <div className="space-y-6">
              <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">Tambah Akun Karyawan</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username</Label>
                  <Input 
                    placeholder="Contoh: kasir01" 
                    value={newCredential.username}
                    onChange={(e) => setNewCredential({ ...newCredential, username: e.target.value })}
                    className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password</Label>
                  <Input 
                    type="password"
                    placeholder="Minimal 6 karakter" 
                    value={newCredential.password}
                    onChange={(e) => setNewCredential({ ...newCredential, password: e.target.value })}
                    className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                  />
                </div>
                <Button 
                  onClick={handleAddCredential}
                  className="w-full h-14 rounded-2xl bg-slate-900 font-black uppercase tracking-widest text-xs gap-2"
                >
                  <Plus className="h-4 w-4" /> Tambah ke Daftar
                </Button>
              </div>
            </div>

            {/* List Karyawan */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">Daftar Akun Terdaftar</h3>
                <span className="text-xs font-black uppercase text-primary tracking-widest">{credentials.length} Akun</span>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {credentials.map((cred, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div>
                      <p className="font-black text-sm text-slate-900">{cred.username}</p>
                      <p className="text-[10px] font-bold text-slate-400">Password: ••••••••</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemoveCredential(idx)}
                      className="rounded-xl text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <hr className="my-10 border-slate-100" />

          {/* Admin Credentials */}
          <div className="space-y-6">
            <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">Kredensial Owner & Super Admin</h3>
            <p className="text-xs text-slate-500 font-bold">Kredensial ini digunakan untuk membuka akses halaman Dashboard Utama, Inventori, Master Data, dan Laporan.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username Admin</Label>
                <Input 
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password Admin</Label>
                <Input 
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 flex justify-end">
            <Button 
              onClick={handleSyncCredentials} 
              disabled={loading}
              className="h-14 rounded-2xl bg-primary px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:bg-primary/90 text-white gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Simpan Perubahan
            </Button>
          </div>
        </Card>
      </div>
    );
  }
  if (activeSection === "toko") {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Identitas Bisnis</h1>
            <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Kelola nama, tagline, dan logo visual sistem</p>
          </div>
        </div>

        <Card className="rounded-[3rem] border-none shadow-sm bg-white p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Bisnis / Brand</Label>
              <Input 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-14 rounded-2xl bg-slate-50 border-none font-black text-slate-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tagline / Slogan</Label>
              <Input 
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            {/* Logo Landing */}
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logo Landing Page</Label>
              <div className="p-6 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4">
                {formData.logoLanding ? (
                  <div className="relative h-24 w-48">
                    <Image src={formData.logoLanding} alt="Logo Landing" fill className="object-contain" />
                  </div>
                ) : (
                  <div className="h-24 w-48 flex items-center justify-center bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Belum Ada Logo
                  </div>
                )}
                <label className="cursor-pointer">
                  <div className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-slate-50">
                    <Upload className="h-4 w-4" /> Upload File
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logoLanding')} />
                </label>
              </div>
            </div>

            {/* Logo Header */}
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logo Header App</Label>
              <div className="p-6 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4">
                {formData.logoHeader ? (
                  <div className="relative h-24 w-48">
                    <Image src={formData.logoHeader} alt="Logo Header" fill className="object-contain" />
                  </div>
                ) : (
                  <div className="h-24 w-48 flex items-center justify-center bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Belum Ada Logo
                  </div>
                )}
                <label className="cursor-pointer">
                  <div className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-slate-50">
                    <Upload className="h-4 w-4" /> Upload File
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logoHeader')} />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-slate-100">
            <Button 
              onClick={handleSaveSettings} 
              disabled={loading}
              className="h-14 rounded-2xl bg-primary px-10 font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:bg-primary/90 text-white gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Simpan Identitas
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      <div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Sistem</h1>
        <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Konfigurasi pusat operasional dan identitas</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingsGroups.map((group) => {
          const Icon = group.icon;
          return (
            <Card 
              key={group.id}
              onClick={() => setActiveSection(group.id)}
              className="rounded-[2.5rem] border-none shadow-sm bg-white p-8 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-primary transition-all text-slate-700">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight uppercase italic text-slate-900 group-hover:text-primary transition-colors">
                    {group.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold mt-1">
                    {group.desc}
                  </p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                <span>Buka Konfigurasi</span>
                <span>&rarr;</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
