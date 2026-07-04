"use client";

import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { ArrowRightLeft, Loader2, Package, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LaporanPemindahanBarangPage() {
  const db = useFirestore();

  const logsQuery = useMemoFirebase(
    () => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(100)),
    [db]
  );
  const { data: logs, loading } = useCollection(logsQuery);

  const transferLogs = useMemo(() => {
    return (logs || []).filter((log: any) => log.location === "kontainer" && (log.type === "ambil-gudang" || log.type === "kembali-gudang"));
  }, [logs]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            Laporan Pemindahan Barang
          </h1>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
            Riwayat transfer stok dari gudang ke kontainer dan sebaliknya.
          </p>
        </div>
      </header>

      <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-sm">
        <div className="p-4 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : transferLogs.length > 0 ? (
            <div className="space-y-4">
              {transferLogs.map((log: any) => {
                const isTake = log.type === "ambil-gudang";
                return (
                  <div key={log.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl",
                          isTake ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {isTake ? <Package className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">#{log.nomorNota}</p>
                          <p className="text-sm font-black uppercase italic text-slate-900">
                            {isTake ? "Pemindahan dari Gudang ke Kontainer" : "Pemindahan dari Kontainer ke Gudang"}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "Baru saja"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        {log.totalItems} item
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {log.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[10px] sm:text-xs">
                          <div>
                            <p className="font-bold uppercase tracking-[0.18em] text-slate-400">{item.materialCode}</p>
                            <p className="font-black uppercase italic text-slate-800">{item.materialName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-primary">{item.qty} {item.unit}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Belum ada data pemindahan barang.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
