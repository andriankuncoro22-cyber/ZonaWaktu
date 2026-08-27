"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Coffee, 
  Store, 
  MapPin, 
  Clock, 
  ArrowRight, 
  Sparkles, 
  Search, 
  Flame,
  ShieldCheck,
  UserCheck,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFirestore, useDoc, useMemoFirebase, doc } from "@/firebase";

interface StoreBranch {
  id: string;
  code: string;
  region: string;
  name: string;
  tagline: string;
  address: string;
  hours: string;
  status: "active" | "coming_soon";
  isPrimary?: boolean;
  branchNumber: string;
  route: string;
  ownerLoginRoute: string;
  adminLoginRoute: string;
  employeeLoginRoute: string;
  absensiRoute: string;
  features: string[];
  theme: {
    cardBg: string;
    cardBorder: string;
    glowColor: string;
    regionTextColor: string;
    textColor: string;
    subtextColor: string;
    infoBorderColor: string;
    featureBg: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    tagBg: string;
    tagText: string;
    btnBg: string;
    btnText: string;
    btnHover: string;
    accentLine: string;
  };
}

const DEFAULT_BRANCHES: StoreBranch[] = [
  {
    id: "gdm",
    code: "ZW-01",
    region: "GANDRUNGMANGU",
    name: "Zona Waktu - Gandrungmangu",
    tagline: "Cabang Pusat & Flagship Coffee & Teh Bakar",
    address: "Area Gandrungmangu - Pusat Operasional Utama",
    hours: "08.00 - 22.00 WIB",
    status: "active",
    isPrimary: true,
    branchNumber: "CABANG 01 • PUSAT",
    route: "/zona_gdm",
    ownerLoginRoute: "/owner-login",
    adminLoginRoute: "/admin-login",
    employeeLoginRoute: "/employee-login",
    absensiRoute: "/absensi",
    features: ["Coffee & Teh Bakar", "Kasir POS", "Sistem Karyawan", "Absensi GPS"],
    theme: {
      cardBg: "bg-gradient-to-b from-[#8b1414] via-[#630d0d] to-[#3b0808]",
      cardBorder: "border-amber-400/60 hover:border-amber-300 shadow-2xl shadow-red-950/80",
      glowColor: "bg-amber-400/25",
      regionTextColor: "text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-100",
      textColor: "text-white",
      subtextColor: "text-white/80",
      infoBorderColor: "border-white/10",
      featureBg: "bg-white/10 text-white/90 border-white/10",
      badgeBg: "bg-amber-400/20",
      badgeText: "text-amber-200",
      badgeBorder: "border-amber-400/50",
      tagBg: "bg-black/40 border-amber-400/30 text-amber-100",
      tagText: "text-amber-200",
      btnBg: "bg-white",
      btnText: "text-[#8b1414]",
      btnHover: "hover:bg-amber-50 hover:shadow-xl hover:shadow-amber-500/20",
      accentLine: "bg-gradient-to-r from-amber-400 via-amber-300 to-transparent",
    }
  },
  {
    id: "cabang-kedungreja",
    code: "ZW-02",
    region: "KEDUNGREJA",
    name: "Zona Waktu - Kedungreja",
    tagline: "Coffee & Teh Bakar Cabang Kedungreja",
    address: "Area Kedungreja - Outlet Operasional",
    hours: "08.00 - 22.00 WIB",
    status: "active",
    branchNumber: "CABANG 02 • OUTLET",
    route: "/zona_kedungreja",
    ownerLoginRoute: "/zona_kedungreja/owner-login",
    adminLoginRoute: "/zona_kedungreja/admin-login",
    employeeLoginRoute: "/zona_kedungreja/employee-login",
    absensiRoute: "/zona_kedungreja/absensi",
    features: ["Coffee & Teh Bakar", "Kasir POS", "Sistem Karyawan", "Absensi GPS"],
    theme: {
      cardBg: "bg-gradient-to-b from-[#ffffff] via-[#f0fdfa] to-[#dcfce7]",
      cardBorder: "border-teal-400/90 hover:border-teal-500 shadow-2xl shadow-cyan-900/30",
      glowColor: "bg-teal-300/40",
      regionTextColor: "text-transparent bg-clip-text bg-gradient-to-r from-teal-900 via-cyan-900 to-emerald-900",
      textColor: "text-slate-900",
      subtextColor: "text-slate-700",
      infoBorderColor: "border-teal-200/90",
      featureBg: "bg-teal-100/90 text-teal-950 border-teal-300 font-bold",
      badgeBg: "bg-teal-700",
      badgeText: "text-white",
      badgeBorder: "border-teal-600",
      tagBg: "bg-teal-100 border-teal-300 text-teal-900",
      tagText: "text-teal-900",
      btnBg: "bg-gradient-to-r from-teal-700 to-cyan-800",
      btnText: "text-white",
      btnHover: "hover:from-teal-800 hover:to-cyan-900 hover:shadow-xl hover:shadow-teal-700/30",
      accentLine: "bg-gradient-to-r from-teal-600 via-cyan-600 to-transparent",
    }
  },
  {
    id: "tehwarga",
    code: "TW-01",
    region: "TEH WARGA GDM",
    name: "Teh Warga - Gandrungmangu",
    tagline: "Spesialis Racikan Varian Teh Segar & Teh Warga Autentik",
    address: "Area Gandrungmangu - Outlet Spesialis Varian Teh",
    hours: "08.00 - 22.00 WIB",
    status: "active",
    branchNumber: "CABANG 03 • SPESIALIS TEH",
    route: "/teh_warga_gdm",
    ownerLoginRoute: "/teh_warga_gdm/owner-login",
    adminLoginRoute: "/teh_warga_gdm/admin-login",
    employeeLoginRoute: "/teh_warga_gdm/employee-login",
    absensiRoute: "/teh_warga_gdm/absensi",
    features: ["Varian Teh Spesialis", "Kasir POS", "Sistem Karyawan", "Absensi GPS"],
    theme: {
      cardBg: "bg-gradient-to-b from-[#064e3b] via-[#043e30] to-[#022c22]",
      cardBorder: "border-emerald-400/60 hover:border-emerald-300 shadow-2xl shadow-emerald-950/80",
      glowColor: "bg-emerald-400/25",
      regionTextColor: "text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-green-300 to-lime-200",
      textColor: "text-white",
      subtextColor: "text-emerald-100/80",
      infoBorderColor: "border-emerald-500/20",
      featureBg: "bg-emerald-800/50 text-emerald-200 border-emerald-600/50 font-bold",
      badgeBg: "bg-emerald-500/20",
      badgeText: "text-emerald-300",
      badgeBorder: "border-emerald-400/40",
      tagBg: "bg-black/30 border-emerald-500/30 text-emerald-200",
      tagText: "text-emerald-300",
      btnBg: "bg-gradient-to-r from-emerald-400 to-lime-300",
      btnText: "text-[#022c22]",
      btnHover: "hover:from-emerald-300 hover:to-lime-200 hover:shadow-xl hover:shadow-emerald-500/20",
      accentLine: "bg-gradient-to-r from-emerald-400 via-lime-400 to-transparent",
    }
  }
];

export default function MultiStoreLandingPage() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "coming_soon">("all");

  const filteredBranches = DEFAULT_BRANCHES.filter((branch) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !query ||
      branch.region.toLowerCase().includes(query) ||
      branch.name.toLowerCase().includes(query) ||
      branch.code.toLowerCase().includes(query) ||
      branch.address.toLowerCase().includes(query);
    
    if (filterStatus === "all") return matchesSearch;
    return matchesSearch && branch.status === filterStatus;
  });

  return (
    <div
      className="min-h-screen relative font-sans flex flex-col justify-between"
      style={{ 
        backgroundColor: "#1c0505", 
        backgroundImage: "radial-gradient(ellipse at 50% 0%, #7c1515 0%, #300606 60%, #120202 100%)",
        color: "#ffffff" 
      }}
    >
      {/* Subtle Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none" 
        style={{ backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)", backgroundSize: "32px 32px" }}
      />

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 w-full border-b border-white/10 backdrop-blur-xl bg-black/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-3.5 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner shrink-0">
              <Coffee className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <div>
              <span className="text-[11px] sm:text-sm font-black tracking-[0.25em] sm:tracking-[0.3em] uppercase block leading-none">
                {settings?.name || "ZONA WAKTU"}
              </span>
              <span className="text-[8px] sm:text-[9px] font-bold text-white/70 tracking-widest uppercase mt-0.5 sm:mt-1 block">
                PORTAL MULTI-OUTLET
              </span>
            </div>
          </div>

          {/* Quick Access Badges on Header */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link href="/owner-login">
              <Button variant="ghost" className="text-white hover:bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 h-8 sm:h-9 text-[9px] sm:text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-300" />
                <span>Owner</span>
              </Button>
            </Link>
            <Link href="/admin-login">
              <Button variant="ghost" className="text-white hover:bg-white/10 border border-white/20 rounded-full px-3 sm:px-4 h-8 sm:h-9 text-[9px] sm:text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                <UserCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-300" />
                <span>Admin</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-8 sm:py-12 md:py-14 w-full flex-1 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 animate-in fade-in slide-in-from-top-6 duration-700">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md mb-3 sm:mb-4 shadow-sm">
            <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-300 animate-pulse shrink-0" />
            <span className="text-[9px] sm:text-xs font-black uppercase tracking-[0.2em] text-white">
              SISTEM SENTRAL MULTI-CABANG
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight uppercase leading-tight">
            PILIH CABANG TOKO
          </h1>
          <p className="text-white/80 text-xs sm:text-sm md:text-base font-medium mt-2 sm:mt-3 max-w-xl mx-auto px-2">
            Pilih area gerai di bawah ini untuk mengakses dashboard, operasional kasir, sistem karyawan, dan absensi cabang Anda.
          </p>

          {/* Search and Filters Bar - Fully Mobile Optimized */}
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 max-w-xl mx-auto">
            <div className="relative w-full">
              <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Gandrungmangu / Kedungreja / Teh Warga..."
                className="w-full pl-10 sm:pl-11 pr-4 h-11 sm:h-12 rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-white/40 text-xs sm:text-sm font-medium backdrop-blur-md focus:border-white focus:ring-0"
              />
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-center">
              <Button
                variant={filterStatus === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterStatus("all")}
                className={`rounded-xl text-[10px] sm:text-[11px] font-bold h-10 sm:h-11 px-3 uppercase ${filterStatus === "all" ? "bg-white text-[#7c1515]" : "text-white/80 hover:bg-white/10 border border-white/10"}`}
              >
                Semua
              </Button>
              <Button
                variant={filterStatus === "active" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterStatus("active")}
                className={`rounded-xl text-[10px] sm:text-[11px] font-bold h-10 sm:h-11 px-3 uppercase ${filterStatus === "active" ? "bg-white text-[#7c1515]" : "text-white/80 hover:bg-white/10 border border-white/10"}`}
              >
                Aktif
              </Button>
            </div>
          </div>
        </div>

        {/* Store Branches Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {filteredBranches.map((branch, index) => {
            const isActive = branch.status === "active";
            
            return (
              <div 
                key={branch.id}
                className="animate-in fade-in slide-in-from-bottom-6 duration-700 w-full"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <Card 
                  className={`h-full rounded-[1.75rem] sm:rounded-[2rem] p-5 sm:p-7 flex flex-col justify-between transition-all duration-300 relative overflow-hidden backdrop-blur-xl border ${branch.theme.cardBg} ${branch.theme.cardBorder} ${
                    isActive ? "hover:-translate-y-1.5 active:scale-[0.99]" : "opacity-75"
                  }`}
                >
                  {/* Glowing corner indicator */}
                  {isActive && (
                    <div className={`absolute -top-12 -right-12 w-32 h-32 ${branch.theme.glowColor} rounded-full blur-3xl pointer-events-none`} />
                  )}

                  <div>
                    {/* Header Badges */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-black tracking-widest uppercase border ${branch.theme.badgeBg} ${branch.theme.badgeText} ${branch.theme.badgeBorder}`}>
                          {branch.code}
                        </span>
                        <span className={`px-2.5 py-0.5 sm:py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase tracking-wider border ${branch.theme.tagBg}`}>
                          {branch.branchNumber}
                        </span>
                      </div>
                      
                      {isActive ? (
                        <div className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0 ${branch.id === 'cabang-kedungreja' ? 'bg-emerald-100 border border-emerald-300 text-emerald-800' : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${branch.id === 'cabang-kedungreja' ? 'bg-emerald-600' : 'bg-emerald-400'} animate-pulse`} />
                          <span>Buka &bull; Aktif</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-slate-700/50 border border-white/10 text-white/50 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0">
                          Segera
                        </div>
                      )}
                    </div>

                    {/* Prominent Region Title - NEVER Truncated */}
                    <div className="mb-4 sm:mb-5">
                      <span className={`text-[10px] sm:text-[11px] font-black tracking-[0.25em] uppercase block ${branch.theme.subtextColor}`}>
                        {branch.id === 'tehwarga' ? 'TEH WARGA' : 'ZONA WAKTU'}
                      </span>
                      <h2 className={`text-2xl sm:text-3xl lg:text-2xl xl:text-3xl font-black italic tracking-tight leading-tight uppercase mt-1 mb-2 ${branch.theme.regionTextColor} drop-shadow-sm break-words`}>
                        {branch.region}
                      </h2>
                      <div className={`h-1 w-20 sm:w-28 rounded-full mb-2.5 ${branch.theme.accentLine}`} />
                      <p className={`text-xs sm:text-sm font-semibold leading-snug ${branch.theme.subtextColor}`}>
                        {branch.tagline}
                      </p>
                    </div>

                    {/* Location & Hours Info */}
                    <div className={`space-y-2 py-3.5 sm:py-4 border-y text-xs ${branch.theme.infoBorderColor} ${branch.theme.textColor}`}>
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
                        <span className="text-xs font-semibold leading-tight">{branch.address}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="text-xs font-semibold">{branch.hours}</span>
                      </div>
                    </div>

                    {/* Feature tags */}
                    <div className="flex flex-wrap gap-1 sm:gap-1.5 my-4">
                      {branch.features.map((feat, fIdx) => (
                        <span 
                          key={fIdx}
                          className={`text-[8px] sm:text-[9px] font-bold px-2.5 py-0.5 sm:py-1 rounded-md border ${branch.theme.featureBg}`}
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Main Action Link Button */}
                  <div className="pt-2">
                    {isActive ? (
                      <Link href={branch.route} className="block w-full">
                        <Button className={`w-full ${branch.theme.btnBg} ${branch.theme.btnText} ${branch.theme.btnHover} rounded-2xl h-12 sm:h-14 font-black uppercase tracking-wider text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-2 group border-none`}>
                          <span>MASUK KE TOKO {branch.region}</span>
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    ) : (
                      <Button 
                        disabled 
                        className="w-full bg-white/10 text-white/40 border border-white/10 rounded-2xl h-12 sm:h-14 font-bold uppercase tracking-wider text-xs cursor-not-allowed"
                      >
                        Tahap Pengembangan
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Empty state if search doesn't match */}
        {filteredBranches.length === 0 && (
          <div className="text-center py-12 sm:py-16 bg-white/5 rounded-3xl border border-white/10 max-w-md mx-auto px-4">
            <Store className="h-10 w-10 mx-auto text-white/30 mb-3" />
            <p className="text-sm font-bold text-white uppercase tracking-wider">Cabang tidak ditemukan</p>
            <p className="text-xs text-white/60 mt-1">Coba kata kunci &apos;Gandrungmangu&apos;, &apos;Kedungreja&apos;, atau &apos;Teh Warga&apos;.</p>
          </div>
        )}

        {/* Quick Shortcuts on Footer */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/70 text-center sm:text-left">
          <div className="flex items-center gap-2 justify-center">
            <Sparkles className="h-4 w-4 text-amber-300 shrink-0" />
            <span className="font-semibold text-[11px] sm:text-xs">Zona Waktu Coffee & Teh Bakar &bull; Multi-Branch Portal</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap justify-center text-[11px] sm:text-xs">
            <Link href="/zona_gdm" className="hover:text-amber-300 transition-colors font-bold underline-offset-4 hover:underline">
              Gandrungmangu &rarr;
            </Link>
            <Link href="/zona_kedungreja" className="hover:text-cyan-300 transition-colors font-bold underline-offset-4 hover:underline">
              Kedungreja &rarr;
            </Link>
            <Link href="/teh_warga_gdm" className="hover:text-emerald-300 transition-colors font-bold underline-offset-4 hover:underline">
              Teh Warga GDM &rarr;
            </Link>
            <Link href="/absensi" className="hover:text-white transition-colors underline-offset-4 hover:underline">
              Portal Absensi &rarr;
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="relative z-20 px-4 sm:px-6 py-5 sm:py-6 max-w-7xl mx-auto w-full text-center border-t border-white/10 opacity-60">
        <p className="text-[8px] sm:text-[9px] md:text-[10px] font-bold text-white uppercase tracking-[0.4em] sm:tracking-[0.6em]">
          &copy; {new Date().getFullYear()} ZONA WAKTU &bull; TEH WARGA GANDRUNGMANGU &bull; MULTI-BRANCH SYSTEM
        </p>
      </footer>
    </div>
  );
}
