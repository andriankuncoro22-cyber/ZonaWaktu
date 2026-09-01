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
  User,
  CupSoda,
  Camera,
  Loader2
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

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function TehWargaAbsensiPage() {
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
      const tehwargaDocRef = doc(db, "settings", "absensi_config_tehwarga");
      const tehwargaSnap = await getDoc(tehwargaDocRef);
      if (tehwargaSnap.exists()) {
        setConfig(tehwargaSnap.data() as AbsensiConfig);
        return;
      }

      const docRef = doc(db, "settings", "absensi_config");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AbsensiConfig);
      }
    } catch (e) {
      console.error("Failed to load config", e);
    }
  }, [db]);

  const fetchAttendanceData = useCallback(async (karyawanId: string) => {
    const today = new Date().toLocaleDateString('id-ID');
    try {
      const q = query(
        collection(db, "absensi_logs"), 
        where("karyawanId", "==", karyawanId),
        where("tanggal", "==", today)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setAttendanceToday({ id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as AttendanceLog);
      } else {
        setAttendanceToday(null);
      }

      const historyQ = query(
        collection(db, "absensi_logs"),
        where("karyawanId", "==", karyawanId),
        orderBy("timestamp", "desc"),
        limit(5)
      );
      const historySnapshot = await getDocs(historyQ);
      const historyList: AttendanceLog[] = [];
      historySnapshot.forEach((doc) => {
        historyList.push({ id: doc.id, ...doc.data() } as AttendanceLog);
      });
      setHistory(historyList);
    } catch (e) {
      console.error("Error fetching logs", e);
    }
  }, [db]);

  useEffect(() => {
    localStorage.setItem("current_branch", "tehwarga");
    document.documentElement.setAttribute("data-branch", "tehwarga");
    window.dispatchEvent(new Event("branch_changed"));

    fetchConfig();
    const savedUser = localStorage.getItem("karyawan_user_tehwarga") || localStorage.getItem("karyawan_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        fetchAttendanceData(parsed.id);
      } catch (e) {
        console.error(e);
      }
    }
    setCheckingAuth(false);
  }, [fetchAttendanceData, fetchConfig]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        userData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as KaryawanUser;
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
          // 3. Fallback: Cek di dokumen employee_credentials (absensi_logins_tehwarga & logins_tehwarga)
          const docNames = ["absensi_logins_tehwarga", "logins_tehwarga"];
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
                  cabang: credUser.cabang || "tehwarga",
                  ...credUser
                } as KaryawanUser;
              }
            }
          }
        }
      }

      if (userData) {
        const userCabang = (userData.cabang || "gdm").toLowerCase();
        if (userCabang !== "tehwarga") {
          alert(`Akses Ditolak: Akun Anda terdaftar di Cabang ${userCabang === 'kedungreja' ? 'Kedungreja' : 'Zona Waktu Gandrungmangu'}. Akun tidak dapat digunakan di Portal Absensi Teh Warga.`);
          return;
        }

        setUser(userData);
        try {
          localStorage.setItem("karyawan_user_tehwarga", JSON.stringify(userData));
          localStorage.setItem("current_branch", "tehwarga");
        } catch (storageErr) {
          console.warn("Storage error on mobile webview:", storageErr);
        }
        setLoginData({ username: "", password: "" });
        fetchAttendanceData(userData.id);
      } else {
        alert("Username atau password salah! Pastikan huruf besar/kecil dan spasi sudah sesuai.");
      }
    } catch (e) {
      console.error("Login failed", e);
      alert("Terjadi kesalahan saat login. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("karyawan_user_tehwarga");
    setUser(null);
    setAttendanceToday(null);
    setHistory([]);
    stopCamera();
  };

  const startCamera = async () => {
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraReady(true);
      }
    } catch (e) {
      console.error("Camera access denied", e);
      alert("Gagal mengakses kamera. Mohon izinkan akses kamera pada browser Anda.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const captureSelfie = async () => {
    if (!videoRef.current) return null;
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
      const file = new File([blob], `selfie-tehwarga-${Date.now()}.jpg`, { type: "image/jpeg" });
      const uploadedUrl = await uploadToCloudinary(file, config || undefined);
      setSelfiePreview(uploadedUrl);
      return uploadedUrl;
    } catch (e) {
      console.error("Error capturing photo", e);
      alert("Gagal mengambil foto.");
      return null;
    } finally {
      setCapturing(false);
    }
  };

  const handleAbsen = async (type: 'masuk' | 'pulang') => {
    if (!isWithinRadius) {
      alert("Anda berada di luar jangkauan lokasi outlet Teh Warga Gandrungmangu. Silakan mendekat ke area toko.");
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
          cabang: "tehwarga",
          cabangName: "Teh Warga Gandrungmangu",
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
          cabang: "tehwarga"
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
      }, (err) => {
        console.error("Geo error", err);
        setIsWithinRadius(false);
      }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    }
  }, [config]);

  useEffect(() => {
    if (user && config) {
      validateLocation();
      const interval = setInterval(validateLocation, 10000);
      return () => clearInterval(interval);
    }
  }, [user, config, validateLocation]);

  if (checkingAuth) return null;

  return (
    <div 
      className="min-h-screen text-slate-100 flex flex-col font-sans"
      style={{
        backgroundColor: "#064e3b",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, #047857 0%, #064e3b 50%, #022c22 100%)"
      }}
    >
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10 backdrop-blur-md bg-black/20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-400/30">
            <CupSoda className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest uppercase">TEH WARGA</h1>
            <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">Absensi Gandrungmangu &bull; TW-01</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/teh_warga_gdm">
            <Button variant="ghost" size="sm" className="text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-full">
              <Home className="h-4 w-4 mr-1.5" /> Portal
            </Button>
          </Link>
          {user && (
            <Button onClick={handleLogout} variant="ghost" size="sm" className="text-xs text-red-300 hover:bg-red-500/20 rounded-full">
              <LogOut className="h-4 w-4 mr-1.5" /> Keluar
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {!user ? (
          /* Login Form */
          <Card className="p-6 sm:p-8 bg-black/30 border-emerald-500/30 backdrop-blur-xl rounded-3xl text-white shadow-2xl">
            <div className="text-center mb-6">
              <div className="h-16 w-16 bg-emerald-500/20 text-emerald-300 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-emerald-400/30 shadow-inner">
                <User className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-wider">Login Absensi Karyawan</h2>
              <p className="text-xs text-emerald-200/80 mt-1">Outlet Teh Warga Gandrungmangu</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Username</Label>
                <Input 
                  type="text"
                  placeholder="Masukkan username"
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  className="bg-black/40 border-emerald-500/40 text-white rounded-xl h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Password</Label>
                <Input 
                  type="password"
                  placeholder="Masukkan password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="bg-black/40 border-emerald-500/40 text-white rounded-xl h-11"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-400 to-lime-300 text-[#022c22] hover:from-emerald-300 hover:to-lime-200 font-black uppercase tracking-widest rounded-xl h-11 border-none shadow-lg shadow-emerald-950/50 mt-2"
              >
                {loading ? "Memverifikasi..." : "Masuk Absensi"}
              </Button>
            </form>
          </Card>
        ) : (
          /* Attendance Dashboard */
          <div className="space-y-5">
            {/* Live Clock & Profile */}
            <Card className="p-6 bg-black/30 border-emerald-500/30 backdrop-blur-xl rounded-3xl text-white text-center shadow-xl">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">
                PRESENSI OUTLET TEH WARGA
              </span>
              <h2 className="text-3xl sm:text-4xl font-black italic tracking-tight mt-1 mb-1 text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-green-300 to-lime-200">
                {currentTime.toLocaleTimeString('id-ID')}
              </h2>
              <p className="text-xs text-emerald-200/80 font-medium">
                {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
                <div className="text-left">
                  <p className="font-black text-sm uppercase">{user.nama}</p>
                  <p className="text-[10px] text-emerald-300/80">Karyawan Outlet Gandrungmangu</p>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold uppercase text-[9px] border border-emerald-400/30">
                    Shift: {user.shift || "Pagi/Sore"}
                  </span>
                </div>
              </div>
            </Card>

            {/* GPS Radius Check */}
            <Card className="p-4 bg-black/20 border-white/10 backdrop-blur-md rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center border",
                  isWithinRadius ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300" : "bg-red-500/20 border-red-400/40 text-red-300"
                )}>
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">{isWithinRadius ? "Dalam Radius Outlet" : "Di Luar Radius Outlet"}</p>
                  <p className="text-[10px] text-white/60">
                    {distance !== null ? `Jarak: ~${distance} meter dari toko` : "Mengecek titik GPS..."}
                  </p>
                </div>
              </div>
              <Button onClick={validateLocation} variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/10 text-white/70">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </Card>

            {/* Camera & Selfie Capture */}
            <Card className="p-5 bg-black/30 border-emerald-500/30 backdrop-blur-xl rounded-3xl text-center">
              <h3 className="text-xs font-black uppercase tracking-wider mb-3 text-emerald-200">Verifikasi Wajah (Selfie)</h3>
              
              <div className="relative w-full aspect-square max-w-[260px] mx-auto rounded-2xl overflow-hidden bg-black/50 border border-white/15 flex items-center justify-center mb-3">
                {selfiePreview ? (
                  <Image src={selfiePreview} alt="Selfie preview" fill className="object-cover" />
                ) : (
                  <video ref={videoRef} playsInline autoPlay muted className={cn("w-full h-full object-cover", !cameraReady && "hidden")} />
                )}
                {!cameraReady && !selfiePreview && (
                  <div className="flex flex-col items-center gap-2 p-4 text-white/50">
                    <Camera className="h-8 w-8" />
                    <span className="text-[10px] uppercase font-bold">Kamera Belum Aktif</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                {!cameraReady && !selfiePreview && (
                  <Button onClick={startCamera} size="sm" className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 rounded-full text-xs font-bold">
                    <Camera className="h-3.5 w-3.5 mr-1.5" /> Buka Kamera
                  </Button>
                )}
                {cameraReady && !selfiePreview && (
                  <Button onClick={captureSelfie} disabled={capturing} size="sm" className="bg-emerald-400 hover:bg-emerald-300 text-[#022c22] rounded-full text-xs font-black">
                    {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />} Ambil Foto
                  </Button>
                )}
                {selfiePreview && (
                  <Button onClick={() => { setSelfiePreview(null); startCamera(); }} size="sm" variant="ghost" className="text-white/80 hover:bg-white/10 rounded-full text-xs font-bold">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Foto Ulang
                  </Button>
                )}
              </div>
            </Card>

            {/* Attendance Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={() => handleAbsen('masuk')}
                disabled={!isWithinRadius || !!attendanceToday?.jamMasuk && attendanceToday.jamMasuk !== "-"}
                className="h-14 bg-gradient-to-r from-emerald-400 to-lime-300 text-[#022c22] hover:from-emerald-300 hover:to-lime-200 rounded-2xl font-black uppercase tracking-wider text-xs border-none shadow-lg shadow-emerald-950/50"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {attendanceToday?.jamMasuk ? `Masuk: ${attendanceToday.jamMasuk}` : "Absen Masuk"}
              </Button>
              <Button 
                onClick={() => handleAbsen('pulang')}
                disabled={!isWithinRadius || !attendanceToday}
                variant="outline"
                className="h-14 border-white/20 text-white hover:bg-white/10 rounded-2xl font-black uppercase tracking-wider text-xs"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                {attendanceToday?.jamPulang && attendanceToday.jamPulang !== "-" ? `Pulang: ${attendanceToday.jamPulang}` : "Absen Pulang"}
              </Button>
            </div>

            {/* Recent History */}
            {history.length > 0 && (
              <Card className="p-4 bg-black/20 border-white/10 rounded-2xl text-xs">
                <div className="flex items-center gap-2 mb-3 text-emerald-300 font-bold uppercase text-[10px]">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>Histori Absensi Terakhir</span>
                </div>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-none">
                      <span className="text-white/80">{h.tanggal}</span>
                      <span className="font-mono text-emerald-300 font-bold">Masuk: {h.jamMasuk}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
