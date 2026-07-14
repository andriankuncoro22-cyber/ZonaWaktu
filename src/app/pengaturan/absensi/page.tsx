
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Clock, 
  MapPin, 
  Camera,
  Users, 
  Monitor, 
  Save, 
  Plus, 
  Trash2, 
  RefreshCw,
  Search,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Pencil
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function PengaturanAbsensiPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("jam-kerja");
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

  const tim1Karyawan = useMemo(() => {
    return (karyawanList as any[] || []).filter(k => k.team !== "tim2");
  }, [karyawanList]);

  const tim2Karyawan = useMemo(() => {
    return (karyawanList as any[] || []).filter(k => k.team === "tim2");
  }, [karyawanList]);

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

  const todayLogs = useMemo(() => {
    if (!monitoringData) return [];
    if (!selectedDateStr) return monitoringData as any[];

    // Parse YYYY-MM-DD to DD/MM/YYYY and D/M/YYYY to match Firestore format
    const parts = selectedDateStr.split("-");
    if (parts.length !== 3) return [];
    const [year, month, day] = parts;
    const slash1 = `${Number(day)}/${Number(month)}/${year}`;
    const slash2 = `${day}/${month}/${year}`;

    return (monitoringData as any[]).filter((log: any) => {
      const logDate = log.tanggal;
      return logDate === slash1 || logDate === slash2;
    });
  }, [monitoringData, selectedDateStr]);

  // Load Initial Config
  useEffect(() => {
    const loadConfig = async () => {
      const docRef = doc(db, "settings", "absensi_config");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.shifts) setShifts(data.shifts);
        if (data.location) setLocation(data.location);
        if (data.cloudinaryConfig) setCloudinaryConfig(data.cloudinaryConfig);
      }
    };
    loadConfig();
  }, [db]);

  const handleSaveConfig = async (type: string) => {
    const configRef = doc(db, "settings", "absensi_config");
    try {
      if (type === 'jam-kerja') {
        await setDoc(configRef, { shifts }, { merge: true });
      } else if (type === 'lokasi') {
        await setDoc(configRef, { location }, { merge: true });
      } else if (type === 'cloudinary') {
        await setDoc(configRef, { cloudinaryConfig }, { merge: true });
      }
      alert("Konfigurasi berhasil disimpan!");
    } catch (e) {
      console.error(e);
    }
  };

  const formRef = useRef<HTMLDivElement>(null);
  const [editingKaryawan, setEditingKaryawan] = useState<any | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formGender, setFormGender] = useState("Laki-laki");
  const [formTeam, setFormTeam] = useState("tim1");

  const handleSaveKaryawan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const data = {
        nama: formNama,
        username: formUsername,
        password: formPassword,
        gender: formGender,
        team: formTeam,
        updatedAt: serverTimestamp()
      };

      if (editingKaryawan) {
        await updateDoc(doc(db, "karyawan", editingKaryawan.id), data);
        alert("Rincian karyawan berhasil diupdate!");
      } else {
        await addDoc(collection(db, "karyawan"), {
          ...data,
          createdAt: serverTimestamp(),
          status: "aktif"
        });
        alert("Karyawan baru berhasil ditambahkan!");
      }

      // Reset Form
      setEditingKaryawan(null);
      setFormNama("");
      setFormUsername("");
      setFormPassword("");
      setFormGender("Laki-laki");
      setFormTeam("tim1");
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
        // Memastikan setiap karyawan memiliki field status dan updatedAt yang sinkron
        batch.update(d.ref, { 
          status: "aktif",
          lastSynced: serverTimestamp() 
        });
      });
      
      await batch.commit();
      
      // Update global sync timestamp
      await setDoc(doc(db, "settings", "absensi_config"), {
        lastGlobalSync: serverTimestamp()
      }, { merge: true });

      alert("Sinkronisasi Kaderisasi Berhasil!");
    } catch (err) {
      console.error("Error syncing kaderisasi:", err);
      alert("Gagal melakukan sinkronisasi.");
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
      
      (karyawanList as any[]).forEach((k) => {
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Absensi</h1>
        <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Sistem Kehadiran Zona Waktu</p>
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
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <h3 className="text-lg font-black uppercase italic tracking-tight">Database Karyawan</h3>
                <Button 
                  variant="ghost" 
                  disabled={syncing}
                  onClick={handleSyncKaderisasi}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest text-primary gap-2",
                    syncing && "opacity-50"
                  )}
                >
                  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} /> 
                  {syncing ? "Sinkronisasi..." : "Sinkronisasi Kaderisasi"}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-8 py-4 text-[9px] font-black uppercase text-slate-500">Nama</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Username</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Detail</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {karyawanList?.map((k: any) => (
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
                              onClick={() => {
                                if (window.confirm(`Hapus karyawan ${k.nama}?`)) {
                                  deleteDoc(doc(db, "karyawan", k.id));
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
                  
                  {tim1Karyawan.map((k: any) => (
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

                  {tim2Karyawan.map((k: any) => (
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
                <h3 className="text-xl font-black uppercase italic tracking-tight">Monitoring Absensi</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 block md:hidden">Hari Ini: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl">
                <Input type="month" className="border-none bg-transparent font-black uppercase text-[10px]" />
                <Button className="rounded-xl bg-white shadow-sm border border-slate-100 text-slate-700 h-10 px-6 font-black uppercase text-[10px]">Cari</Button>
              </div>
            </div>

            {/* Mobile Date Picker Selection */}
            <div className="block md:hidden mb-4 flex items-center justify-between gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Filter Tanggal</span>
              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  value={selectedDateStr} 
                  onChange={(e) => setSelectedDateStr(e.target.value)} 
                  className="bg-white border-none text-xs font-black rounded-xl h-10 px-3 w-36 text-slate-700 shadow-sm" 
                />
                {selectedDateStr && (
                  <Button 
                    variant="ghost" 
                    onClick={() => setSelectedDateStr("")}
                    className="h-10 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 rounded-xl bg-white shadow-sm border border-slate-100"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile View: Today's Cards */}
            <div className="block md:hidden space-y-4">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                {selectedDateStr 
                  ? `Absensi Tanggal ${selectedDateStr.split("-").reverse().join("-")} (${todayLogs.length})`
                  : `Histori Semua Absensi (${todayLogs.length})`
                }
              </div>
              {todayLogs.length > 0 ? (
                todayLogs.map((log: any) => (
                  <Card key={log.id} className="p-4 rounded-3xl border border-slate-100 bg-slate-50/50 flex gap-4 items-center shadow-none">
                    {/* Selfie Image */}
                    <div className="relative h-20 w-20 rounded-2xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
                      {log.selfieUrl ? (
                        <img src={log.selfieUrl} alt="Selfie" className="h-full w-full object-cover" />
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
                      
                      <div className="flex items-center justify-between gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>{log.shift === 'shift1' ? 'Shift 1 (Pagi)' : 'Shift 2 (Siang)'}</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[8px] font-bold shrink-0">{log.tanggal}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Masuk</p>
                          <p className="text-xs font-black text-emerald-600 tabular-nums">{log.jamMasuk || "-"}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Pulang</p>
                          <p className="text-xs font-black text-rose-600 tabular-nums">{log.jamPulang || "-"}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs font-black uppercase border border-dashed rounded-3xl p-6">
                  Tidak ada absensi hari ini.
                </div>
              )}
            </div>
            
            {/* Desktop View: Full History Table */}
            <div className="hidden md:block rounded-[2rem] border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500">Nama Karyawan</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Tanggal</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Masuk</th>
                      <th className="px-6 py-5 text-[9px] font-black uppercase text-slate-500">Pulang</th>
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500">Selfie</th>
                      <th className="px-8 py-5 text-[9px] font-black uppercase text-slate-500 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monitoringData?.length > 0 ? monitoringData.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/20">
                        <td className="px-8 py-4">
                          <p className="font-black text-sm text-slate-900 uppercase">{log.nama}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{log.shift === 'shift1' ? 'Shift 1' : 'Shift 2'}</p>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium">{log.tanggal}</td>
                        <td className="px-6 py-4 text-sm font-black text-emerald-600 tabular-nums">{log.jamMasuk}</td>
                        <td className="px-6 py-4 text-sm font-black text-rose-600 tabular-nums">{log.jamPulang}</td>
                        <td className="px-8 py-4">
                          {log.selfieUrl ? (
                            <img src={log.selfieUrl} alt="Selfie absensi" className="h-16 w-16 object-cover rounded-xl border border-slate-200" />
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
                        <td colSpan={6} className="py-20 text-center opacity-30 italic text-xs">Belum ada data absensi untuk periode ini</td>
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
