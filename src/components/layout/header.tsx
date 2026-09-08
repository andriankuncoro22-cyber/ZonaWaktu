import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Coffee, ChevronDown, Menu, CupSoda, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestore, useDoc, useMemoFirebase, doc } from "@/firebase";
import { 
  useActiveBranch, 
  setActiveBranch, 
  getStoreConfigDocId, 
  getDefaultStoreIdentity, 
  BRANCH_LIST, 
  BranchId 
} from "@/lib/branch-helper";
import { logoutWithFirebaseAuth } from "@/lib/auth-service";
import { cn } from "@/lib/utils";

import Image from "next/image";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function Header() {
  const router = useRouter();
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const defaultIdentity = getDefaultStoreIdentity(activeBranch);

  const settingsRef = useMemoFirebase(
    () => doc(db, "settings", getStoreConfigDocId(activeBranch)), 
    [db, activeBranch]
  );
  const { data: settings } = useDoc(settingsRef);
  const [isOpen, setIsOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const storeName = settings?.name || defaultIdentity.name;
  const logoHeader = settings?.logoHeader;
  const isTehWarga = activeBranch === "tehwarga";
  const isKedungreja = activeBranch === "kedungreja";

  const branchInfo = BRANCH_LIST[activeBranch] || BRANCH_LIST.gdm;

  React.useEffect(() => {
    if (activeBranch === 'all') {
      setActiveBranch('gdm');
    }
  }, [activeBranch]);

  const handleBranchSelect = (branchId: BranchId) => {
    setActiveBranch(branchId);
  };

  const handleLogout = async () => {
    await logoutWithFirebaseAuth();
    router.push("/");
  };

  return (
    <header className="w-full bg-transparent flex flex-col justify-center px-3 md:px-8 z-40 gap-1.5 md:gap-0 pt-2 pb-1 md:py-0 md:h-24 shrink-0">
      <div className="flex items-center justify-between w-full h-14 md:h-full gap-3">
        <div className="flex items-center gap-3 md:gap-6 shrink-0">
          {/* MOBILE HAMBURGER MENU */}
          <div className="lg:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm border border-slate-100">
                  <Menu className="h-5 w-5 text-slate-600" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 border-none w-72">
                <Sidebar onItemClick={() => setIsOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex items-center" suppressHydrationWarning>
            {logoHeader ? (
              <div className="relative h-10 w-36 md:h-12 md:w-48 transition-transform hover:scale-[1.02]">
                <Image 
                  src={logoHeader} 
                  alt={storeName} 
                  fill 
                  className="object-contain object-left" 
                  priority
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-3" suppressHydrationWarning>
                <div 
                  suppressHydrationWarning
                  className={`h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl ${
                    isTehWarga ? 'bg-amber-600' : isKedungreja ? 'bg-cyan-600' : activeBranch === 'all' ? 'bg-slate-900' : 'bg-emerald-600'
                  } flex items-center justify-center shadow-lg shadow-slate-900/10`}
                >
                  {isTehWarga ? (
                    <CupSoda className="h-4 w-4 md:h-5 md:w-5 text-white" />
                  ) : activeBranch === 'all' ? (
                    <Store className="h-4 w-4 md:h-5 md:w-5 text-white" />
                  ) : (
                    <Coffee className="h-4 w-4 md:h-5 md:w-5 text-white" />
                  )}
                </div>
                <div className="hidden sm:block" suppressHydrationWarning>
                  <span 
                    suppressHydrationWarning
                    className="text-xs md:text-sm font-black tracking-tight text-slate-900 uppercase italic leading-none block"
                  >
                    {storeName}
                  </span>
                  <span 
                    suppressHydrationWarning
                    className="text-[7px] md:text-[8px] font-black text-slate-400 tracking-[0.2em] uppercase mt-0.5 block"
                  >
                    {branchInfo.code} &bull; Management System
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DESKTOP: TOP STORE SWITCHER (CAPSULE PILL) */}
        <div className="hidden md:flex flex-1 max-w-2xl justify-center py-1">
          <div className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full p-1.5 shadow-sm w-max mx-auto gap-1">
            {/* ZONA WAKTU GDM */}
            <button
              type="button"
              onClick={() => handleBranchSelect('gdm')}
              className={cn(
                "flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-all duration-200",
                activeBranch === 'gdm'
                  ? "bg-slate-900 text-white shadow-sm scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>ZONA WAKTU GDM</span>
            </button>

            {/* ZONA KEDUNGREJA */}
            <button
              type="button"
              onClick={() => handleBranchSelect('kedungreja')}
              className={cn(
                "flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-all duration-200",
                activeBranch === 'kedungreja'
                  ? "bg-slate-900 text-white shadow-sm scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
              <span>ZONA KEDUNGREJA</span>
            </button>

            {/* TEH WARGA GDM */}
            <button
              type="button"
              onClick={() => handleBranchSelect('tehwarga')}
              className={cn(
                "flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-all duration-200",
                activeBranch === 'tehwarga'
                  ? "bg-slate-900 text-white shadow-sm scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span>TEH WARGA GDM</span>
            </button>
          </div>
        </div>

      {/* RIGHT CONTROLS */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-xl md:rounded-2xl text-slate-600 relative bg-white shadow-sm hover:bg-slate-50 border border-slate-100 h-10 w-10 hidden sm:flex"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 bg-primary rounded-full" />
        </Button>
        
        {/* User Account / Profile Dropdown */}
        <div className="relative">
          <div 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 md:gap-3 pl-1.5 pr-2.5 md:pr-3 py-1 bg-white rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:bg-slate-50 transition-all select-none"
          >
            <Avatar className="h-8 w-8 rounded-xl border-2 border-slate-50 shadow-sm">
              <AvatarImage src="https://picsum.photos/seed/admin/100/100" />
              <AvatarFallback>ZW</AvatarFallback>
            </Avatar>
            <div className="text-left hidden md:block">
              <p className="text-[10px] font-black text-slate-900 leading-none uppercase italic">Owner / Admin</p>
              <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {branchInfo.shortName}
              </p>
            </div>
            <ChevronDown className="h-3 w-3 text-slate-400 ml-0.5" />
          </div>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-black uppercase text-slate-900">Akun Terpadu</p>
                <p className="text-[10px] text-slate-500 font-medium">Akses Penuh Semua Toko</p>
              </div>

              <div className="py-1">
                <Link
                  href="/pengaturan"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <Store className="h-4 w-4 text-slate-500" />
                  <span>Pengaturan Hak Akses</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-left"
                >
                  <LogOut className="h-4 w-4 text-rose-600" />
                  <span>Keluar / Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* MOBILE STORE SWITCHER (ALL 3 STORES VISIBLE, COMPACT GRID, NO SCROLL) */}
      <div className="md:hidden w-full px-0.5 pb-0.5">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xs w-full">
          {/* ZONA WAKTU GDM */}
          <button
            type="button"
            onClick={() => handleBranchSelect('gdm')}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-tight transition-all min-h-[30px]",
              activeBranch === 'gdm'
                ? "bg-slate-900 text-white shadow-xs scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate font-black">GDM</span>
          </button>

          {/* ZONA KEDUNGREJA */}
          <button
            type="button"
            onClick={() => handleBranchSelect('kedungreja')}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-tight transition-all min-h-[30px]",
              activeBranch === 'kedungreja'
                ? "bg-slate-900 text-white shadow-xs scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
            <span className="truncate font-black">KD.REJA</span>
          </button>

          {/* TEH WARGA GDM */}
          <button
            type="button"
            onClick={() => handleBranchSelect('tehwarga')}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-tight transition-all min-h-[30px]",
              activeBranch === 'tehwarga'
                ? "bg-slate-900 text-white shadow-xs scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate font-black">TEH WARGA</span>
          </button>
        </div>
      </div>
    </header>
  );
}
