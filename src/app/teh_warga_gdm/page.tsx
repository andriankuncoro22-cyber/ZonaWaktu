"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { CupSoda, Menu, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFirestore, useDoc, useMemoFirebase, doc } from "@/firebase";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function TehWargaLandingPage() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config_tehwarga"), [db]);
  const { data: settings } = useDoc(settingsRef);

  useEffect(() => {
    localStorage.removeItem("user_role");
    localStorage.setItem("current_branch", "tehwarga");
    document.documentElement.setAttribute("data-branch", "tehwarga");
    window.dispatchEvent(new Event("branch_changed"));
  }, []);

  return (
    <div
      className="min-h-screen overflow-hidden relative font-sans flex flex-col"
      style={{
        backgroundColor: "#064e3b",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, #047857 0%, #064e3b 50%, #022c22 100%)",
        color: "#ffffff"
      }}
    >
      {/* Background Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none" 
        style={{ backgroundImage: "radial-gradient(circle, #a7f3d0 1.5px, transparent 1.5px)", backgroundSize: "36px 36px" }}
      />

      {/* Navigation - Minimalist */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-md group-hover:bg-white/20 transition-all">
              <CupSoda className="h-4 w-4 md:h-5 md:w-5 text-emerald-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] md:text-sm font-black tracking-[0.3em] uppercase">
                {settings?.name || "TEH WARGA"}
              </span>
              <span className="text-[8px] font-bold text-emerald-300 tracking-widest uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-400 inline-block animate-pulse"></span>
                Gandrungmangu • TW-01
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Login Buttons & Store Switcher */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded-full px-4 h-10 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Pilih Cabang
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-white/20 mx-1"></div>
          <Link href="/teh_warga_gdm/owner-login">
            <Button variant="ghost" className="text-white hover:bg-white/10 border border-white/20 rounded-full px-5 h-10 text-xs font-black uppercase tracking-widest">
              Login Owner
            </Button>
          </Link>
          <Link href="/teh_warga_gdm/admin-login">
            <Button variant="ghost" className="text-white hover:bg-white/10 border border-white/20 rounded-full px-5 h-10 text-xs font-black uppercase tracking-widest">
              Login Admin
            </Button>
          </Link>
        </div>

        {/* Mobile Hamburger Dropdown */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-10 w-10 rounded-xl">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#064e3b] border-none text-white p-8 flex flex-col justify-start gap-4 w-72">
              <div className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 text-emerald-200/60">Menu Akses Teh Warga GDM</div>
              <Link href="/teh_warga_gdm/owner-login" className="w-full">
                <Button className="w-full bg-white text-[#064e3b] hover:bg-slate-100 rounded-full h-12 font-black uppercase tracking-widest text-xs border-none">
                  Login Owner
                </Button>
              </Link>
              <Link href="/teh_warga_gdm/admin-login" className="w-full">
                <Button className="w-full bg-white text-[#064e3b] hover:bg-slate-100 rounded-full h-12 font-black uppercase tracking-widest text-xs border-none">
                  Login Admin
                </Button>
              </Link>
              <div className="border-t border-white/10 pt-4 mt-2">
                <Link href="/" className="w-full">
                  <Button variant="ghost" className="w-full text-white hover:bg-white/10 rounded-full h-11 font-bold uppercase tracking-wider text-xs border border-white/20 flex items-center justify-center gap-2">
                    <Store className="h-4 w-4" />
                    Pilih Cabang Lain
                  </Button>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 flex flex-col items-center justify-center text-center flex-1 py-10 md:py-4">
        <div className="animate-in fade-in zoom-in-95 duration-1000 w-full flex flex-col items-center">
          
          {/* Branch Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md mb-6 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-lime-400 animate-pulse"></span>
            <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-white">
              OUTLET TEH WARGA GANDRUNGMANGU &bull; ACTIVE
            </span>
          </div>

          {/* Logo Section */}
          <div className="relative w-full max-w-[90%] md:max-w-6xl flex justify-center mb-6">
            {settings?.logoLanding ? (
              <div className="relative w-full aspect-[5/1]">
                <Image 
                  src={settings.logoLanding} 
                  alt={settings.name || "Teh Warga"} 
                  fill 
                  className="object-contain"
                  priority
                />
              </div>
            ) : (
              <div className="text-center group py-6 md:py-10">
                <h1 className="text-5xl md:text-[120px] font-black leading-none tracking-tighter text-white uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-100 via-green-200 to-lime-200">
                  {settings?.name || "TEH WARGA"}
                </h1>
                <div className="h-1 md:h-2 w-full bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 mt-1"></div>
                <p className="text-sm md:text-3xl font-black tracking-[0.1em] text-white uppercase mt-4 italic">
                  {settings?.tagline || "SPESIALIS RACIKAN VARIAN TEH • GANDRUNGMANGU"}
                </p>
              </div>
            )}
          </div>
          
          {/* Description Text */}
          <p className="text-white/90 max-w-2xl text-sm md:text-lg leading-relaxed font-bold px-4 mb-8 md:mb-12 tracking-tight">
            Pusat racikan varian teh segar, teh autentik, dan minuman teh khas warga. Pengalaman rasa teh terbaik di Teh Warga Cabang Gandrungmangu.
          </p>

          {/* Action Buttons - Identical Position to Store 1 and Store 2 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 w-full max-w-xl px-4 md:px-0">
            <Link href="/teh_warga_gdm/employee-login" className="w-full sm:w-1/2">
              <Button className="w-full bg-white text-[#064e3b] hover:bg-slate-100 rounded-full h-14 md:h-20 px-8 text-sm md:text-xl font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95 border-none">
                Sistem Karyawan
              </Button>
            </Link>
            <Link href="/teh_warga_gdm/absensi" className="w-full sm:w-1/2">
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
          # T E H W A R G A &nbsp; # C A B A N G G A N D R U N G M A N G U &nbsp; # T E A H O U S E
        </p>
      </div>
    </div>
  );
}
