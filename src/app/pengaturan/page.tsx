"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Store, 
  Users, 
  Printer, 
  ShieldCheck, 
  Upload, 
  Save, 
  Loader2, 
  Image as ImageIcon,
  ChevronLeft,
  Trash2,
  PlusCircle,
  UserPlus
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase";
import { doc, setDoc, serverTimestamp, getDoc, collection } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface EmployeeCredential {
  username: string;
  // In a real app, passwords should be securely hashed. Storing plain text for now.
  password?: string; 
}

export default function PengaturanUmumPage() {
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

  useEffect(() => {
    const fetchCredentials = async () => {
      const docSnap = await getDoc(credentialsRef);
      if (docSnap.exists()) {
        setCredentials(docSnap.data().users || []);
      }
    };
    if (activeSection === "hak-akses") {
      fetchCredentials();
    }
  }, [activeSection, credentialsRef]);

  const [formData, setFormData] = useState({
    name: "Zona Waktu",
    tagline: "Coffee & Teh Bakar Autentik",
    logoLanding: "",
    logoHeader: ""
  });

  useEffect(() => {
    if (storeSettings) {
      setFormData({
        name: storeSettings.name || "Zona Waktu",
        tagline: storeSettings.tagline || "Coffee & Teh Bakar Autentik",
        logoLanding: storeSettings.logoLanding || "",
        logoHeader: storeSettings.logoHeader || ""
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
      toast({ title: "Sinkronisasi Berhasil", description: "Hak akses karyawan telah diperbarui." });
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" });
    } finally {
      setLoading(false);
    }
  };

  const settingsGroups = [
    { id: "toko", title: "Toko", icon: Store, desc: "Identitas toko, logo, dan profil bisnis" },
    { id: "hak-akses", title: "Hak Akses", icon: ShieldCheck, desc: "Kaderisasi login untuk sistem karyawan" },
    { id: "hardware", title: "Hardware", icon: Printer, desc: "Printer thermal dan integrasi scanner" },
  ];

  // ... (JSX for "toko" section remains the same)

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
            {/* Form for adding new credentials */}
            <div className="space-y-4">
              <h3 className="font-bold">Tambah Akun Baru</h3>
              <Input 
                placeholder="Username Karyawan"
                value={newCredential.username}
                onChange={(e) => setNewCredential({...newCredential, username: e.target.value})}
              />
              <Input 
                type="password"
                placeholder="Password"
                value={newCredential.password}
                onChange={(e) => setNewCredential({...newCredential, password: e.target.value})}
              />
              <Button onClick={handleAddCredential} className="w-full">
                <PlusCircle className="h-4 w-4 mr-2" /> Tambah
              </Button>
            </div>

            {/* List of existing credentials */}
            <div className="space-y-4">
              <h3 className="font-bold">Daftar Akun Karyawan</h3>
              <div className="space-y-2">
                {credentials.map((cred, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                    <span>{cred.username}</span>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveCredential(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-8">
            <Button onClick={handleSyncCredentials} disabled={loading} className="w-full h-14 bg-primary text-white font-bold uppercase tracking-widest">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Sinkronisasi Kaderisasi
            </Button>
          </div>
        </Card>
      </div>
    );
  }
  
  // ... (rest of the component remains the same)
  if (activeSection === "toko") {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Toko</h1>
            <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Kelola identitas visual Zona Waktu</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="rounded-[3rem] border-none shadow-sm bg-white p-10">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nama Bisnis</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="rounded-xl h-12 font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tagline / Deskripsi</Label>
                <Input 
                  value={formData.tagline} 
                  onChange={(e) => setFormData({...formData, tagline: e.target.value})}
                  className="rounded-xl h-12 font-bold"
                />
              </div>
              <Button 
                onClick={handleSaveSettings} 
                disabled={loading}
                className="w-full rounded-2xl bg-primary h-14 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Simpan Perubahan
              </Button>
            </div>
          </Card>

          <div className="space-y-6">
            {/* Logo Landing Page */}
            <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-sm font-black uppercase italic text-slate-900">Logo Landing Page</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Akan tampil di halaman depan</p>
                </div>
                <Label htmlFor="upload-landing" className="cursor-pointer">
                  <div className="h-10 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase text-primary hover:bg-slate-100 transition-colors">
                    <Upload className="h-3.5 w-3.5" /> Ganti
                  </div>
                  <input id="upload-landing" type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'logoLanding')} />
                </Label>
              </div>
              <div className="relative h-40 w-full rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                {formData.logoLanding ? (
                  <Image src={formData.logoLanding} alt="Logo Landing" fill className="object-contain p-4" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-slate-200" />
                )}
              </div>
            </Card>

            {/* Logo Header Dashboard */}
            <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-sm font-black uppercase italic text-slate-900">Logo Header Dashboard</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Akan tampil di pojok kiri atas</p>
                </div>
                <Label htmlFor="upload-header" className="cursor-pointer">
                  <div className="h-10 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 text-[10px] font-black uppercase text-primary hover:bg-slate-100 transition-colors">
                    <Upload className="h-3.5 w-3.5" /> Ganti
                  </div>
                  <input id="upload-header" type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'logoHeader')} />
                </Label>
              </div>
              <div className="relative h-24 w-full rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                {formData.logoHeader ? (
                  <Image src={formData.logoHeader} alt="Logo Header" fill className="object-contain p-2" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-200" />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }
   return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Umum</h1>
        <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Konfigurasi operasional dan keamanan Zona Waktu</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {settingsGroups.map((group) => (
          <Card 
            key={group.id} 
            onClick={() => setActiveSection(group.id)}
            className="cursor-pointer hover:border-primary/20 transition-all border-none shadow-sm rounded-[2rem] bg-white group hover:shadow-xl p-4"
          >
            <CardHeader className="flex flex-row items-center gap-6 space-y-0 p-6">
              <div className="rounded-2xl bg-slate-50 p-4 text-slate-600 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                <group.icon className="h-7 w-7" />
              </div>
              <div>
                <CardTitle className="text-lg font-black uppercase italic tracking-tight text-slate-900">{group.title}</CardTitle>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1 leading-relaxed">{group.desc}</p>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
