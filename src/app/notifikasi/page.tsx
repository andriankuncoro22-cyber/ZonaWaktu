
import { Bell, Info } from "lucide-react";

export default function NotifikasiPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pusat Notifikasi</h1>
        <p className="text-slate-500">Peringatan stok kritis dan pengingat sistem.</p>
      </div>

      <div className="grid gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl border bg-white hover:bg-slate-50 transition-colors">
            <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Stok Kritis: Terigu Segitiga Biru</p>
              <p className="text-sm text-slate-500">Sisa stok 5kg, di bawah batas minimum 10kg.</p>
              <p className="text-xs text-slate-400 mt-2">2 jam yang lalu</p>
            </div>
            <div className="shrink-0">
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
