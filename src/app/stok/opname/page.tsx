import { History, ClipboardList, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function OpnamePage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Stock Opname</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-2 flex items-center gap-2">
            Verifikasi fisik stok gudang secara berkala
          </p>
        </div>
        <Button className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 px-8 py-6 h-auto shadow-lg shadow-indigo-100 gap-3">
          <Plus className="h-5 w-5" />
          <span className="font-black uppercase tracking-widest text-[10px]">Mulai Opname Baru</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 rounded-[2.5rem] border-none shadow-xl bg-white p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="h-20 w-20 rounded-[2rem] bg-indigo-50 flex items-center justify-center mb-8">
            <ClipboardList className="h-10 w-10 text-indigo-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">Belum Ada Sesi Aktif</h3>
          <p className="text-slate-400 font-bold text-sm max-w-sm">
            Klik tombol di atas untuk memulai verifikasi stok hari ini. Pastikan tidak ada transaksi berjalan saat opname dilakukan.
          </p>
        </Card>

        <div className="space-y-8">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8">
            <div className="flex items-center gap-3 mb-6">
              <History className="h-5 w-5 text-indigo-500" />
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Histori Opname</h4>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-50 flex items-center justify-between group cursor-pointer hover:bg-indigo-50 transition-colors">
                  <div>
                    <p className="text-sm font-black text-slate-900">12 Nov 2023</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Oleh: Admin</p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
