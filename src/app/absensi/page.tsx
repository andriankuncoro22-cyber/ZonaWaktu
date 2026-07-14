"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Clock, 
  MapPin, 
  LogOut, 
  Home, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  CalendarDays,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";
import { useFirestore } from "@/firebase";
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";

// --- Types ---
interface KaryawanUser {
  id: string;
  nama: string;
  username: string;
  status?: string;
  shift?: string;
  [key: string]: unknown;
}

interface AttendanceLog {
  id: string;
  karyawanId: string;
  nama: string;
  tanggal: string;
  jamMasuk: string;
  jamPulang: string;
  selfieUrl?: string;
  [key: string]: unknown;
}

interface AbsensiConfig {
  lat: string;
  lng: string;
  radius: string;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  cloudinaryFolder?: string;
  location?: AbsensiConfig;
  [key: string]: unknown;
}

// Fungsi untuk menghitung jarak antara dua koordinat (meter)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Jari-jari bumi dalam meter
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function AbsensiKaryawanPage() {
  const db = useFirestore();
  const [user, setUser] = useState<KaryawanUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [attendanceToday, setAttendanceToday] = useState<AttendanceLog | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [config, setConfig] = useState<AbsensiConfig | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const docRef = doc(db, "settings", "absensi_config");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setConfig(snap.data() as AbsensiConfig);
      }
    } catch (e) {
      console.error("Failed to fetch location config", e);
    }
  }, [db]);

  const fetchAttendanceData = useCallback(async (karyawanId: string) => {
    const today = new Date().toLocaleDateString('id-ID');
    const q = query(
      collection(db, "absensi_logs"), 
      where("karyawanId", "==", karyawanId),
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
    setHistory(logs);
    
    const todayLog = logs.find((l) => l.tanggal === today);
    if (todayLog) setAttendanceToday(todayLog);
  }, [db]);

  const checkPersistedUser = useCallback(async () => {
    await Promise.resolve();
    try {
      const saved = localStorage.getItem("absensi_user");
      if (saved) {
        const userData = JSON.parse(saved) as KaryawanUser;
        setUser(userData);
        await fetchAttendanceData(userData.id);
      }
    } catch (e) {
      console.error("Auth check failed", e);
    } finally {
      setCheckingAuth(false);
    }
  }, [fetchAttendanceData]);

  // Clock tick — setState inside a callback, not the effect body directly
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // One-time initialization: restore session + load location config
  useEffect(() => {
    checkPersistedUser();
    fetchConfig();
  }, [checkPersistedUser, fetchConfig]);



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.username || !loginData.password) return;
    
    setLoading(true);
    try {
      const q = query(
        collection(db, "karyawan"), 
        where("username", "==", loginData.username), 
        where("password", "==", loginData.password)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as KaryawanUser;
        setUser(userData);
        localStorage.setItem("absensi_user", JSON.stringify(userData));
        setLoginData({ username: "", password: "" }); 
        await fetchAttendanceData(userData.id);
      } else {
        alert("Username atau Password salah!");
      }
    } catch (err) {
      console.error("Login error", err);
      alert("Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("absensi_user");
    setUser(null);
    setAttendanceToday(null);
    setHistory([]);
    setLoginData({ username: "", password: "" }); 
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const startCamera = async () => {
    if (!isWithinRadius) {
      alert("Anda berada di luar radius kantor. Mendekat terlebih dahulu sebelum membuka kamera.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Browser ini tidak mendukung kamera. Gunakan perangkat mobile atau browser modern.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      console.error("Camera failed", error);
      alert("Tidak bisa membuka kamera. Pastikan izin kamera sudah diberikan.");
    }
  };

  const captureSelfie = async () => {
    if (!videoRef.current || !cameraReady) {
      alert("Kamera belum siap. Silakan buka kamera terlebih dahulu.");
      return;
    }

    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
      const uploadedUrl = await uploadToCloudinary(file, config);
      setSelfiePreview(uploadedUrl);
      return uploadedUrl;
    } catch (error) {
      console.error("Selfie failed", error);
      alert("Gagal mengambil selfie. Coba lagi.");
    } finally {
      setCapturing(false);
    }
  };

  const handleAbsen = async (type: 'masuk' | 'pulang') => {
    if (!isWithinRadius) {
      alert("Anda berada di luar jangkauan lokasi kantor. Silakan mendekat ke area toko.");
      return;
    }

    if (!selfiePreview) {
      const uploadedUrl = await captureSelfie();
      if (!uploadedUrl) {
        alert("Foto selfie wajib diambil sebelum absen.");
        return;
      }
    }

    const today = new Date().toLocaleDateString('id-ID');
    const time = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    try {
      if (type === 'masuk') {
        await addDoc(collection(db, "absensi_logs"), {
          karyawanId: user.id,
          nama: user.nama,
          shift: user.shift || 'default',
          tanggal: today,
          jamMasuk: time,
          jamPulang: "-",
          selfieUrl: selfiePreview,
          timestamp: serverTimestamp()
        });
        setAttendanceToday({ id: "", karyawanId: user.id, nama: user.nama, tanggal: today, jamMasuk: time, jamPulang: "-", selfieUrl: selfiePreview ?? undefined });
      } else {
        alert("Sesi Absen Pulang Tercatat.");
      }
      await fetchAttendanceData(user.id);
      stopCamera();
    } catch (e) {
      console.error("Absen failed", e);
    }
  };

  const validateLocation = useCallback(() => {
    const locationConfig = config?.location || config;
    if (!locationConfig) return;

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        const dist = getDistance(
          userLat, 
          userLng, 
          parseFloat(locationConfig.lat), 
          parseFloat(locationConfig.lng)
        );
        
        setDistance(Math.round(dist));
        setIsWithinRadius(dist <= parseFloat(locationConfig.radius));
      }, (error) => {
        console.error("Geolocation error:", error);
        alert("Gagal mendapatkan lokasi. Pastikan izin GPS aktif.");
      }, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
    }
  }, [config]);

  useEffect(() => {
    if (config) {
      validateLocation();
    }
  }, [config, validateLocation]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#8b1a1a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#8b1a1a] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "30px 30px" }}></div>
        
        <Card className="w-full max-w-md rounded-[3rem] p-12 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-700 relative z-10">
          <div className="text-center mb-10">
            <div className="h-20 w-20 rounded-[2rem] bg-primary/5 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <User className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Portal Absensi</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Zona Waktu Coffee & Teh Bakar</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Username</Label>
              <Input 
                value={loginData.username}
                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold"
                placeholder="Masukkan username..."
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Password</Label>
              <Input 
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold"
                placeholder="••••••••"
                autoComplete="off"
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20"
            >
              {loading ? "Mengecek Akses..." : "Masuk Ke Portal"}
            </Button>
          </form>
          <div className="mt-10 text-center">
             <Link href="/" className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">Kembali Ke Beranda</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col items-center p-6 md:p-12 font-sans relative">
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shadow-sm">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-primary uppercase italic leading-none">{user.nama}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Status: {user.status || 'Aktif'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm hover:bg-slate-50 border border-slate-100">
              <Home className="h-5 w-5 text-slate-400" />
            </Button>
          </Link>
          <Button onClick={handleLogout} variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm hover:bg-slate-50 border border-slate-100">
            <LogOut className="h-5 w-5 text-slate-400" />
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-2xl bg-[#8b1a1a] rounded-[3rem] p-10 md:p-16 text-white shadow-2xl shadow-primary/20 relative overflow-hidden mb-8">
        <div className="relative z-10">
          <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-4 tabular-nums">
            {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="flex items-baseline gap-2 mb-10">
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter tabular-nums">
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </h1>
            <span className="text-2xl opacity-40 font-black mb-2 tabular-nums">
              {currentTime.toLocaleTimeString('id-ID', { second: '2-digit' })}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border",
              isWithinRadius ? "bg-white/10 border-white/20" : "bg-rose-500/20 border-rose-500/40"
            )}>
              <MapPin className="h-3 w-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                {isWithinRadius ? 'Dalam Area Kantor' : `Luar Radius (${distance}m)`}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
              <Clock className="h-3 w-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                ZONA WAKTU AKTIF
              </span>
            </div>
          </div>
        </div>
        <div className="absolute top-1/2 -right-10 -translate-y-1/2 opacity-10 pointer-events-none">
          <Clock className="h-64 w-64" />
        </div>
      </Card>

      <Card className="w-full max-w-2xl rounded-[2rem] bg-white p-6 border-none shadow-sm mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selfie Absensi</p>
            <p className="text-sm font-black text-slate-800">Foto wajib diambil langsung dari kamera</p>
          </div>
          <Button onClick={startCamera} disabled={!isWithinRadius} className="rounded-xl bg-primary text-white h-10 px-4 text-[9px] font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed">Buka Kamera</Button>
        </div>
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-4 items-start">
          <div className="rounded-[1.5rem] border border-slate-200 overflow-hidden bg-slate-50 min-h-[240px] flex items-center justify-center">
            {cameraReady ? (
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
            ) : (
              <p className="text-center text-sm font-black uppercase tracking-[0.2em] text-slate-400">Kamera belum aktif</p>
            )}
          </div>
          <div className="space-y-3">
            <Button onClick={captureSelfie} disabled={capturing || !cameraReady} className="w-full rounded-xl bg-slate-900 text-white h-12 font-black uppercase text-[9px]">{capturing ? "Mengambil Foto..." : "Ambil Selfie"}</Button>
            <Button onClick={stopCamera} variant="outline" className="w-full rounded-xl h-12 font-black uppercase text-[9px]">Tutup Kamera</Button>
            {selfiePreview ? (
              <Image src={selfiePreview} alt="Selfie absensi" width={400} height={160} className="w-full h-40 object-cover rounded-[1.2rem] border border-slate-200" unoptimized />
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-slate-200 p-4 text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Foto selfie belum diambil</div>
            )}
          </div>
        </div>
      </Card>

      <div className="w-full max-w-2xl grid grid-cols-2 gap-4 mb-6">
        <Card className="rounded-[2.5rem] bg-white p-8 border-none shadow-sm flex flex-col items-start gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Masuk</p>
          <p className="text-2xl font-black text-primary tabular-nums">{attendanceToday?.jamMasuk || "--:--:--"}</p>
          {attendanceToday?.jamMasuk && attendanceToday.jamMasuk !== "-" && (
            <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase">Hadir</div>
          )}
          {!attendanceToday?.jamMasuk && (
             <Button 
               disabled={!isWithinRadius}
               onClick={() => handleAbsen('masuk')} 
               className="mt-2 w-full rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase text-[9px] h-10 disabled:opacity-50"
             >
               Absen Masuk
             </Button>
          )}
        </Card>
        <Card className="rounded-[2.5rem] bg-white p-8 border-none shadow-sm flex flex-col items-start gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pulang</p>
          <p className="text-2xl font-black text-primary tabular-nums">{attendanceToday?.jamPulang || "--:--:--"}</p>
          {attendanceToday?.jamPulang && attendanceToday.jamPulang !== "-" && (
            <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase">Selesai</div>
          )}
          {attendanceToday?.jamMasuk && (!attendanceToday?.jamPulang || attendanceToday.jamPulang === "-") && (
             <Button 
               disabled={!isWithinRadius}
               onClick={() => handleAbsen('pulang')} 
               className="mt-2 w-full rounded-xl bg-rose-600 text-white font-black uppercase text-[9px] h-10 disabled:opacity-50"
             >
               Absen Pulang
             </Button>
          )}
        </Card>
      </div>

      {attendanceToday?.jamMasuk && (
        <Card className="w-full max-w-2xl rounded-[1.5rem] bg-emerald-50 p-8 border border-emerald-100 flex items-center justify-center gap-4 mb-6 animate-in slide-in-from-top-4">
          <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">SESI ABSEN TERVERIFIKASI</p>
        </Card>
      )}

      {!isWithinRadius && (
        <Card className="w-full max-w-2xl rounded-[1.5rem] bg-rose-50 p-6 border border-rose-100 flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">LUAR RADIUS TOKO</p>
              <p className="text-[8px] font-bold text-rose-400 uppercase">
                Jarak Anda: {distance !== null ? `${distance} meter` : "Mengecek..."}
              </p>
            </div>
          </div>
          <Button 
            onClick={validateLocation}
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-full hover:bg-rose-100 text-rose-400"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </Card>
      )}

      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6 px-4">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-primary">Riwayat Kehadiran</h3>
        </div>
        <div className="space-y-3">
          {history.length > 0 ? history.map((log) => (
            <Card key={log.id} className="rounded-3xl p-6 bg-white border-none shadow-sm flex flex-col gap-3 group hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-800 uppercase italic tracking-tight">{log.tanggal}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tabular-nums">
                    {log.jamMasuk} - {log.jamPulang}
                  </p>
                </div>
                <div className="px-4 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase">Hadir</div>
              </div>
              {log.selfieUrl ? (
                <Image src={log.selfieUrl} alt="Selfie absensi" width={600} height={144} className="w-full h-36 object-cover rounded-[1rem] border border-slate-200" unoptimized />
              ) : null}
            </Card>
          )) : (
            <p className="text-center py-10 text-[10px] font-black text-slate-300 uppercase tracking-widest">Belum ada riwayat</p>
          )}
        </div>
      </div>
    </div>
  );
}
