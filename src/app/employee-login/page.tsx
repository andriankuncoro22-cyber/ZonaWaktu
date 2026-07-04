"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const db = useFirestore();
  const { toast } = useToast();

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const credentialsRef = doc(db, "employee_credentials", "logins");
      const docSnap = await getDoc(credentialsRef);

      if (docSnap.exists()) {
        const credentials = docSnap.data().users || [];
        const user = credentials.find(
          (u: any) => u.username === username && u.password === password
        );

        if (user) {
          toast({ title: "Login Berhasil", description: `Selamat datang, ${username}!` });
          setUsername("");
          setPassword("");
          router.push("/employee/dashboard");
        } else {
          setError("Username atau password salah.");
        }
      } else {
        setError("Sistem otentikasi belum dikonfigurasi.");
      }
    } catch (err) {
      setError("Gagal terhubung ke server. Coba lagi nanti.");
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#8b1a1a] text-white overflow-hidden relative font-sans flex flex-col justify-center items-center">
      <div className="absolute top-6 left-6 z-20">
        <Button onClick={() => router.push('/')} variant="ghost" size="icon" className="bg-white/10 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "40px 40px" }}>
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-md">
            <Coffee className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-black tracking-[0.3em] uppercase">ZONA WAKTU</span>
        </div>
        <div className="w-full max-w-sm p-8 bg-white/10 border border-white/20 backdrop-blur-md rounded-lg">
          <h2 className="text-2xl font-black text-center mb-6 uppercase tracking-widest">Sistem Karyawan</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-white/80">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-black/20 border-white/30 text-white"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-black/20 border-white/30 text-white pr-10"
                  disabled={loading}
                />
                <div className="absolute inset-y-0 right-2 flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-white/80 bg-transparent hover:bg-white/10"
                    type="button"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm font-bold text-center py-2">{error}</p>}
            <Button onClick={handleLogin} disabled={loading} className="w-full bg-white text-[#8b1a1a] hover:bg-slate-100 font-bold uppercase tracking-widest">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
