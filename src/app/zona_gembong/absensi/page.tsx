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
import { useRouter } from "next/navigation";
import { useFirestore, collection, doc } from "@/firebase";
import { addDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, getDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { normalizeBranchId } from "@/lib/branch-helper";
import { loginWithFirebaseAuth, logoutWithFirebaseAuth } from "@/lib/auth-service";

// --- Types ---
interface KaryawanUser {
  id: string;
  nama: string;
  username: string;
  status?: string;
  shift?: string;
  cabang?: string;
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
  selfieMasukUrl?: string;
  selfiePulangUrl?: string;
  cabang?: string;
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

// Function to calculate distance between coordinates (meters)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function GembongAbsensiPage() {
  const db = useFirestore();
  const router = useRouter();
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
      // Check Gembong specific location first, then fallback
      const gembongDocRef = doc(db, "settings", "absensi_config_gembong");
      const gembongSnap = await getDoc(gembongDocRef);
      if (gembongSnap.exists()) {
        setConfig(gembongSnap.data() as AbsensiConfig);
        return;
      }

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
      const saved = localStorage.getItem("absensi_user_gembong");
      if (saved) {
        const userData = JSON.parse(saved) as KaryawanUser;
        const userCabang = normalizeBranchId(userData.cabang);
        if (userCabang === "gembong") {
          setUser(userData);
          await fetchAttendanceData(userData.id);
        } else {
          localStorage.removeItem("absensi_user_gembong");
        }
      }
    } catch (e) {
      console.error("Auth check failed", e);
    } finally {
      setCheckingAuth(false);
    }
  }, [fetchAttendanceData]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      checkPersistedUser();
      fetchConfig();
    });
  }, [checkPersistedUser, fetchConfig]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputUsername = (loginData.username || "").trim();
    const inputPassword = (loginData.password || "").trim();
    if (!inputUsername || !inputPassword) {
      alert("Silakan masukkan Username dan Password!");
      return;
    }
    
    setLoading(true);
    try {
      const res = await loginWithFirebaseAuth(db, inputUsername, inputPassword, {
        expectedRole: "employee",
        expectedBranch: "gembong",
        loginType: "absensi",
        storageKey: "absensi_user_gembong",
        branchStorageKey: "current_branch",
      });

      if (!res.success || !res.user) {
        alert(res.error || "Username atau Password salah! Pastikan huruf besar/kecil dan spasi sudah sesuai.");
        return;
      }

      const userData: KaryawanUser = {
        id: res.user.id || `emp_${res.user.username}`,
        nama: res.user.nama || res.user.username,
        username: res.user.username,
        cabang: res.user.cabang || "gembong",
        ...res.user
      };

      setUser(userData);
      setLoginData({ username: "", password: "" }); 
      await fetchAttendanceData(userData.id);
    } catch (err: unknown) {
      console.error("Login error", err);
      const errMsg = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat login.";
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutWithFirebaseAuth(["absensi_user_gembong"]);
    setUser(null);
    setAttendanceToday(null);
    setHistory([]);
    setLoginData({ username: "", password: "" }); 
  };

  const handleHomeExit = async () => {
    await handleLogout();
    router.push("/zona_gembong");
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const startCamera = async () => {
    if (!isWithinRadius) {
      alert("Anda berada di luar radius toko Gembong. Mendekat terlebih dahulu sebelum membuka kamera.");
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
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Gagal inisialisasi context kamera");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      setSelfiePreview(dataUrl);
      stopCamera();
    } catch (e) {
      console.error("Failed to capture selfie", e);
      alert("Gagal mengambil foto. Coba kembali.");
    } finally {
      setCapturing(false);
    }
  };

  const [checkingLocation, setCheckingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const validateLocation = useCallback(async (manual = false) => {
    if (!config) return;

    if (!navigator.geolocation) {
      setLocationError("Perangkat tidak mendukung GPS.");
      return;
    }

    setCheckingLocation(true);
    setLocationError(null);

    const targetLat = parseFloat(config.location?.lat || config.lat || "-7.5265");
    const targetLng = parseFloat(config.location?.lng || config.lng || "108.8763");
    const maxRadius = parseFloat(config.location?.radius || config.radius || "50");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, targetLat, targetLng);
        const roundedDist = Math.round(dist);
        setDistance(roundedDist);
        const within = roundedDist <= maxRadius;
        setIsWithinRadius(within);
        setCheckingLocation(false);
        if (manual) {
          alert(`Lokasi terdeteksi! Jarak Anda dari toko: ${roundedDist} meter (Batas: ${maxRadius} meter).`);
        }
      },
      (err) => {
        console.error("Geolocation error", err);
        setCheckingLocation(false);
        let msg = "Gagal mengambil lokasi.";
        if (err.code === 1) msg = "Izin GPS ditolak. Silakan izinkan akses lokasi di pengaturan browser.";
        else if (err.code === 2) msg = "Sinyal GPS lemah / lokasi tidak ditemukan.";
        else if (err.code === 3) msg = "Pencarian lokasi GPS timeout.";
        setLocationError(msg);
        if (manual) alert(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [config]);

  const handleAbsen = async (type: "masuk" | "pulang") => {
    if (!user) return;
    if (!isWithinRadius) {
      alert("Anda berada di luar radius toko Gembong. Silakan dekati lokasi outlet untuk melakukan absensi.");
      return;
    }

    if (!selfiePreview) {
      alert("Silakan ambil foto selfie terlebih dahulu sebagai bukti kehadiran.");
      return;
    }

    setLoading(true);
    try {
      let finalPhotoUrl = selfiePreview;
      if (selfiePreview.startsWith("data:image")) {
        const cloudName = config?.cloudinaryCloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dkm0s5s2b";
        const uploadPreset = config?.cloudinaryUploadPreset || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "zonawaktu_preset";
        const folder = config?.cloudinaryFolder || "absensi_gembong";
        try {
          const blob = await (await fetch(selfiePreview)).blob();
          const file = new File([blob], `selfie-gembong-${Date.now()}.jpg`, { type: "image/jpeg" });
          finalPhotoUrl = await uploadToCloudinary(file, { cloudinaryCloudName: cloudName, cloudinaryUploadPreset: uploadPreset, cloudinaryFolder: folder });
        } catch (uploadErr) {
          console.warn("Cloudinary upload failed, using local format", uploadErr);
        }
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('id-ID');

      if (type === "masuk") {
        const newLog = {
          karyawanId: user.id,
          nama: user.nama,
          tanggal: dateStr,
          jamMasuk: timeStr,
          jamPulang: "-",
          cabang: "gembong",
          selfieUrl: finalPhotoUrl,
          selfieMasukUrl: finalPhotoUrl,
          timestamp: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, "absensi_logs"), newLog);
        setAttendanceToday({ id: docRef.id, ...newLog });
        alert(`Absen MASUK berhasil dicatat pada pukul ${timeStr}!`);
      } else {
        if (!attendanceToday?.id) {
          alert("Data absen masuk tidak ditemukan untuk hari ini.");
          return;
        }
        const logRef = doc(db, "absensi_logs", attendanceToday.id);
        await updateDoc(logRef, {
          jamPulang: timeStr,
          selfiePulangUrl: finalPhotoUrl,
          updatedAt: serverTimestamp()
        });
        setAttendanceToday(prev => prev ? { ...prev, jamPulang: timeStr, selfiePulangUrl: finalPhotoUrl } : null);
        alert(`Absen PULANG berhasil dicatat pada pukul ${timeStr}!`);
      }

      setSelfiePreview(null);
      await fetchAttendanceData(user.id);
    } catch (e) {
      console.error("Attendance submission error", e);
      alert("Gagal menyimpan data absensi. Cek koneksi Anda.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && config) {
      const timer = setTimeout(() => validateLocation(false), 0);
      const interval = setInterval(() => validateLocation(false), 30000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [user, config, validateLocation]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#070d19] via-[#0f172a] to-[#1e1b4b] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#070d19] via-[#0f172a] to-[#1e1b4b] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "30px 30px" }}></div>
        
        <Card className="w-full max-w-md rounded-[3rem] p-12 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-700 relative z-10">
          <div className="text-center mb-10">
            <div className="h-20 w-20 rounded-[2rem] bg-indigo-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <User className="h-10 w-10 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Portal Absensi</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Cabang Gembong &bull; Coffee & Teh Bakar</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Username</Label>
              <Input 
                value={loginData.username}
                onChange={(e) => setLoginData({...loginData, username: e.target.value})}
                className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold"
                placeholder="Masukkan username..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="current-password"
              />
            </div>
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-16 rounded-[1.5rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-indigo-600/20"
            >
              {loading ? "Mengecek Akses..." : "Masuk Ke Portal Gembong"}
            </Button>
          </form>
          <div className="mt-10 text-center">
             <Link href="/zona_gembong" className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">Kembali Ke Beranda Cabang</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex flex-col items-center p-6 md:p-12 font-sans relative">
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center shadow-sm">
            <User className="h-7 w-7 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-xl font-black text-indigo-950 uppercase italic leading-none">{user.nama}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              Cabang Gembong &bull; Status: {user.status || 'Aktif'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleHomeExit} variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm hover:bg-slate-50 border border-slate-100" title="Keluar ke Beranda Cabang">
            <Home className="h-5 w-5 text-slate-400" />
          </Button>
          <Button onClick={handleLogout} variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white shadow-sm hover:bg-slate-50 border border-slate-100" title="Keluar / Logout">
            <LogOut className="h-5 w-5 text-slate-400" />
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-2xl bg-gradient-to-br from-[#070d19] via-[#0f172a] to-[#1e1b4b] rounded-[3rem] p-10 md:p-16 text-white shadow-2xl shadow-indigo-950/25 border border-indigo-500/20 relative overflow-hidden mb-8">
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

          <div className="flex flex-wrap items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border",
              isWithinRadius ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100" : "bg-rose-500/20 border-rose-500/40 text-rose-100"
            )}>
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                {isWithinRadius ? `Dalam Area Gembong (${distance ?? 0}m)` : distance !== null ? `Luar Radius (${distance}m)` : (locationError || 'Mencari GPS...')}
              </span>
              <button 
                type="button"
                onClick={() => validateLocation(true)}
                title="Cek Ulang GPS"
                className="ml-1 p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <RefreshCw className={cn("h-3 w-3", checkingLocation && "animate-spin")} />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
              <Clock className="h-3 w-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                ZONA GEMBONG AKTIF
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selfie Absensi Gembong</p>
            <p className="text-sm font-black text-slate-800">Foto wajib diambil langsung dari kamera</p>
          </div>
          <Button onClick={startCamera} disabled={!isWithinRadius} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-4 text-[9px] font-black uppercase disabled:opacity-50 disabled:cursor-not-allowed">Buka Kamera</Button>
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
          <p className="text-2xl font-black text-indigo-950 tabular-nums">{attendanceToday?.jamMasuk || "--:--:--"}</p>
          {attendanceToday?.jamMasuk && attendanceToday.jamMasuk !== "-" && (
            <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase">Hadir</div>
          )}
          {!attendanceToday?.jamMasuk && (
             <Button 
               disabled={!isWithinRadius}
               onClick={() => handleAbsen('masuk')} 
               className="mt-2 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[9px] h-10 disabled:opacity-50"
             >
               Absen Masuk
             </Button>
          )}
        </Card>
        <Card className="rounded-[2.5rem] bg-white p-8 border-none shadow-sm flex flex-col items-start gap-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pulang</p>
          <p className="text-2xl font-black text-indigo-950 tabular-nums">{attendanceToday?.jamPulang || "--:--:--"}</p>
          {attendanceToday?.jamPulang && attendanceToday.jamPulang !== "-" && (
            <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase">Selesai</div>
          )}
          {attendanceToday?.jamMasuk && (!attendanceToday?.jamPulang || attendanceToday.jamPulang === "-") && (
             <Button 
               disabled={!isWithinRadius}
               onClick={() => handleAbsen('pulang')} 
               className="mt-2 w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[9px] h-10 disabled:opacity-50"
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
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">SESI ABSEN GEMBONG TERVERIFIKASI</p>
        </Card>
      )}

      {!isWithinRadius && (
        <Card className="w-full max-w-2xl rounded-[1.5rem] bg-rose-50 p-6 border border-rose-100 flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">LUAR RADIUS TOKO GEMBONG</p>
              <p className="text-[8px] font-bold text-rose-400 uppercase">
                Jarak Anda: {distance !== null ? `${distance} meter` : "Mengecek..."}
              </p>
            </div>
          </div>
          <Button 
            onClick={() => validateLocation(true)}
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
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-black uppercase tracking-widest text-indigo-950">Riwayat Kehadiran Gembong</h3>
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
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase text-slate-400">Foto Masuk ({log.jamMasuk || "-"})</span>
                  {log.selfieMasukUrl || log.selfieUrl ? (
                    <Image src={(log.selfieMasukUrl || log.selfieUrl) as string} alt="Foto Masuk" width={300} height={120} className="w-full h-28 object-cover rounded-xl border border-slate-200" unoptimized />
                  ) : (
                    <div className="w-full h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[8px] font-black uppercase text-slate-400">Tidak Ada Foto</div>
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase text-slate-400">Foto Pulang ({log.jamPulang || "-"})</span>
                  {log.selfiePulangUrl ? (
                    <Image src={log.selfiePulangUrl as string} alt="Foto Pulang" width={300} height={120} className="w-full h-28 object-cover rounded-xl border border-slate-200" unoptimized />
                  ) : (
                    <div className="w-full h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[8px] font-black uppercase text-slate-400">Belum Pulang</div>
                  )}
                </div>
              </div>
            </Card>
          )) : (
            <p className="text-center py-10 text-[10px] font-black text-slate-300 uppercase tracking-widest">Belum ada riwayat</p>
          )}
        </div>
      </div>
    </div>
  );
}
