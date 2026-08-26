"use client";

import React, { useState } from "react";
import { Search, Bell, Coffee, ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestore, useDoc, useMemoFirebase, doc } from "@/firebase";

import Image from "next/image";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function Header() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="h-20 md:h-24 bg-transparent flex items-center justify-between px-4 md:px-8 z-40">
      <div className="flex items-center gap-4 md:gap-8">
        {/* MOBILE HAMBURGER MENU */}
        <div className="lg:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm">
                <Menu className="h-5 w-5 text-slate-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-none w-72">
              <Sidebar onItemClick={() => setIsOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center">
          {settings?.logoHeader ? (
            <div className="relative h-10 w-40 md:h-14 md:w-56 transition-transform hover:scale-[1.02]">
              <Image 
                src={settings.logoHeader} 
                alt={settings.name || "Logo"} 
                fill 
                className="object-contain object-left" 
                priority
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Coffee className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="hidden xs:block">
                <span className="text-sm md:text-xl font-black tracking-tighter text-slate-900 uppercase italic leading-none block">
                  {settings?.name || "ZONA WAKTU"}
                </span>
                <span className="text-[7px] md:text-[9px] font-bold text-slate-600 tracking-[0.2em] uppercase">Management System</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="hidden xl:flex items-center bg-white border-none shadow-sm rounded-full px-6 py-2.5 w-96 focus-within:shadow-md transition-all border border-slate-100">
          <Search className="h-4 w-4 text-slate-400 mr-3" />
          <input 
            type="text" 
            placeholder="Cari transaksi atau produk..." 
            className="bg-transparent border-none outline-none text-xs w-full placeholder:text-slate-400 font-bold uppercase tracking-wider text-slate-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Active Store Branch Badge */}
        {(() => {
          const isKedungreja = typeof window !== "undefined" && localStorage.getItem("current_branch") === "kedungreja";
          return (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-100 shadow-sm">
              <span className={`h-2 w-2 rounded-full animate-pulse ${isKedungreja ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <div className="text-left">
                <p className="text-[9px] font-black uppercase text-slate-800 leading-none">
                  {isKedungreja ? "Outlet Kedungreja" : "Outlet Gandrungmangu"}
                </p>
                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {isKedungreja ? "ZW-02 • Aktif" : "ZW-01 • Pusat"}
                </p>
              </div>
              <a 
                href="/" 
                className="ml-1 text-[8px] font-black uppercase text-primary hover:underline pl-1 border-l border-slate-200"
              >
                Ganti
              </a>
            </div>
          );
        })()}

        <Button variant="ghost" size="icon" className="rounded-xl md:rounded-2xl text-slate-600 relative bg-white shadow-sm hover:bg-slate-50 border border-slate-100 h-10 w-10">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full border-2 border-white" />
        </Button>
        
        <div className="h-8 w-[1px] bg-slate-200 mx-0 md:mx-1 hidden xs:block" />
        
        <div className="flex items-center gap-2 md:gap-3 pl-1 md:pl-2 bg-white p-1 md:p-1.5 pr-2 md:pr-4 rounded-xl md:rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors">
          <Avatar className="h-8 w-8 md:h-9 md:w-9 rounded-lg md:rounded-xl border-2 border-slate-50 shadow-sm">
            <AvatarImage src="https://picsum.photos/seed/admin/100/100" />
            <AvatarFallback>AD</AvatarFallback>
          </Avatar>
          <div className="text-left hidden sm:block">
            <p className="text-[9px] md:text-[10px] font-black text-slate-900 leading-none uppercase italic">Admin Zona</p>
            <p className="text-[7px] md:text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              {typeof window !== "undefined" && localStorage.getItem("current_branch") === "kedungreja" ? "Cabang Kedungreja" : "Cabang Gandrungmangu"}
            </p>
          </div>
          <ChevronDown className="h-3 w-3 text-slate-400 ml-0 md:ml-1" />
        </div>
      </div>
    </header>
  );
}
