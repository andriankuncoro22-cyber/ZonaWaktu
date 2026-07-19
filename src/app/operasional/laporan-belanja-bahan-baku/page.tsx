"use client";

import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Trash2, Save, Loader2 } from "lucide-react";

export default function LaporanBelanjaBahanBakuPage() {
  const db = useFirestore();
  const { toast } = useToast();

  // Fetch purchase logs (log_pembelian_bahan) ordered by newest first
  const logsQuery = useMemoFirebase(
    () => query(collection(db, "log_pembelian_bahan"), orderBy("createdAt", "desc"), limit(50)),
    [db]
  );
  const { data: logs, loading } = useCollection(logsQuery);

  // Compute total spending (price * qty) across all logs
  const totalSpending = useMemo(() => {
    if (!logs) return 0;
    return logs.reduce((sum: number, log: any) => {
      const itemsTotal = (log.items ?? []).reduce((inner: number, it: any) => {
        const price = it.price ?? it.purchasePrice ?? 0;
        const qty = it.qty ?? 0;
        return inner + price * qty;
      }, 0);
      return sum + itemsTotal;
    }, 0);
  }, [logs]);

  // Delete a log entry (optional)
  const handleDelete = async (id: string) => {
    if (!confirm("Hapus catatan ini?")) return;
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "log_pembelian_bahan", id));
      toast({ title: "Nota dihapus" });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Gagal menghapus",
        description: "Terjadi kesalahan saat menghapus data."
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">
            Laporan Belanja Bahan Baku
          </h1>
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mt-2">
            Ringkasan pembelian bahan baku beserta harga per unit.
          </p>
        </div>
        <div className="bg-slate-900 text-white rounded-2xl px-6 py-4 font-black text-xl">
          Total Belanja: Rp {totalSpending.toLocaleString("id-ID")}
        </div>
      </header>

      <Card className="rounded-[3rem] border-none shadow-sm bg-white overflow-hidden p-8 md:p-12">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {logs && logs.length > 0 ? (
          <div className="space-y-6">
            {logs.map((log: any) => (
              <Card key={log.id} className="rounded-[2rem] border-none shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-black uppercase text-slate-400">
                      #{log.nomorNota}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {log.createdAt?.toDate ? new Date(log.createdAt.toDate()).toLocaleDateString("id-ID") : "Baru saja"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(log.id)}
                    className="text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-black uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100 mt-2">
                  <div className="col-span-5">Bahan</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Harga Satuan</div>
                  <div className="col-span-3 text-right">Total</div>
                </div>
                {log.items?.map((item: any, idx: number) => {
                  const price = item.price ?? item.purchasePrice ?? 0;
                  const qty = item.qty ?? 0;
                  const total = price * qty;
                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:grid sm:grid-cols-12 gap-1.5 sm:gap-2 py-3 border-b border-slate-50 text-xs font-bold"
                    >
                      <div className="sm:col-span-5 text-slate-900 font-black truncate flex justify-between sm:block">
                        <span>{item.materialName}</span>
                        <span className="sm:hidden text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {qty} {item.unit || item.satuan || ""}
                        </span>
                      </div>
                      
                      <div className="hidden sm:block sm:col-span-2 text-center text-slate-700">
                        {qty} <span className="text-[10px] text-slate-400 font-semibold">{item.unit || item.satuan || ""}</span>
                      </div>
                      
                      <div className="flex sm:grid sm:col-span-2 justify-between sm:justify-end text-slate-600 sm:text-right">
                        <span className="sm:hidden text-slate-400 font-semibold">Harga Satuan:</span>
                        <span>Rp {price.toLocaleString("id-ID")}</span>
                      </div>
                      
                      <div className="flex sm:grid sm:col-span-3 justify-between sm:justify-end text-slate-900 font-black sm:text-right">
                        <span className="sm:hidden text-slate-400 font-semibold">Total Harga:</span>
                        <span>Rp {total.toLocaleString("id-ID")}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-4 text-right font-black text-primary text-sm">
                  Subtotal: Rp {log.items?.reduce((s: number, it: any) => s + (it.price ?? it.purchasePrice ?? 0) * (it.qty ?? 0), 0).toLocaleString("id-ID")}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-slate-500">
            Belum ada data pembelian bahan baku.
          </div>
        )}
      </Card>
    </div>
  );
}
