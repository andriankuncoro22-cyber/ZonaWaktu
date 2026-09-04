
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  Clock, 
  MapPin, 
  Camera,
  Users, 
  Monitor, 
  Trash2, 
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirestore, useCollection, useMemoFirebase, collection, doc } from "@/firebase";
import { setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, getDoc, getDocs, writeBatch, serverTimestamp, Firestore } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { normalizeBranchId } from "@/lib/branch-helper";
import Image from "next/image";

interface KaryawanData {
  id: string;
  nama?: string;
  username?: string;
  password?: string;
  gender?: string;
  team?: string;
  cabang?: string;
  status?: string;
  [key: string]: unknown;
}

interface AbsensiLogData {
  id: string;
  karyawanId?: string;
  nama?: string;
  tanggal?: string;
  shift?: string;
  jamMasuk?: string;
  jamPulang?: string;
  selfieUrl?: string;
  cabang?: string;
  timestamp?: unknown;
  [key: string]: unknown;
}

const calculateTotalWorkHours = (jamMasuk?: string, jamPulang?: string): string => {
  if (!jamMasuk || !jamPulang || jamPulang === "-" || jamMasuk === "-") {
    return "-";
  }

  const parseTimeToSeconds = (timeStr: string): number | null => {
    const cleaned = timeStr.trim().replace(/\./g, ":");
    const parts = cleaned.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
    if (isNaN(h) || isNaN(m)) return null;
    return h * 3600 + m * 60 + (isNaN(s) ? 0 : s);
  };

  const startSec = parseTimeToSeconds(jamMasuk);
  const endSec = parseTimeToSeconds(jamPulang);

  if (startSec === null || endSec === null) return "-";

  let diffSec = endSec - startSec;
  if (diffSec < 0) {
    diffSec += 24 * 3600;
  }

  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (hours === 0 && minutes === 0) {
    return "0 Menit";
  }

  if (hours === 0) {
    return `${minutes} Menit`;
  }

  if (minutes === 0) {
    return `${hours} Jam`;
  }

  return `${hours} Jam, ${minutes} Menit`;
};

export default function PengaturanAbsensiPage() {
  const db = useFirestore();
  const [activeTab, setActiveTab] = useState("jam-kerja");
  const [selectedBranch, setSelectedBranch] = useState<"all" | "gdm" | "kedungreja" | "tehwarga">("all");
  const [syncing, setSyncing] = useState(false);

  // State for Jam Kerja
  const [shifts, setShifts] = useState({
    pagi: { masuk: "08:00", pulang: "16:00" },
    siang: { masuk: "14:00", pulang: "22:00" }
  });

  // State for Lokasi
  const [location, setLocation] = useState({
    lat: "-6.2000",
    lng: "106.8166",
    radius: "50"
  });
  const [cloudinaryConfig, setCloudinaryConfig] = useState({
    cloudinaryCloudName: "",
    cloudinaryUploadPreset: "",
    cloudinaryFolder: "absensi-selfie"
  });

  // State for Scheduling
  const [selectedDate, setSelectedDate] = useState(new Date());
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const monthLabel = selectedDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: karyawanList } = useCollection(karyawanQuery);

  const karyawanMap = useMemo(() => {
    const map: Record<string, KaryawanData> = {};
    ((karyawanList as KaryawanData[]) || []).forEach(k => {
      if (k.id) map[k.id] = k;
      if (k.username) map[k.username.toLowerCase()] = k;
      if (k.nama) map[k.nama.toLowerCase()] = k;
    });
    return map;
  }, [karyawanList]);

  // Map each attendance log to its real branch (prioritizing employee master data, then log.cabang)
  const getLogBranch = useCallback((log: AbsensiLogData): "gdm" | "kedungreja" | "tehwarga" => {
    const kId = log.karyawanId ? String(log.karyawanId) : "";
    if (kId && karyawanMap[kId]?.cabang) {
      return normalizeBranchId(karyawanMap[kId].cabang);
    }
    const kNama = log.nama ? String(log.nama).trim().toLowerCase() : "";
    if (kNama && karyawanMap[kNama]?.cabang) {
      return normalizeBranchId(karyawanMap[kNama].cabang);
    }
    if (log.cabang) {
      return normalizeBranchId(log.cabang);
    }
    return "gdm";
  }, [karyawanMap]);

  const filteredKaryawanList = useMemo(() => {
    const all = (karyawanList as KaryawanData[]) || [];
    if (selectedBranch === "all") return all;
    return all.filter((k) => normalizeBranchId(k.cabang) === selectedBranch);
  }, [karyawanList, selectedBranch]);

  const tim1Karyawan = useMemo(() => {
    return filteredKaryawanList.filter(k => k.team !== "tim2");
  }, [filteredKaryawanList]);

  const tim2Karyawan = useMemo(() => {
    return filteredKaryawanList.filter(k => k.team === "tim2");
  }, [filteredKaryawanList]);

  // Fetch Schedules
  const monthKey = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}`;
  const schedulesQuery = useMemoFirebase(() => 
    query(collection(db, "shifting_schedules"), where("month", "==", monthKey)), 
    [db, monthKey]
  );
  const { data: schedulesData } = useCollection(schedulesQuery);

  // Fetch Monitoring
  const monitoringQuery = useMemoFirebase(() => query(collection(db, "absensi_logs"), orderBy("timestamp", "desc")), [db]);
  const { data: monitoringData } = useCollection(monitoringQuery);

  const [selectedDateStr, setSelectedDateStr] = useState("");

  const filteredMonitoringLogs = useMemo(() => {
    if (!monitoringData) return [];
    const logs = monitoringData as AbsensiLogData[];
    if (selectedBranch === "all") return logs;
    return logs.filter((log) => getLogBranch(log) === selectedBranch);
  }, [monitoringData, selectedBranch, getLogBranch]);

  const todayLogs = useMemo(() => {
    if (!filteredMonitoringLogs) return [];
    if (!selectedDateStr) return filteredMonitoringLogs;

    // Parse YYYY-MM-DD to DD/MM/YYYY and D/M/YYYY to match Firestore format
    const parts = selectedDateStr.split("-");
    if (parts.length !== 3) return [];
    const [year, month, day] = parts;
    const slash1 = `${Number(day)}/${Number(month)}/${year}`;
    const slash2 = `${day}/${month}/${year}`;

    return filteredMonitoringLogs.filter((log) => {
      const logDate = log.tanggal;
      return logDate === slash1 || logDate === slash2;
    });
  }, [filteredMonitoringLogs, selectedDateStr]);

  // Load Initial Config based on branch
  useEffect(() => {
    const loadConfig = async () => {
      const configDocName = 
        selectedBranch === "tehwarga" ? "absensi_config_tehwarga" :
        selectedBranch === "kedungreja" ? "absensi_config_kedungreja" :
        "absensi_config";

      const docRef = doc(db, "settings", configDocName);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.shifts) setShifts(data.shifts);
        if (data.location) setLocation(data.location);
        if (data.cloudinaryConfig) setCloudinaryConfig(data.cloudinaryConfig);
      }
    };
    loadConfig();
  }, [db, selectedBranch]);

  const handleSaveConfig = async (type: string) => {
    const configDocName = 
      selectedBranch === "tehwarga" ? "absensi_config_tehwarga" :
      selectedBranch === "kedungreja" ? "absensi_config_kedungreja" :
      "absensi_config";

    const configRef = doc(db, "settings", configDocName);
    try {
      if (type === 'jam-kerja') {
        await setDoc(configRef, { shifts }, { merge: true });
      } else if (type === 'lokasi') {
        await setDoc(configRef, { location }, { merge: true });
      } else if (type === 'cloudinary') {
        await setDoc(configRef, { cloudinaryConfig }, { merge: true });
      }
      alert(`Konfigurasi untuk ${selectedBranch === 'all' ? 'Default / Semua Toko' : selectedBranch.toUpperCase()} berhasil disimpan!`);
    } catch (e) {
      console.error(e);
    }
  };

  const formRef = useRef<HTMLDivElement>(null);
  const [editingKaryawan, setEditingKaryawan] = useState<KaryawanData | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formGender, setFormGender] = useState("Laki-laki");
  const [formTeam, setFormTeam] = useState("tim1");
  const [formCabang, setFormCabang] = useState<"gdm" | "kedungreja" | "tehwarga">("gdm");
  const [filterBranch, setFilterBranch] = useState<string>("all");

  // Helper untuk sinkronisasi kredensial ke Firestore untuk SEMUA TOKO (GDM, Kedungreja, Teh Warga)
  // Menjamin seluruh cabang tersinkronisasi bersamaan tanpa saling menghapus kasir/absensi
  const syncCredentialsToFirestore = async (firestoreDb: Firestore) => {
    const snapshot = await getDocs(collection(firestoreDb, "karyawan"));
    const allBranches: ("gdm" | "kedungreja" | "tehwarga")[] = ["gdm", "kedungreja", "tehwarga"];
    let totalAll = 0;

    for (const b of allBranches) {
      const branchAbsensiUsers: KaryawanData[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const cleanUsername = String(data.username || "").trim();
        const cleanPassword = String(data.password || "").trim();
        const cleanNama = String(data.nama || cleanUsername).trim();
        const userCabang = normalizeBranchId(data.cabang);

        if (cleanUsername && cleanPassword && userCabang === b) {
          totalAll++;
          branchAbsensiUsers.push({
            id: d.id,
            username: cleanUsername,
            password: cleanPassword,
            nama: cleanNama,
            role: "employee",
            cabang: b,
            gender: data.gender || "Laki-laki",
            team: data.team || "tim1",
            status: data.status || "aktif"
          });
        }
      });

      // 1. Simpan absensi murni ke absensi_logins_<b>
      await setDoc(doc(firestoreDb, "employee_credentials", `absensi_logins_${b}`), {
        users: branchAbsensiUsers,
        totalUsers: branchAbsensiUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Ambil system_logins_<b> agar akun kasir/POS cabang ini tidak terhapus
      const sysSnap = await getDoc(doc(firestoreDb, "employee_credentials", `system_logins_${b}`));
      const existingSystemUsers: KaryawanData[] = sysSnap.exists() ? (sysSnap.data().users || []) : [];

      // 3. Merge system kasir + absensi untuk cabang ini
      const mergedMap = new Map<string, KaryawanData>();
      existingSystemUsers.forEach(u => {
        if (u.username) mergedMap.set(u.username.toLowerCase(), { ...u, cabang: b });
      });
      branchAbsensiUsers.forEach(u => {
        if (u.username && !mergedMap.has(u.username.toLowerCase())) {
          mergedMap.set(u.username.toLowerCase(), u);
        }
      });
      const combinedUsers = Array.from(mergedMap.values());

      // 4. Update logins_<b> untuk cabang ini
      await setDoc(doc(firestoreDb, "employee_credentials", `logins_${b}`), {
        users: combinedUsers,
        totalUsers: combinedUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (b === "gdm") {
        await setDoc(doc(firestoreDb, "employee_credentials", "logins"), {
          users: combinedUsers,
          totalUsers: combinedUsers.length,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    // Sinkronisasi info ke absensi_config
    await setDoc(doc(firestoreDb, "settings", "absensi_config"), {
      lastGlobalSync: serverTimestamp(),
      totalActiveKaryawan: totalAll
    }, { merge: true });

    return totalAll;
  };

  const handleSaveKaryawan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanNama = formNama.trim();
    const cleanUsername = formUsername.trim();
    const cleanPassword = formPassword.trim();

    if (!cleanNama || !cleanUsername || !cleanPassword) {
      alert("Nama, Username, dan Password wajib diisi!");
      return;
    }

    try {
      const data = {
        nama: cleanNama,
        username: cleanUsername,
        password: cleanPassword,
        gender: formGender,
        team: formTeam,
        cabang: formCabang,
        status: "aktif",
        updatedAt: serverTimestamp()
      };

      if (editingKaryawan) {
        await updateDoc(doc(db, "karyawan", editingKaryawan.id), data);
      } else {
        await addDoc(collection(db, "karyawan"), {
          ...data,
          createdAt: serverTimestamp()
        });
      }

      // Otomatis sinkronisasi kredensial ke SELURUH CABANG
      await syncCredentialsToFirestore(db);

      alert(editingKaryawan ? "Data karyawan berhasil diupdate & disinkronkan ke seluruh cabang!" : "Karyawan baru berhasil ditambahkan & disinkronkan ke seluruh cabang!");

      // Reset Form
      setEditingKaryawan(null);
      setFormNama("");
      setFormUsername("");
      setFormPassword("");
      setFormGender("Laki-laki");
      setFormTeam("tim1");
      setFormCabang("gdm");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan data karyawan.");
    }
  };

  const handleSyncKaderisasi = async () => {
    setSyncing(true);
    try {
      const snapshot = await getDocs(collection(db, "karyawan"));
      const batch = writeBatch(db);
      
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const cleanUsername = String(data.username || "").trim();
        const cleanPassword = String(data.password || "").trim();
        const cleanNama = String(data.nama || cleanUsername).trim();
        const cleanCabang = normalizeBranchId(data.cabang);

        batch.update(d.ref, { 
          nama: cleanNama,
          username: cleanUsername,
          password: cleanPassword,
          cabang: cleanCabang,
          status: "aktif",
          lastSynced: serverTimestamp() 
        });
      });
      
      await batch.commit();
      
      // Sinkronkan seluruh kredensial logins untuk SEMUA TOKO (GDM, Kedungreja, Teh Warga)
      const totalSynced = await syncCredentialsToFirestore(db);

      alert(`Sinkronisasi Kaderisasi Berhasil!\n${totalSynced} akun karyawan aktif telah disinkronkan ke Firestore untuk SEMUA TOKO (PC, Mobile Android, dan POS).`);
    } catch (err) {
      console.error("Error syncing kaderisasi:", err);
      alert("Gagal melakukan sinkronisasi kaderisasi.");
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSchedule = async (empId: string, day: number, type: string) => {
    const scheduleId = `${empId}_${monthKey}_${day}`;
    const docRef = doc(db, "shifting_schedules", scheduleId);
    await setDoc(docRef, {
      empId,
      month: monthKey,
      day,
      type, // 'shift1', 'shift2', 'libur'
      updatedAt: serverTimestamp()
    });
  };

  const [processingSchedule, setProcessingSchedule] = useState(false);

  const handleAutoFillSchedules = async () => {
    if (!karyawanList || karyawanList.length === 0) return;
    const confirm = window.confirm("Apakah Anda yakin ingin mengisi otomatis seluruh jadwal bulan ini dengan rotasi harian (Tim 1: S1/S2 bergantian, Tim 2: S2/S1 bergantian)?");
    if (!confirm) return;

    setProcessingSchedule(true);
    try {
      const batch = writeBatch(db);
      
      (karyawanList as KaryawanData[]).forEach((k) => {
        const isTim2 = k.team === "tim2";
        for (let day = 1; day <= daysInMonth; day++) {
          const isOddDay = day % 2 !== 0;
          let shiftType = "shift1";
          
          if (isTim2) {
            // Tim 2: odd S2, even S1
            shiftType = isOddDay ? "shift2" : "shift1";
          } else {
            // Tim 1: odd S1, even S2
            shiftType = isOddDay ? "shift1" : "shift2";
          }

          const scheduleId = `${k.id}_${monthKey}_${day}`;
          const docRef = doc(db, "shifting_schedules", scheduleId);
          batch.set(docRef, {
            empId: k.id,
            month: monthKey,
            day,
            type: shiftType,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      await batch.commit();
      alert("Seluruh jadwal bulan ini berhasil diisi otomatis dengan rotasi harian!");
    } catch (err) {
      console.error(err);
      alert("Gagal mengisi otomatis jadwal.");
    } finally {
      setProcessingSchedule(false);
    }
  };

  const handleClearSchedules = async () => {
    const confirm = window.confirm("Apakah Anda yakin ingin menghapus semua jadwal untuk bulan ini?");
    if (!confirm) return;

    setProcessingSchedule(true);
    try {
      const q = query(collection(db, "shifting_schedules"), where("month", "==", monthKey));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert("Tidak ada jadwal yang perlu dihapus.");
        return;
      }

      const batch = writeBatch(db);
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      alert("Semua jadwal bulan ini berhasil dihapus!");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus jadwal.");
    } finally {
      setProcessingSchedule(false);
    }
  };

  const getScheduleType = (empId: string, day: number) => {
    const found = schedulesData?.find(s => s.empId === empId && s.day === day);
    return found?.type || "libur";
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
    setSelectedDate(newDate);
  };

  const renderBranchBadge = (log: AbsensiLogData) => {
    const branch = getLogBranch(log);
    if (branch === "kedungreja") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 text-[8px] font-black uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          Zona Kedungreja
        </span>
      );
    }
    if (branch === "tehwarga") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-black uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Teh Warga GDM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-black uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Zona Waktu GDM
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Absensi</h1>
          <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Sistem Kehadiran Zona Waktu</p>
        </div>

        {/* Store / Branch Selector Bar */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setSelectedBranch("all")}
            className={cn(
              "px-3 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              selectedBranch === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
            )}
          >
            Semua Toko
          </button>
          <button
            type="button"
            onClick={() => setSelectedBranch("gdm")}
            className={cn(
              "px-3 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5",
              selectedBranch === "gdm"
                ? "bg-emerald-600 text-white shadow-sm font-black"
                : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/60"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", selectedBranch === "gdm" ? "bg-white" : "bg-emerald-500")} />
            Zona Waktu GDM
          </button>
          <button
            type="button"
            onClick={() => setSelectedBranch("kedungreja")}
            className={cn(
              "px-3 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5",
              selectedBranch === "kedungreja"
                ? "bg-cyan-600 text-white shadow-sm font-black"
                : "text-slate-600 hover:text-cyan-700 hover:bg-cyan-50/60"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", selectedBranch === "kedungreja" ? "bg-white" : "bg-cyan-500")} />
            Zona Kedungreja
          </button>
          <button
            type="button"
            onClick={() => setSelectedBranch("tehwarga")}
            className={cn(
              "px-3 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5",
              selectedBranch === "tehwarga"
                ? "bg-amber-600 text-white shadow-sm font-black"
                : "text-slate-600 hover:text-amber-700 hover:bg-amber-50/60"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", selectedBranch === "tehwarga" ? "bg-white" : "bg-amber-500")} />
            Teh Warga GDM
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto lg:h-16 rounded-[1.5rem] bg-white shadow-sm p-2 mb-8 gap-2">
          <TabsTrigger value="jam-kerja" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <Clock className="h-4 w-4 mr-2 hidden md:inline" /> Jam Kerja
          </TabsTrigger>
          <TabsTrigger value="lokasi" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <MapPin className="h-4 w-4 mr-2 hidden md:inline" /> Lokasi
          </TabsTrigger>
          <TabsTrigger value="cloudinary" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <Camera className="h-4 w-4 mr-2 hidden md:inline" /> Cloudinary
          </TabsTrigger>
          <TabsTrigger value="karyawan" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <Users className="h-4 w-4 mr-2 hidden md:inline" /> Karyawan
          </TabsTrigger>
          <TabsTrigger value="penjadwalan" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <CalendarDays className="h-4 w-4 mr-2 hidden md:inline" /> Penjadwalan
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="rounded-xl font-black uppercase text-[9px] md:text-[10px] tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-3">
            <Monitor className="h-4 w-4 mr-2 hidden md:inline" /> Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jam-kerja" className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-sm p-10 bg-white">
            <h3 className="text-xl font-black uppercase italic tracking-tight mb-8">Kelola Shifting</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-4">
                <p className="font-black text-primary uppercase text-xs tracking-widest">Shift 1 (Pagi)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jam Masuk</Label>
                    <Input type="time" value={shifts.pagi.masuk} onChange={(e) => setShifts({...shifts, pagi: {...shifts.pagi, masuk: e.target.value}})} className="rounded-xl bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jam Pulang</Label>
                    <Input type="time" value={shifts.pagi.pulang} onChange={(e) => setShifts({...shifts, pagi: {...shifts.pagi, pulang: e.target.value}})} className="rounded-xl bg-white" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-4">
                <p className="font-black text-primary uppercase text-xs tracking-widest">Shift 2 (Siang)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jam Masuk</Label>
                    <Input type="time" value={shifts.siang.masuk} onChange={(e) => setShifts({...shifts, siang: {...shifts.siang, masuk: e.target.value}})} className="rounded-xl bg-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jam Pulang</Label>
                    <Input type="time" value={shifts.siang.pulang} onChange={(e) => setShifts({...shifts, siang: {...shifts.siang, pulang: e.target.value}})} className="rounded-xl bg-white" />
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => handleSaveConfig('jam-kerja')} className="mt-8 rounded-2xl bg-primary px-8 font-black uppercase tracking-widest text-[10px] h-12 shadow-xl shadow-primary/20">
              Simpan Konfigurasi Jam
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="lokasi" className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-sm p-10 bg-white">
            <h3 className="text-xl font-black uppercase italic tracking-tight mb-8">Titik Koordinat Toko</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Latitude</Label>
                <Input value={location.lat} onChange={(e) => setLocation({...location, lat: e.target.value})} placeholder="-6.xxx" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Longitude</Label>
                <Input value={location.lng} onChange={(e) => setLocation({...location, lng: e.target.value})} placeholder="106.xxx" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Radius (Meter)</Label>
                <Input value={location.radius} onChange={(e) => setLocation({...location, radius: e.target.value})} placeholder="50" className="rounded-xl" />
              </div>
            </div>
            <Button onClick={() => handleSaveConfig('lokasi')} className="mt-8 rounded-2xl bg-primary px-8 font-black uppercase tracking-widest text-[10px] h-12 shadow-xl shadow-primary/20">
              Simpan Lokasi
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="cloudinary" className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-sm p-10 bg-white">
            <h3 className="text-xl font-black uppercase italic tracking-tight mb-8">Konfigurasi Upload Selfie</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Cloud Name</Label>
                <Input value={cloudinaryConfig.cloudinaryCloudName} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryCloudName: e.target.value})} className="rounded-xl" placeholder="cloudinary-name" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Upload Preset</Label>
                <Input value={cloudinaryConfig.cloudinaryUploadPreset} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryUploadPreset: e.target.value})} className="rounded-xl" placeholder="unsigned_preset" />
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <Label className="text-[10px] font-black uppercase">Folder</Label>
              <Input value={cloudinaryConfig.cloudinaryFolder} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryFolder: e.target.value})} className="rounded-xl" placeholder="absensi-selfie" />
            </div>
            <Button onClick={() => handleSaveConfig('cloudinary')} className="mt-8 rounded-2xl bg-primary px-8 font-black uppercase tracking-widest text-[10px] h-12 shadow-xl shadow-primary/20">
              Simpan Konfigurasi Cloudinary
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="karyawan" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-8">
            <Card ref={formRef} className="rounded-[2.5rem] border-none shadow-sm p-8 bg-white h-fit">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase italic tracking-tight">
                  {editingKaryawan ? "Edit Karyawan" : "Tambah Karyawan"}
                </h3>
                {editingKaryawan && (
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setEditingKaryawan(null);
                      setFormNama("");
                      setFormUsername("");
                      setFormPassword("");
                      setFormGender("Laki-laki");
                      setFormTeam("tim1");
                      setFormCabang("gdm");
                    }}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 h-8 px-3 rounded-xl border border-slate-100"
                  >
                    Batal
                  </Button>
                )}
              </div>
              <form onSubmit={handleSaveKaryawan} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase">Nama Lengkap</Label>
                  <Input 
                    value={formNama} 
                    onChange={(e) => setFormNama(e.target.value)} 
                    required 
                    className="rounded-xl h-11" 
                    placeholder="Nama sesuai KTP..." 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Username</Label>
                    <Input 
                      value={formUsername} 
                      onChange={(e) => setFormUsername(e.target.value)} 
                      required 
                      className="rounded-xl h-11" 
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Password</Label>
                    <Input 
                      value={formPassword} 
                      onChange={(e) => setFormPassword(e.target.value)} 
                      type="password" 
                      required 
                      className="rounded-xl h-11" 
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Cabang Penempatan</Label>
                    <select 
                      value={formCabang} 
                      onChange={(e) => setFormCabang(e.target.value as "gdm" | "kedungreja" | "tehwarga")} 
                      required 
                      className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus-visible:outline-none"
                    >
                      <option value="gdm">ZW Gandrungmangu</option>
                      <option value="kedungreja">ZW Kedungreja</option>
                      <option value="tehwarga">Teh Warga GDM</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jenis Kelamin</Label>
                    <select 
                      value={formGender} 
                      onChange={(e) => setFormGender(e.target.value)} 
                      required 
                      className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus-visible:outline-none"
                    >
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Tim Karyawan</Label>
                    <select 
                      value={formTeam} 
                      onChange={(e) => setFormTeam(e.target.value)} 
                      required 
                      className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus-visible:outline-none"
                    >
                      <option value="tim1">Tim 1</option>
                      <option value="tim2">Tim 2</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] h-12 shadow-xl mt-4">
                  {editingKaryawan ? "Update Rincian" : "Simpan Karyawan"}
                </Button>
              </form>
            </Card>

            <Card className="lg:col-span-2 rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black uppercase italic tracking-tight">Database Karyawan</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Karyawan Terdaftar Per Outlet</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                    {[
                      { id: "all", label: "Semua" },
                      { id: "gdm", label: "ZW-01" },
                      { id: "kedungreja", label: "ZW-02" },
                      { id: "tehwarga", label: "TW-01" }
                    ].map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setFilterBranch(b.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                          filterBranch === b.id 
                            ? "bg-white text-slate-900 shadow-xs" 
                            : "text-slate-500 hover:text-slate-900"
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>

                  <Button 
                    variant="ghost" 
                    disabled={syncing}
                    onClick={handleSyncKaderisasi}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest text-primary gap-2 h-9 px-3 rounded-xl border border-primary/20 hover:bg-primary/5",
                      syncing && "opacity-50"
                    )}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} /> 
                    {syncing ? "Sinkron..." : "Sinkron Kaderisasi"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-8 py-4 text-[9px] font-black uppercase text-slate-500">Nama</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Cabang</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Username</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Detail</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(karyawanList as KaryawanData[])
                      ?.filter((k: KaryawanData) => filterBranch === "all" || normalizeBranchId(k.cabang) === filterBranch)
                      ?.map((k: KaryawanData) => (
                      <tr key={k.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-900">{k.nama}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-[7px] font-black uppercase px-2 py-0.5 rounded-full",
                              k.status === 'aktif' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                            )}>
                              {k.status || "Baru"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[9px] font-black uppercase px-2.5 py-1 rounded-lg",
                            (k.cabang === "kedungreja") 
                              ? "bg-cyan-50 text-cyan-700 border border-cyan-200" 
                              : (k.cabang === "tehwarga")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          )}>
                            {k.cabang === "kedungreja" ? "ZW Kedungreja" : k.cabang === "tehwarga" ? "Teh Warga" : "ZW Gandrungmangu"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-500">{k.username}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5 w-fit">
                              {k.gender || "Laki-laki"}
                            </span>
                            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 rounded-md px-2 py-0.5 w-fit">
                              {k.team === "tim2" ? "Tim 2" : "Tim 1"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                setEditingKaryawan(k);
                                setFormNama(k.nama || "");
                                setFormUsername(k.username || "");
                                setFormPassword(k.password || "");
                                setFormGender(k.gender || "Laki-laki");
                                setFormTeam(k.team || "tim1");
                                setFormCabang(normalizeBranchId(k.cabang));
                                setTimeout(() => {
                                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 50);
                              }} 
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={async () => {
                                if (window.confirm(`Hapus karyawan ${k.nama}?`)) {
                                  await deleteDoc(doc(db, "karyawan", k.id));
                                  await syncCredentialsToFirestore(db);
                                  alert(`Data karyawan ${k.nama} berhasil dihapus & kredensial seluruh toko tersinkronisasi.`);
                                }
                              }} 
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="penjadwalan" className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden p-4 sm:p-8">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tight">Penjadwalan Karyawan</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Atur Shift Harian Zona Waktu</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={handleAutoFillSchedules}
                    disabled={processingSchedule || !karyawanList || karyawanList.length === 0}
                    className="rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] h-10 px-4 shadow-sm"
                  >
                    Isi Otomatis
                  </Button>
                  <Button 
                    onClick={handleClearSchedules}
                    disabled={processingSchedule}
                    variant="ghost"
                    className="rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-black uppercase tracking-widest text-[9px] h-10 px-4"
                  >
                    Hapus Semua
                  </Button>
                </div>
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="rounded-xl h-10 w-10">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-black uppercase tracking-widest w-32 text-center">{monthLabel}</span>
                  <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="rounded-xl h-10 w-10">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 z-20 px-6 py-4 text-[9px] font-black uppercase text-slate-500 min-w-[200px] border-r border-slate-100">Nama Karyawan</th>
                    {Array.from({ length: daysInMonth }).map((_, i) => (
                      <th key={i} className="px-3 py-4 text-center text-[9px] font-black uppercase text-slate-500 border-r border-slate-100">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Header Tim 1 */}
                  <tr className="bg-amber-50/50">
                    <td className="sticky left-0 bg-amber-50/80 z-10 px-6 py-3 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.01)] font-black text-[9px] uppercase tracking-widest text-amber-700" colSpan={daysInMonth + 1}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" /> Karyawan Tim 1
                      </div>
                    </td>
                  </tr>
                  
                  {tim1Karyawan.map((k: KaryawanData) => (
                    <tr key={k.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 bg-white z-10 px-6 py-4 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-black text-slate-900 uppercase truncate">{k.nama}</p>
                      </td>
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const type = getScheduleType(k.id, day);
                        return (
                          <td key={i} className="px-1 py-2 text-center border-r border-slate-100">
                            <select 
                              value={type}
                              onChange={(e) => handleUpdateSchedule(k.id, day, e.target.value)}
                              className={cn(
                                "w-10 h-10 rounded-lg text-[9px] font-black appearance-none text-center cursor-pointer transition-all outline-none",
                                type === 'shift1' ? "bg-amber-100 text-amber-600 border border-amber-200" :
                                type === 'shift2' ? "bg-indigo-100 text-indigo-600 border border-indigo-200" :
                                "bg-slate-100 text-slate-400 border border-slate-200"
                              )}
                            >
                              <option value="shift1">S1</option>
                              <option value="shift2">S2</option>
                              <option value="libur">L</option>
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Spacer / Divider row for separation */}
                  <tr className="bg-slate-100/50">
                    <td className="sticky left-0 bg-slate-100/50 z-10 px-6 py-4 border-r border-slate-100" colSpan={daysInMonth + 1}>
                      <div className="h-4" /> {/* Visual spacer */}
                    </td>
                  </tr>

                  {/* Header Tim 2 */}
                  <tr className="bg-indigo-50/50">
                    <td className="sticky left-0 bg-indigo-50/80 z-10 px-6 py-3 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.01)] font-black text-[9px] uppercase tracking-widest text-indigo-700" colSpan={daysInMonth + 1}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-indigo-500" /> Karyawan Tim 2
                      </div>
                    </td>
                  </tr>

                  {tim2Karyawan.map((k: KaryawanData) => (
                    <tr key={k.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 bg-white z-10 px-6 py-4 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-black text-slate-900 uppercase truncate">{k.nama}</p>
                      </td>
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const type = getScheduleType(k.id, day);
                        return (
                          <td key={i} className="px-1 py-2 text-center border-r border-slate-100">
                            <select 
                              value={type}
                              onChange={(e) => handleUpdateSchedule(k.id, day, e.target.value)}
                              className={cn(
                                "w-10 h-10 rounded-lg text-[9px] font-black appearance-none text-center cursor-pointer transition-all outline-none",
                                type === 'shift1' ? "bg-amber-100 text-amber-600 border border-amber-200" :
                                type === 'shift2' ? "bg-indigo-100 text-indigo-600 border border-indigo-200" :
                                "bg-slate-100 text-slate-400 border border-slate-200"
                              )}
                            >
                              <option value="shift1">S1</option>
                              <option value="shift2">S2</option>
                              <option value="libur">L</option>
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 md:gap-6 px-4 py-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div className="flex items-center gap-2">
                 <div className="h-4 w-4 rounded-md bg-amber-100 border border-amber-200" />
                 <span className="text-[9px] font-black uppercase text-slate-500">S1: Shift 1 ({shifts.pagi.masuk}-{shifts.pagi.pulang})</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="h-4 w-4 rounded-md bg-indigo-100 border border-indigo-200" />
                 <span className="text-[9px] font-black uppercase text-slate-500">S2: Shift 2 ({shifts.siang.masuk}-{shifts.siang.pulang})</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="h-4 w-4 rounded-md bg-slate-100 border border-slate-200" />
                 <span className="text-[9px] font-black uppercase text-slate-500">L: Libur</span>
               </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden p-4 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black uppercase italic tracking-tight">Monitoring Absensi</h3>
                  {selectedBranch !== "all" && (
                    <span className={cn(
                      "px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                      selectedBranch === "gdm" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                      selectedBranch === "kedungreja" ? "bg-cyan-50 text-cyan-700 border border-cyan-200" :
                      "bg-amber-50 text-amber-700 border border-amber-200"
                    )}>
                      {selectedBranch === "gdm" ? "Zona Waktu GDM" : selectedBranch === "kedungreja" ? "Zona Kedungreja" : "Teh Warga GDM"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {selectedDateStr ? `Filter Tanggal: ${selectedDateStr.split("-").reverse().join("/")}` : `Menampilkan Semua Catatan (${todayLogs.length})`}
                </p>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider pl-2 hidden sm:inline">Pilih Tanggal:</span>
                <Input 
                  type="date" 
                  value={selectedDateStr} 
                  onChange={(e) => setSelectedDateStr(e.target.value)} 
                  className="bg-white border border-slate-200 text-xs font-black rounded-xl h-10 px-3 w-40 text-slate-700 shadow-sm" 
                />
                {selectedDateStr && (
                  <Button 
                    variant="ghost" 
                    onClick={() => setSelectedDateStr("")}
                    className="h-10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 rounded-xl bg-white shadow-sm border border-slate-100"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile View: Today's Cards */}
            <div className="block md:hidden space-y-4">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                {selectedDateStr 
                  ? `Absensi Tanggal ${selectedDateStr.split("-").reverse().join("-")} (${todayLogs.length})`
                  : `Histori Absensi (${todayLogs.length})`
                }
              </div>
              {todayLogs.length > 0 ? (
                todayLogs.map((log: AbsensiLogData) => (
                  <Card key={log.id} className="p-4 rounded-3xl border border-slate-100 bg-slate-50/50 flex flex-col gap-3 shadow-none">
                    <div className="flex gap-4 items-center">
                      {/* Selfie Image */}
                      <div className="relative h-20 w-20 rounded-2xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
                        {log.selfieUrl ? (
                          <Image src={log.selfieUrl as string} alt="Selfie" fill className="object-cover" unoptimized />
                        ) : (
                          <span className="text-[8px] font-black uppercase text-slate-400 text-center">No Photo</span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-black text-sm text-slate-900 uppercase italic truncate">{log.nama}</h4>
                          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border border-emerald-100 shrink-0">Hadir</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {renderBranchBadge(log)}
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[8px] font-bold shrink-0">{log.tanggal}</span>
                        </div>

                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                          {log.shift === 'shift1' ? 'Shift 1 (Pagi)' : 'Shift 2 (Siang)'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60">
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Masuk</p>
                        <p className="text-xs font-black text-emerald-600 tabular-nums">{log.jamMasuk || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Pulang</p>
                        <p className="text-xs font-black text-rose-600 tabular-nums">{log.jamPulang || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Total Kerja</p>
                        <p className="text-[11px] font-black text-indigo-600 tabular-nums leading-tight">
                          {calculateTotalWorkHours(log.jamMasuk, log.jamPulang)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl p-6">
                  Tidak ada data absensi untuk filter toko & tanggal ini.
                </div>
              )}
            </div>
            
            {/* Desktop View: Full History Table */}
            <div className="hidden md:block rounded-[2rem] border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[850px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500">Nama Karyawan</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Toko / Cabang</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Tanggal</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Masuk</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Pulang</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Total Jam Kerja</th>
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500">Selfie</th>
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todayLogs.length > 0 ? todayLogs.map((log: AbsensiLogData) => (
                      <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-8 py-4">
                          <p className="font-black text-sm text-slate-900 uppercase">{log.nama}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{log.shift === 'shift1' ? 'Shift 1' : 'Shift 2'}</p>
                        </td>
                        <td className="px-6 py-4">
                          {renderBranchBadge(log)}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-700 tabular-nums">{log.tanggal}</td>
                        <td className="px-6 py-4 text-sm font-black text-emerald-600 tabular-nums">{log.jamMasuk}</td>
                        <td className="px-6 py-4 text-sm font-black text-rose-600 tabular-nums">{log.jamPulang}</td>
                        <td className="px-6 py-4">
                          {log.jamPulang && log.jamPulang !== "-" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 font-black text-xs tabular-nums">
                              <Clock className="h-3 w-3 text-indigo-500" />
                              {calculateTotalWorkHours(log.jamMasuk, log.jamPulang)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold">
                              <Clock className="h-3 w-3 text-amber-500 animate-spin" />
                              Sedang Bekerja
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-4">
                          {log.selfieUrl ? (
                            <div className="relative h-14 w-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                              <Image src={log.selfieUrl as string} alt="Selfie absensi" fill className="object-cover" unoptimized />
                            </div>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-slate-400">Tidak ada</span>
                          )}
                        </td>
                        <td className="px-8 py-4 text-right">
                          <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-emerald-100">Hadir</span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="py-20 text-center opacity-40 italic text-xs font-black uppercase">
                          Belum ada data absensi untuk toko / tanggal yang dipilih
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
