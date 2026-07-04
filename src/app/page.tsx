"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";

export default function LandingPage() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  return (
    <div
      className="min-h-screen overflow-hidden relative font-sans flex flex-col"
      style={{ backgroundColor: "var(--theme-primary)", color: "var(--theme-primary-foreground)" }}
    >
      {/* Background Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
           style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "40px 40px" }}>
      </div>

      {/* Navigation - Minimalist */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-md">
            <Coffee className="h-4 w-4 md:h-5 md:w-5 text-white" />
          </div>
          <span className="text-[10px] md:text-sm font-black tracking-[0.3em] uppercase">{settings?.name || "ZONA WAKTU"}</span>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 flex flex-col items-center justify-center text-center flex-1 py-10 md:py-4">
        <div className="animate-in fade-in zoom-in-95 duration-1000 w-full flex flex-col items-center">
          
          {/* Logo Section */}
          <div className="relative w-full max-w-[90%] md:max-w-6xl flex justify-center mb-6">
            {settings?.logoLanding ? (
              <div className="relative w-full aspect-[5/1]">
                <Image 
                  src={settings.logoLanding} 
                  alt={settings.name || "Zona Waktu"} 
                  fill 
                  className="object-contain"
                  priority
                />
              </div>
            ) : (
              <div className="text-center group py-6 md:py-10">
                <h1 className="text-5xl md:text-[120px] font-black leading-none tracking-tighter text-white uppercase italic">
                  {settings?.name || "ZONA WAKTU"}
                </h1>
                <div className="h-1 md:h-2 w-full bg-white mt-1"></div>
                <p className="text-sm md:text-3xl font-black tracking-[0.1em] text-white uppercase mt-4 italic">
                  {settings?.tagline || "COFFEE DAN TEH BAKAR"}
                </p>
              </div>
            )}
          </div>
          
          {/* Description Text */}
          <p className="text-white/90 max-w-2xl text-sm md:text-lg leading-relaxed font-bold px-4 mb-8 md:mb-12 tracking-tight">
            Nikmati keunikan rasa kopi dan teh bakar autentik. Pengalaman rasa yang tak terlupakan dalam setiap tegukan di Zona Waktu.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 w-full max-w-2xl px-4 md:px-0">
            <Link href="/owner-login" className="w-full sm:w-1/2">
              <Button className="w-full bg-white text-[#8b1a1a] hover:bg-slate-100 rounded-full h-14 md:h-20 px-8 text-sm md:text-xl font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 border-none">
                Login Owner
              </Button>
            </Link>
            <Link href="/employee-login" className="w-full sm:w-1/2">
              <Button className="w-full bg-white text-[#8b1a1a] hover:bg-slate-100 rounded-full h-14 md:h-20 px-8 text-sm md:text-xl font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 border-none">
                Sistem Karyawan
              </Button>
            </Link>
            <Link href="/absensi" className="w-full sm:w-1/2">
              <Button className="w-full bg-transparent border-2 border-white text-white hover:bg-white/10 rounded-full h-14 md:h-20 px-8 text-sm md:text-xl font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95">
                Absensi Karyawan
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <div className="relative z-20 px-6 py-6 md:py-8 max-w-7xl mx-auto w-full opacity-40 text-center mt-auto">
        <p className="text-[8px] md:text-[10px] font-bold text-white uppercase tracking-[0.6em] md:tracking-[0.8em]">
          # Z O N A W A K T U &nbsp; # C O F F E E T E A H O U S E
        </p>
      </div>
    </div>
  );
}
