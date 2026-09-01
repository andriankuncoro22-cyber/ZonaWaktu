"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  AlertCircle,
  Laptop,
  Smartphone,
  ArrowRight,
  RefreshCw,
  UserCheck,
  CalendarDays
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useDoc, useMemoFirebase, useCollection, collection, doc } from "@/firebase";
import { setDoc, getDoc, getDocs, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

import { useActiveBranch, getStoreConfigDocId, getDefaultStoreIdentity, BRANCH_LIST, BranchId } from "@/lib/branch-helper";

interface EmployeeCredential {
  username: string;
  password: string;
}

export default function PengaturanPage() {
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingAbsensi, setSyncingAbsensi] = useState(false);
  
  // Tab pemisah antara Akun Sistem Karyawan & Akun Login Absensi
  const [accountTypeTab, setAccountTypeTab] = useState<"sistem" | "absensi">("sistem");

  // Form tambah akun absensi baru (terhubung langsung dengan /pengaturan/absensi - karyawan)
  const [newAbsensiForm, setNewAbsensiForm] = useState({
    nama: "",
    username: "",
    password: "",
    gender: "Laki-laki",
    team: "tim1"
  });
  
  // Branch-isolated Store Settings
  const activeBranch = useActiveBranch();
  const [selectedBranch, setSelectedBranch] = useState<BranchId>(activeBranch);

  useEffect(() => {
    setSelectedBranch(activeBranch);
  }, [activeBranch]);

  const configDocId = getStoreConfigDocId(selectedBranch);
  const settingsRef = useMemoFirebase(() => doc(db, "settings", configDocId), [db, configDocId]);
  const { data: storeSettings } = useDoc(settingsRef);

  // Branch-isolated Employee & Admin Credentials
  const [credentialBranch, setCredentialBranch] = useState<BranchId>("gdm");
  const [credentialsByBranch, setCredentialsByBranch] = useState<Record<BranchId, EmployeeCredential[]>>({
    gdm: [],
    kedungreja: [],
    tehwarga: []
  });
  const [adminByBranch, setAdminByBranch] = useState<Record<BranchId, { username: string; password: string }>>({
    gdm: { username: "adminzona", password: "admin00" },
    kedungreja: { username: "adminkedungreja", password: "admin00" },
    tehwarga: { username: "admintehwarga", password: "admin00" }
  });
  const [newCredential, setNewCredential] = useState<EmployeeCredential>({ username: "", password: "" });

  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        // 1. Fetch GDM credentials (system_logins_gdm -> logins_gdm -> logins)
        const gdmSysSnap = await getDoc(doc(db, "employee_credentials", "system_logins_gdm"));
        const gdmCredSnap = await getDoc(doc(db, "employee_credentials", "logins_gdm"));
        const gdmFallbackSnap = await getDoc(doc(db, "employee_credentials", "logins"));
        const gdmUsers = gdmSysSnap.exists()
          ? (gdmSysSnap.data().users || [])
          : (gdmCredSnap.exists() 
              ? (gdmCredSnap.data().users || []) 
              : (gdmFallbackSnap.exists() ? (gdmFallbackSnap.data().users || []) : []));

        // 2. Fetch Kedungreja credentials (system_logins_kedungreja -> logins_kedungreja)
        const kdrjSysSnap = await getDoc(doc(db, "employee_credentials", "system_logins_kedungreja"));
        const kdrjCredSnap = await getDoc(doc(db, "employee_credentials", "logins_kedungreja"));
        const kdrjUsers = kdrjSysSnap.exists() 
          ? (kdrjSysSnap.data().users || []) 
          : (kdrjCredSnap.exists() ? (kdrjCredSnap.data().users || []) : []);

        // 3. Fetch Teh Warga credentials (system_logins_tehwarga -> logins_tehwarga)
        const tehSysSnap = await getDoc(doc(db, "employee_credentials", "system_logins_tehwarga"));
        const tehCredSnap = await getDoc(doc(db, "employee_credentials", "logins_tehwarga"));
        const tehUsers = tehSysSnap.exists() 
          ? (tehSysSnap.data().users || []) 
          : (tehCredSnap.exists() ? (tehCredSnap.data().users || []) : []);

        setCredentialsByBranch({
          gdm: gdmUsers,
          kedungreja: kdrjUsers,
          tehwarga: tehUsers
        });

        // 4. Fetch Admin credentials
        const adminGdmSnap = await getDoc(doc(db, "employee_credentials", "admin_gdm"));
        const adminGlobalSnap = await getDoc(doc(db, "employee_credentials", "admin"));
        const adminGdm = adminGdmSnap.exists() ? adminGdmSnap.data() : (adminGlobalSnap.exists() ? adminGlobalSnap.data() : null);

        const adminKdrjSnap = await getDoc(doc(db, "employee_credentials", "admin_kedungreja"));
        const adminKdrj = adminKdrjSnap.exists() ? adminKdrjSnap.data() : null;

        const adminTehSnap = await getDoc(doc(db, "employee_credentials", "admin_tehwarga"));
        const adminTeh = adminTehSnap.exists() ? adminTehSnap.data() : null;

        setAdminByBranch({
          gdm: {
            username: adminGdm?.username || "adminzona",
            password: adminGdm?.password || "admin00"
          },
          kedungreja: {
            username: adminKdrj?.username || "adminkedungreja",
            password: adminKdrj?.password || "admin00"
          },
          tehwarga: {
            username: adminTeh?.username || "admintehwarga",
            password: adminTeh?.password || "admin00"
          }
        });
      } catch (err) {
        console.error("Error fetching credentials:", err);
      }
    };

    fetchCredentials();
  }, [db]);

  const [formData, setFormData] = useState({
    name: "Zona Waktu",
    tagline: "Coffee & Teh Bakar Autentik",
    logoLanding: "",
    logoHeader: ""
  });

  useEffect(() => {
    const defaults = getDefaultStoreIdentity(selectedBranch);
    if (storeSettings) {
      setFormData({
        name: storeSettings.name || defaults.name,
        tagline: storeSettings.tagline || defaults.tagline,
        logoLanding: storeSettings.logoLanding || "",
        logoHeader: storeSettings.logoHeader || ""
      });
    } else {
      setFormData({
        name: defaults.name,
        tagline: defaults.tagline,
        logoLanding: "",
        logoHeader: ""
      });
    }
  }, [storeSettings, selectedBranch]);

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
      const docRef = doc(db, "settings", getStoreConfigDocId(selectedBranch));
      await setDoc(docRef, {
        name: formData.name,
        tagline: formData.tagline,
        logoLanding: formData.logoLanding,
        logoHeader: formData.logoHeader,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ 
        title: "Identitas Toko Tersimpan", 
        description: `Identitas bisnis untuk ${BRANCH_LIST[selectedBranch]?.name || "Toko"} berhasil diperbarui.` 
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Pengaturan toko gagal disimpan." });
    } finally {
      setLoading(false);
    }
  };

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

  const handleAddCredential = () => {
    const u = newCredential.username.trim();
    const p = newCredential.password.trim();
    if (!u || !p) {
      toast({
        variant: "destructive",
        title: "Input Kosong",
        description: "Username dan password tidak boleh kosong.",
      });
      return;
    }

    const currentList = credentialsByBranch[credentialBranch] || [];
    if (currentList.some(item => item.username.toLowerCase() === u.toLowerCase())) {
      toast({
        variant: "destructive",
        title: "Username Sudah Ada",
        description: `Username "${u}" sudah terdaftar di cabang ${BRANCH_LIST[credentialBranch]?.name}.`,
      });
      return;
    }

    setCredentialsByBranch(prev => ({
      ...prev,
      [credentialBranch]: [...(prev[credentialBranch] || []), { username: u, password: p }]
    }));
    setNewCredential({ username: "", password: "" });
  };

  const handleRemoveCredential = (index: number) => {
    setCredentialsByBranch(prev => ({
      ...prev,
      [credentialBranch]: prev[credentialBranch].filter((_, i) => i !== index)
    }));
  };
  
  const handleSyncCredentials = async () => {
    setLoading(true);
    try {
      const targetBranch = credentialBranch;
      const branchUsers = credentialsByBranch[targetBranch] || [];
      const branchAdmin = adminByBranch[targetBranch];

      // 1. Simpan daftar akun sistem/kasir murni ke system_logins_<targetBranch>
      const systemDocName = `system_logins_${targetBranch}`;
      await setDoc(doc(db, "employee_credentials", systemDocName), { 
        users: branchUsers, 
        totalUsers: branchUsers.length,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      // 2. Simpan kredensial admin khusus cabang ini
      const adminDocName = `admin_${targetBranch}`;
      await setDoc(doc(db, "employee_credentials", adminDocName), { 
        username: branchAdmin.username.trim(), 
        password: branchAdmin.password.trim(), 
        updatedAt: serverTimestamp() 
      }, { merge: true });

      if (targetBranch === "gdm") {
        await setDoc(doc(db, "employee_credentials", "admin"), { 
          username: branchAdmin.username.trim(), 
          password: branchAdmin.password.trim(), 
          updatedAt: serverTimestamp() 
        }, { merge: true });
      }

      // 3. Ambil data absensi aktif khusus targetBranch dari Firestore
      const kSnap = await getDocs(collection(db, "karyawan"));
      const branchAbsensiUsers: any[] = [];
      kSnap.docs.forEach((d) => {
        const dData = d.data();
        const dCabang = (dData.cabang || "gdm").toLowerCase();
        if (dCabang === targetBranch) {
          const u = String(dData.username || "").trim();
          const p = String(dData.password || "").trim();
          if (u && p) {
            branchAbsensiUsers.push({
              id: d.id,
              username: u,
              password: p,
              nama: dData.nama || u,
              role: "employee",
              cabang: targetBranch,
              gender: dData.gender || "Laki-laki",
              team: dData.team || "tim1",
              status: dData.status || "aktif"
            });
          }
        }
      });

      // 4. Merge tanpa duplikasi antara kasir sistem dan absensi khusus targetBranch
      const mergedMap = new Map<string, any>();
      branchUsers.forEach(u => {
        if (u.username) mergedMap.set(u.username.toLowerCase(), { ...u, cabang: targetBranch });
      });
      branchAbsensiUsers.forEach(u => {
        if (u.username && !mergedMap.has(u.username.toLowerCase())) {
          mergedMap.set(u.username.toLowerCase(), u);
        }
      });
      const combinedUsers = Array.from(mergedMap.values());

      // 5. Update HANYA dokumen logins_<targetBranch> (JANGAN SENTUH DOKUMEN TOKO LAIN!)
      const loginDocName = `logins_${targetBranch}`;
      await setDoc(doc(db, "employee_credentials", loginDocName), { 
        users: combinedUsers, 
        totalUsers: combinedUsers.length,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      if (targetBranch === "gdm") {
        await setDoc(doc(db, "employee_credentials", "logins"), { 
          users: combinedUsers, 
          totalUsers: combinedUsers.length,
          updatedAt: serverTimestamp() 
        }, { merge: true });
      }

      toast({ 
        title: "Perubahan Kredensial Tersimpan", 
        description: `Hak akses untuk ${BRANCH_LIST[targetBranch]?.name} berhasil diperbarui tanpa mempengaruhi toko lainnya.` 
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat menyimpan hak akses." });
    } finally {
      setLoading(false);
    }
  };

  // Helper sinkronisasi karyawan absensi khusus cabang yang aktif (TIDAK menyentuh cabang lain)
  const syncBranchAbsensiKaryawan = async (targetBranch: BranchId = credentialBranch) => {
    setSyncingAbsensi(true);
    try {
      // 1. Ambil data karyawan absensi di targetBranch
      const snapshot = await getDocs(collection(db, "karyawan"));
      const branchAbsensiUsers: any[] = [];
      let totalBranch = 0;

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const cleanUsername = String(data.username || "").trim();
        const cleanPassword = String(data.password || "").trim();
        const cleanNama = String(data.nama || cleanUsername).trim();
        const userCabang = (data.cabang || "gdm").toLowerCase();

        if (cleanUsername && cleanPassword && userCabang === targetBranch) {
          totalBranch++;
          branchAbsensiUsers.push({
            id: d.id,
            username: cleanUsername,
            password: cleanPassword,
            nama: cleanNama,
            role: "employee",
            cabang: targetBranch,
            gender: data.gender || "Laki-laki",
            team: data.team || "tim1",
            status: data.status || "aktif"
          });
        }
      });

      // 2. Simpan absensi khusus ke absensi_logins_<targetBranch>
      await setDoc(doc(db, "employee_credentials", `absensi_logins_${targetBranch}`), {
        users: branchAbsensiUsers,
        totalUsers: branchAbsensiUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 3. Ambil system_logins_<targetBranch> yang sudah ada agar akun kasir tidak terhapus
      const sysSnap = await getDoc(doc(db, "employee_credentials", `system_logins_${targetBranch}`));
      const existingSystemUsers: any[] = sysSnap.exists() ? (sysSnap.data().users || []) : (credentialsByBranch[targetBranch] || []);

      // 4. Merge system kasir users + absensi users untuk targetBranch
      const mergedMap = new Map<string, any>();
      existingSystemUsers.forEach(u => {
        if (u.username) mergedMap.set(u.username.toLowerCase(), { ...u, cabang: targetBranch });
      });
      branchAbsensiUsers.forEach(u => {
        if (u.username && !mergedMap.has(u.username.toLowerCase())) {
          mergedMap.set(u.username.toLowerCase(), u);
        }
      });
      const combinedUsers = Array.from(mergedMap.values());

      // 5. Update logins_<targetBranch> HANYA untuk targetBranch!
      await setDoc(doc(db, "employee_credentials", `logins_${targetBranch}`), {
        users: combinedUsers,
        totalUsers: combinedUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (targetBranch === "gdm") {
        await setDoc(doc(db, "employee_credentials", "logins"), {
          users: combinedUsers,
          totalUsers: combinedUsers.length,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      toast({
        title: "Sinkronisasi Cabang Berhasil",
        description: `${totalBranch} akun absensi ${BRANCH_LIST[targetBranch]?.name} berhasil disinkronkan tanpa mempengaruhi toko lain.`
      });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Gagal Sinkronisasi", description: "Terjadi kesalahan saat menyinkronkan data absensi." });
    } finally {
      setSyncingAbsensi(false);
    }
  };

  const handleAddAbsensiKaryawan = async () => {
    const nama = newAbsensiForm.nama.trim();
    const username = newAbsensiForm.username.trim();
    const password = newAbsensiForm.password.trim();

    if (!nama || !username || !password) {
      toast({ variant: "destructive", title: "Input Kosong", description: "Nama, Username, dan Password wajib diisi!" });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "karyawan"), {
        nama,
        username,
        password,
        gender: newAbsensiForm.gender,
        team: newAbsensiForm.team,
        cabang: credentialBranch,
        status: "aktif",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await syncBranchAbsensiKaryawan(credentialBranch);

      toast({
        title: "Akun Absensi Ditambahkan",
        description: `Akun absensi ${nama} (${username}) untuk ${BRANCH_LIST[credentialBranch]?.name} berhasil dibuat.`
      });

      setNewAbsensiForm({
        nama: "",
        username: "",
        password: "",
        gender: "Laki-laki",
        team: "tim1"
      });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat membuat akun absensi." });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAbsensiKaryawan = async (id: string, nama: string) => {
    if (!window.confirm(`Hapus akun absensi untuk "${nama}"? Akun ini juga akan terhapus dari database absensi ${BRANCH_LIST[credentialBranch]?.name}.`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "karyawan", id));
      await syncBranchAbsensiKaryawan(credentialBranch);
      toast({ title: "Akun Absensi Dihapus", description: `Akun absensi ${nama} berhasil dihapus.` });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Gagal Menghapus" });
    } finally {
      setLoading(false);
    }
  };

  const settingsGroups = [
    { id: "toko", title: "Toko", icon: Store, desc: "Identitas toko, logo, dan profil bisnis" },
    { id: "free-karyawan", title: "Free Karyawan", icon: Gift, desc: "Batas maksimal produk gratis yang dapat diklaim karyawan per bulan" },
    { id: "hak-akses", title: "Hak Akses", icon: ShieldCheck, desc: "Kaderisasi login untuk sistem karyawan & absensi" },
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

            <div className="flex items-center gap-3">
              <div className="relative w-36">
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={globalQuotaBatch}
                  onChange={(e) => setGlobalQuotaBatch(e.target.value)}
                  className="h-12 rounded-2xl bg-slate-50 border-slate-200 font-black text-center pr-10 text-base"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-slate-400">
                  Pcs
                </span>
              </div>
              <Button
                onClick={handleApplyBatchQuota}
                className="h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-wider text-xs px-5 shadow-sm"
              >
                Terapkan
              </Button>
            </div>
          </div>
        </Card>

        {/* Search & List */}
        <Card className="rounded-[2.5rem] border-none shadow-sm bg-white p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black uppercase italic tracking-tight text-slate-800">
                Daftar Kuota Karyawan
              </h3>
              <p className="text-xs font-bold text-slate-400">
                Total {listKaryawan?.length || 0} karyawan terdaftar di database
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Cari nama karyawan..."
                value={quotaSearch}
                onChange={(e) => setQuotaSearch(e.target.value)}
                className="h-11 pl-10 rounded-2xl bg-slate-50 border-none font-bold text-xs"
              />
            </div>
          </div>

          {loadingKaryawan ? (
            <div className="py-20 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-xs font-black uppercase text-slate-400 mt-2">Memuat Data Karyawan...</p>
            </div>
          ) : filteredKaryawanList.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-slate-50 border border-dashed border-slate-200">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                {quotaSearch ? "Karyawan tidak ditemukan" : "Belum ada data karyawan"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredKaryawanList.map((karyawan: any) => {
                const currentVal = freeQuotas[karyawan.id] ?? Number(karyawan.freeQuota ?? karyawan.quotaFreeBulanan ?? 0);
                return (
                  <div
                    key={karyawan.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all"
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
    const currentBranchCredentials = credentialsByBranch[credentialBranch] || [];
    const currentBranchAdmin = adminByBranch[credentialBranch] || { username: "", password: "" };
    const currentBranchInfo = BRANCH_LIST[credentialBranch] || BRANCH_LIST.gdm;

    // Filter absensi karyawan untuk cabang aktif (berhubungan langsung dengan /pengaturan/absensi - karyawan)
    const branchAbsensiList = (listKaryawan as any[])?.filter(
      (k) => (k.cabang || "gdm").toLowerCase() === credentialBranch
    ) || [];

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic">
                Hak Akses Karyawan & Admin
              </h1>
              <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">
                Pemisahan akun login sistem karyawan & akun login absensi per masing-masing toko
              </p>
            </div>
          </div>

          {/* Branch Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
            {Object.entries(BRANCH_LIST).map(([bId, bInfo]) => (
              <button
                key={bId}
                type="button"
                onClick={() => setCredentialBranch(bId as BranchId)}
                className={cn(
                  "px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all",
                  credentialBranch === bId
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                {bInfo.shortName} ({bInfo.code})
              </button>
            ))}
          </div>
        </div>

        {/* Sub-Tabs: Pemisahan Akun Sistem Karyawan vs Akun Absensi Karyawan */}
        <div className="flex flex-wrap items-center gap-3 p-2 bg-slate-100/80 rounded-3xl w-fit border border-slate-200/60">
          <button
            type="button"
            onClick={() => setAccountTypeTab("sistem")}
            className={cn(
              "flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all",
              accountTypeTab === "sistem"
                ? "bg-white text-slate-900 shadow-md shadow-slate-200/50 scale-[1.02]"
                : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <Laptop className="h-4 w-4 text-indigo-600" />
            <span>Akun Sistem Karyawan (Kasir & POS)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-black ml-1">
              {currentBranchCredentials.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAccountTypeTab("absensi")}
            className={cn(
              "flex items-center gap-2.5 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all",
              accountTypeTab === "absensi"
                ? "bg-white text-slate-900 shadow-md shadow-slate-200/50 scale-[1.02]"
                : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            <Smartphone className="h-4 w-4 text-emerald-600" />
            <span>Akun Login Absensi Karyawan</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-black ml-1">
              {branchAbsensiList.length}
            </span>
          </button>
        </div>

        {accountTypeTab === "sistem" ? (
          /* ========================================================================= */
          /* BAGIAN 1: AKUN SISTEM KARYAWAN (KASIR, CLOSING, POS, OPERASIONAL)        */
          /* ========================================================================= */
          <Card className="rounded-[3rem] border-none shadow-sm bg-white p-8 sm:p-10 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-100 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">
                    Akun Login Sistem Karyawan ({currentBranchInfo.name})
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Digunakan untuk login kasir, closing toko, operasional & dashboard karyawan (/employee-login)
                  </p>
                </div>
              </div>
              <span className="text-xs font-black uppercase px-3.5 py-1.5 bg-slate-100 text-slate-600 rounded-full w-fit">
                {currentBranchCredentials.length} Akun Kasir Aktif
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Form Tambah Karyawan Sistem */}
              <div className="space-y-6">
                <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">
                  Tambah Akun Kasir / Sistem ({currentBranchInfo.shortName})
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username Kasir</Label>
                    <Input 
                      placeholder="Contoh: kasir01" 
                      value={newCredential.username}
                      onChange={(e) => setNewCredential({ ...newCredential, username: e.target.value })}
                      className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
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
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button 
                    onClick={handleAddCredential}
                    className="w-full h-14 rounded-2xl bg-slate-900 font-black uppercase tracking-widest text-xs gap-2"
                  >
                    <Plus className="h-4 w-4" /> Tambah ke Daftar Sistem
                  </Button>
                </div>
              </div>

              {/* List Karyawan Sistem */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">
                    Daftar Akun Kasir Terdaftar
                  </h3>
                  <span className="text-xs font-black uppercase text-indigo-600 tracking-widest">
                    {currentBranchCredentials.length} Akun
                  </span>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {currentBranchCredentials.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Belum ada akun kasir/sistem di {currentBranchInfo.shortName}
                      </p>
                    </div>
                  ) : (
                    currentBranchCredentials.map((cred, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
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
                    ))
                  )}
                </div>
              </div>
            </div>

            <hr className="my-10 border-slate-100" />

            {/* Admin Credentials */}
            <div className="space-y-6">
              <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">
                Kredensial Admin ({currentBranchInfo.shortName})
              </h3>
              <p className="text-xs text-slate-500 font-bold">
                Kredensial ini digunakan untuk membuka akses halaman Admin/Kasir khusus untuk outlet {currentBranchInfo.name}.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username Admin</Label>
                  <Input 
                    value={currentBranchAdmin.username}
                    onChange={(e) => setAdminByBranch(prev => ({
                      ...prev,
                      [credentialBranch]: { ...prev[credentialBranch], username: e.target.value }
                    }))}
                    className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password Admin</Label>
                  <Input 
                    type="password"
                    value={currentBranchAdmin.password}
                    onChange={(e) => setAdminByBranch(prev => ({
                      ...prev,
                      [credentialBranch]: { ...prev[credentialBranch], password: e.target.value }
                    }))}
                    className="h-14 rounded-2xl bg-slate-50 border-none font-bold"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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
                Simpan Perubahan Sistem ({currentBranchInfo.shortName})
              </Button>
            </div>
          </Card>
        ) : (
          /* ========================================================================= */
          /* BAGIAN 2: AKUN LOGIN ABSENSI (TERHUBUNG KE /pengaturan/absensi - karyawan) */
          /* ========================================================================= */
          <Card className="rounded-[3rem] border-none shadow-sm bg-white p-8 sm:p-10 animate-in fade-in duration-300">
            {/* Info & Shortcut Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 mb-8 border-b border-slate-100 gap-6">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-xs">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase italic text-slate-900">
                    Akun Login Absensi Karyawan ({currentBranchInfo.name})
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Terhubung langsung dengan Database Karyawan di <span className="text-emerald-600 font-black">/pengaturan/absensi</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/pengaturan/absensi")}
                  className="rounded-2xl border-slate-200 text-slate-700 hover:bg-slate-50 font-black uppercase tracking-wider text-[10px] h-11 px-4 gap-2"
                >
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  Buka Pengaturan Absensi Lengkap
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </Button>

                <Button
                  onClick={() => syncBranchAbsensiKaryawan(credentialBranch)}
                  disabled={syncingAbsensi}
                  className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-[10px] h-11 px-4 gap-2 shadow-sm"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncingAbsensi && "animate-spin")} />
                  {syncingAbsensi ? "Menyinkronkan..." : `Sinkronisasi Cabang (${currentBranchInfo.shortName})`}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Form Tambah Karyawan Absensi */}
              <div className="lg:col-span-2 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">
                    Tambah Akun Absensi Baru
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Cabang Penempatan: <span className="text-emerald-600 font-black">{currentBranchInfo.name}</span>
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Lengkap</Label>
                    <Input 
                      placeholder="Nama sesuai KTP..." 
                      value={newAbsensiForm.nama}
                      onChange={(e) => setNewAbsensiForm({ ...newAbsensiForm, nama: e.target.value })}
                      className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username Absensi</Label>
                      <Input 
                        placeholder="Contoh: budi01" 
                        value={newAbsensiForm.username}
                        onChange={(e) => setNewAbsensiForm({ ...newAbsensiForm, username: e.target.value })}
                        className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password</Label>
                      <Input 
                        type="password"
                        placeholder="••••••••" 
                        value={newAbsensiForm.password}
                        onChange={(e) => setNewAbsensiForm({ ...newAbsensiForm, password: e.target.value })}
                        className="h-12 rounded-2xl bg-slate-50 border-none font-bold text-xs"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jenis Kelamin</Label>
                      <select 
                        value={newAbsensiForm.gender} 
                        onChange={(e) => setNewAbsensiForm({ ...newAbsensiForm, gender: e.target.value })} 
                        className="flex h-12 w-full rounded-2xl border-none bg-slate-50 px-3 py-2 text-xs font-bold focus-visible:outline-none"
                      >
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tim Shift</Label>
                      <select 
                        value={newAbsensiForm.team} 
                        onChange={(e) => setNewAbsensiForm({ ...newAbsensiForm, team: e.target.value })} 
                        className="flex h-12 w-full rounded-2xl border-none bg-slate-50 px-3 py-2 text-xs font-bold focus-visible:outline-none"
                      >
                        <option value="tim1">Tim 1</option>
                        <option value="tim2">Tim 2</option>
                      </select>
                    </div>
                  </div>

                  <Button 
                    onClick={handleAddAbsensiKaryawan}
                    disabled={loading}
                    className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs gap-2 shadow-sm mt-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Simpan Akun Absensi ({currentBranchInfo.shortName})
                  </Button>
                </div>
              </div>

              {/* List Karyawan Absensi */}
              <div className="lg:col-span-3 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight uppercase italic text-slate-800">
                    Daftar Akun Absensi Terdaftar
                  </h3>
                  <span className="text-xs font-black uppercase text-emerald-600 tracking-widest">
                    {branchAbsensiList.length} Karyawan
                  </span>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
                  {branchAbsensiList.length === 0 ? (
                    <div className="p-10 text-center rounded-3xl bg-slate-50 border border-dashed border-slate-200">
                      <Users className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Belum ada karyawan absensi di {currentBranchInfo.shortName}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Gunakan form di samping atau buka menu /pengaturan/absensi
                      </p>
                    </div>
                  ) : (
                    branchAbsensiList.map((karyawan: any) => (
                      <div 
                        key={karyawan.id} 
                        className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 font-black text-xs uppercase">
                            {karyawan.nama ? karyawan.nama.substring(0, 2) : "KW"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-black text-sm text-slate-900">{karyawan.nama}</p>
                              <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {karyawan.team === "tim2" ? "Tim 2" : "Tim 1"}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                              User: <span className="font-mono text-slate-600">{karyawan.username}</span> &bull; Pass: ••••••••
                            </p>
                          </div>
                        </div>

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteAbsensiKaryawan(karyawan.id, karyawan.nama)}
                          className="rounded-xl text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }
  if (activeSection === "toko") {
    const currentBranchInfo = BRANCH_LIST[selectedBranch] || BRANCH_LIST.gdm;

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveSection(null)} className="rounded-2xl">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Identitas Bisnis</h1>
              <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Kelola nama, tagline, dan logo visual sistem per masing-masing toko</p>
            </div>
          </div>

          {/* Active Branch Indicator */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <span className={`h-2.5 w-2.5 rounded-full animate-pulse ${selectedBranch === 'tehwarga' ? 'bg-emerald-500' : selectedBranch === 'kedungreja' ? 'bg-cyan-500' : 'bg-red-500'}`} />
            <div className="text-left">
              <p className="text-[10px] font-black uppercase text-slate-900 leading-none">{currentBranchInfo.shortName}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{currentBranchInfo.code} &bull; Terisolasi</p>
            </div>
          </div>
        </div>

        {/* Branch Switcher Tabs */}
        <div className="bg-white p-2 sm:p-2.5 rounded-[2rem] border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2">
            Pilih Toko:
          </span>
          {(['gdm', 'kedungreja', 'tehwarga'] as BranchId[]).map((bId) => {
            const isSelected = selectedBranch === bId;
            const bInfo = BRANCH_LIST[bId];
            return (
              <button
                key={bId}
                type="button"
                onClick={() => setSelectedBranch(bId)}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-200 ${
                  isSelected 
                    ? bId === 'tehwarga' 
                      ? 'bg-emerald-700 text-white shadow-md shadow-emerald-900/20 scale-[1.02]' 
                      : bId === 'kedungreja'
                      ? 'bg-cyan-700 text-white shadow-md shadow-cyan-900/20 scale-[1.02]'
                      : 'bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-[1.02]'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-100'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-white' : bId === 'tehwarga' ? 'bg-emerald-500' : bId === 'kedungreja' ? 'bg-cyan-500' : 'bg-red-500'}`} />
                <span>{bInfo.shortName}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {bInfo.code}
                </span>
              </button>
            );
          })}
        </div>

        <Card className="rounded-[3rem] border-none shadow-sm bg-white p-6 sm:p-10 space-y-8">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-900">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-xs font-bold leading-relaxed">
              Anda sedang mengonfigurasi identitas untuk <strong className="font-black underline">{currentBranchInfo.name}</strong>. Logo dan nama yang Anda ubah di sini hanya akan berlaku untuk outlet ini dan tidak akan bersinggungan dengan toko lain.
            </p>
          </div>

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
                  <div className="h-24 w-48 flex items-center justify-center bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 tracking-widest text-center px-4">
                    Belum Ada Logo Landing
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
                  <div className="h-24 w-48 flex items-center justify-center bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 tracking-widest text-center px-4">
                    Belum Ada Logo Header
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
              Simpan Identitas ({currentBranchInfo.shortName})
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
