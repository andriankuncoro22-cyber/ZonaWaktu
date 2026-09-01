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
import { useFirestore, collection, doc } from "@/firebase";
import { addDoc, query, where, getDocs, serverTimestamp, orderBy, limit, getDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";

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

export default function KedungrejaAbsensiPage() {
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
      // Check Kedungreja specific location first, then fallback
      const kedungrejaDocRef = doc(db, "settings", "absensi_config_kedungreja");
      const kedungrejaSnap = await getDoc(kedungrejaDocRef);
      if (kedungrejaSnap.exists()) {
        setConfig(kedungrejaSnap.data() as AbsensiConfig);
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
      const saved = localStorage.getItem("absensi_user_kedungreja") || localStorage.getItem("absensi_user");
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
      let userData: KaryawanUser | null = null;

      // 1. Cek langsung ke koleksi karyawan dengan exact match
      const q = query(
        collection(db, "karyawan"), 
        where("username", "==", inputUsername), 
        where("password", "==", inputPassword)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        userData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as KaryawanUser;
      } else {
        // 2. Fallback: Case-insensitive username match di koleksi karyawan
        const allKaryawanSnap = await getDocs(collection(db, "karyawan"));
        const foundDoc = allKaryawanSnap.docs.find(d => {
          const dData = d.data();
          return (
            String(dData.username || "").trim().toLowerCase() === inputUsername.toLowerCase() &&
            String(dData.password || "").trim() === inputPassword
          );
        });

        if (foundDoc) {
          userData = { id: foundDoc.id, ...foundDoc.data() } as KaryawanUser;
        } else {
          // 3. Fallback: Cek di dokumen employee_credentials (absensi_logins_kedungreja & logins_kedungreja)
          const docNames = ["absensi_logins_kedungreja", "logins_kedungreja"];
          for (const docName of docNames) {
            if (userData) break;
            const credSnap = await getDoc(doc(db, "employee_credentials", docName));
            if (credSnap.exists()) {
              const users = credSnap.data().users || [];
              const credUser = users.find((u: any) => 
                String(u.username || "").trim().toLowerCase() === inputUsername.toLowerCase() && 
                String(u.password || "").trim() === inputPassword
              );
              if (credUser) {
                userData = {
                  id: credUser.id || `emp_${credUser.username}`,
                  nama: credUser.nama || credUser.username,
                  username: credUser.username,
                  cabang: credUser.cabang || "kedungreja",
                  ...credUser
                } as KaryawanUser;
              }
            }
          }
        }
      }

      if (userData) {
        const userCabang = (userData.cabang || "gdm").toLowerCase();
        if (userCabang !== "kedungreja") {
          alert(`Akses Ditolak: Akun Anda terdaftar di Cabang ${userCabang === 'tehwarga' ? 'Teh Warga' : 'Zona Waktu Gandrungmangu'}. Akun tidak dapat digunakan di Portal Absensi Kedungreja.`);
          return;
        }

        setUser(userData);
        try {
          localStorage.setItem("absensi_user_kedungreja", JSON.stringify(userData));
          localStorage.setItem("current_branch", "kedungreja");
        } catch (storageErr) {
          console.warn("Storage error on mobile webview:", storageErr);
        }
        setLoginData({ username: "", password: "" }); 
        await fetchAttendanceData(userData.id);
      } else {
        alert("Username atau Password salah! Pastikan huruf besar/kecil dan spasi sudah sesuai.");
      }
    } catch (err) {
      console.error("Login error", err);
      alert("Terjadi kesalahan sistem saat login. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("absensi_user_kedungreja");
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
      alert("Anda berada di luar radius toko Kedungreja. Mendekat terlebih dahulu sebelum membuka kamera.");
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
      const file = new File([blob], `selfie-kedungreja-${Date.now()}.jpg`, { type: "image/jpeg" });
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
      alert("Anda berada di luar jangkauan lokasi outlet Kedungreja. Silakan mendekat ke area toko.");
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
          karyawanId: user?.id,
          nama: user?.nama,
          shift: user?.shift || 'default',
          cabang: "kedungreja",
          cabangName: "Cabang Kedungreja",
          tanggal: today,
          jamMasuk: time,
          jamPulang: "-",
          selfieUrl: selfiePreview,
          timestamp: serverTimestamp()
        });
        setAttendanceToday({ 
          id: "", 
          karyawanId: user?.id || "", 
          nama: user?.nama || "", 
          tanggal: today, 
          jamMasuk: time, 
          jamPulang: "-", 
          selfieUrl: selfiePreview ?? undefined,
          cabang: "kedungreja"
        });
      } else {
        alert("Sesi Absen Pulang Tercatat.");
      }
      if (user?.id) {
        await fetchAttendanceData(user.id);
      }
      stopCamera();
    } catch (e) {
      console.error("Absen failed", e);
    }
  };

  const [checkingLocation, setCheckingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const validateLocation = useCallback((showUserAlert = false) => {
    const locationConfig = config?.location || config;
    if (!locationConfig || !locationConfig.lat || !locationConfig.lng) return;

    if (!navigator.geolocation) {
      setLocationError("Browser ini tidak mendukung deteksi lokasi (GPS).");
      setIsWithinRadius(false);
      if (showUserAlert) alert("Browser ini tidak mendukung deteksi GPS.");
      return;
    }

    setCheckingLocation(true);
    setLocationError(null);

    const onPosSuccess = (position: GeolocationPosition) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      
      const dist = getDistance(
        userLat, 
        userLng, 
        parseFloat(locationConfig.lat), 
        parseFloat(locationConfig.lng)
      );
      
      const roundedDist = Math.round(dist);
      const maxRadius = parseFloat(locationConfig.radius || "50");
      setDistance(roundedDist);
      setIsWithinRadius(roundedDist <= maxRadius);
      setCheckingLocation(false);
      setLocationError(null);
      if (showUserAlert) {
        if (roundedDist <= maxRadius) {
          alert(`Lokasi Terverifikasi! Anda berada ${roundedDist}m dari cabang Kedungreja (dalam radius ${maxRadius}m).`);
        } else {
          alert(`Anda berada ${roundedDist}m dari cabang Kedungreja (di luar batas radius ${maxRadius}m).`);
        }
      }
    };

    const onPosError = (error: GeolocationPositionError) => {
      console.warn("Geolocation warning:", error.message || error);
      
      if (error.code === error.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          onPosSuccess,
          (fallbackErr) => {
            console.warn("Fallback geolocation failed:", fallbackErr.message);
            setIsWithinRadius(false);
            setCheckingLocation(false);
            setLocationError("Waktu permintaan GPS habis. Pastikan GPS aktif.");
            if (showUserAlert) alert("Waktu permintaan GPS habis. Pastikan izin lokasi aktif.");
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
        );
        return;
      }

      let errorMsg = "Gagal membaca koordinat GPS.";
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = "Izin akses lokasi (GPS) ditolak. Aktifkan izin lokasi browser/HP.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = "Informasi GPS tidak tersedia pada perangkat ini.";
      }

      setLocationError(errorMsg);
      setIsWithinRadius(false);
      setCheckingLocation(false);
      if (showUserAlert) {
        alert(errorMsg);
      }
    };

    navigator.geolocation.getCurrentPosition(onPosSuccess, onPosError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    });
  }, [config]);

  useEffect(() => {
    if (user && config) {
      validateLocation(false);
      const interval = setInterval(() => validateLocation(false), 15000);
      return () => clearInterval(interval);
    }
  }, [user, config, validateLocation]);

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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Cabang Kedungreja &bull; Coffee & Teh Bakar</p>
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
              className="w-full h-16 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20"
            >
              {loading ? "Mengecek Akses..." : "Masuk Ke Portal Kedungreja"}
            </Button>
          </form>
          <div className="mt-10 text-center">
             <Link href="/zona_kedungreja" className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">Kembali Ke Beranda Cabang</Link>
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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              Cabang Kedungreja &bull; Status: {user.status || 'Aktif'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/zona_kedungreja">
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

          <div className="flex flex-wrap items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border",
              isWithinRadius ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100" : "bg-rose-500/20 border-rose-500/40 text-rose-100"
            )}>
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                {isWithinRadius ? `Dalam Area Kedungreja (${distance ?? 0}m)` : distance !== null ? `Luar Radius (${distance}m)` : (locationError || 'Mencari GPS...')}
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
                ZONA KEDUNGREJA AKTIF
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selfie Absensi Kedungreja</p>
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
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">SESI ABSEN KEDUNGREJA TERVERIFIKASI</p>
        </Card>
      )}

      {!isWithinRadius && (
        <Card className="w-full max-w-2xl rounded-[1.5rem] bg-rose-50 p-6 border border-rose-100 flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">LUAR RADIUS TOKO KEDUNGREJA</p>
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
          <CalendarDays className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-primary">Riwayat Kehadiran Kedungreja</h3>
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
