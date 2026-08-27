import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-black uppercase italic tracking-tight text-slate-900">404 - Halaman Tidak Ditemukan</h1>
      <p className="text-xs font-bold text-slate-500 max-w-sm uppercase tracking-wider">
        Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 px-6 py-2.5 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
