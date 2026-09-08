"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CupSoda, Loader2, ArrowLeft, Eye, EyeOff, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loginWithFirebaseAuth } from "@/lib/auth-service";

export default function TehWargaEmployeeLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async () => {
    const inputUsername = username.trim();
    const inputPassword = password.trim();

    if (!inputUsername || !inputPassword) {
      setError("Silakan masukkan Username dan Password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await loginWithFirebaseAuth({
        username: inputUsername,
        password: inputPassword,
        expectedRole: "employee",
        expectedBranch: "tehwarga"
      });

      if (result.success && result.profile) {
        try {
          localStorage.setItem("user_role", result.profile.role || "employee");
          localStorage.setItem("employee_name", result.profile.nama || inputUsername);
          localStorage.setItem("current_branch", "tehwarga");
          document.documentElement.setAttribute("data-branch", "tehwarga");
          window.dispatchEvent(new Event("branch_changed"));
        } catch (storageErr) {
          console.warn("Storage error on mobile webview:", storageErr);
        }

        toast({
          title: "Login Berhasil",
          description: `Selamat datang, ${result.profile.nama || inputUsername}! (Teh Warga GDM)`,
        });

        router.push("/employee/dashboard");
      } else {
        setError(result.error || "Username atau password salah. Pastikan huruf besar/kecil dan spasi sudah sesuai.");
      }
    } catch (err: unknown) {
      console.error(err);
      setError("Terjadi kesalahan saat memproses login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen text-white overflow-hidden relative font-sans flex flex-col justify-center items-center"
      style={{
        backgroundColor: "#064e3b",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, #047857 0%, #064e3b 50%, #022c22 100%)"
      }}
    >
      <div className="absolute top-6 left-6 z-20">
        <Button onClick={() => router.push('/teh_warga_gdm')} variant="ghost" size="icon" className="bg-white/10 text-white hover:bg-white/20 rounded-full">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" 
           style={{ backgroundImage: "radial-gradient(circle, #a7f3d0 1px, transparent 1px)", backgroundSize: "36px 36px" }}>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-400/30 backdrop-blur-md shadow-inner">
            <CupSoda className="h-6 w-6 text-teal-300" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-[0.25em] uppercase">TEH WARGA</span>
            <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">Gandrungmangu • TW-01</span>
          </div>
        </div>

        <div className="w-full p-8 bg-black/30 border border-emerald-400/30 backdrop-blur-xl rounded-3xl shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Users className="h-5 w-5 text-teal-300" />
            <h2 className="text-xl font-black uppercase tracking-widest text-center">Login Karyawan</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-black/30 border-emerald-500/40 text-white placeholder:text-white/30 rounded-xl h-11"
                placeholder="Masukkan username karyawan"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-black/30 border-emerald-500/40 text-white pr-10 rounded-xl h-11"
                  placeholder="••••••••"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <div className="absolute inset-y-0 right-2 flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-white/70 bg-transparent hover:bg-white/10"
                    type="button"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            {error && <p className="text-red-300 text-xs font-semibold">{error}</p>}
            <Button 
              disabled={loading}
              onClick={handleLogin} 
              className="w-full bg-gradient-to-r from-emerald-400 to-lime-300 text-[#022c22] hover:from-emerald-300 hover:to-lime-200 font-black uppercase tracking-widest rounded-xl h-11 shadow-lg shadow-emerald-950/40 border-none mt-2"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memproses...</span>
                </div>
              ) : "Masuk Area Kerja"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
