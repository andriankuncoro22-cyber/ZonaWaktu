import { ClipboardList, Search } from "lucide-react";

export default function KartuStokPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Kartu Stok</h1>
        <p className="text-slate-500">Pantau mutasi masuk dan keluar setiap item bahan baku.</p>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari bahan baku..." 
              className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="p-24 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-6">
            <ClipboardList className="h-10 w-10" />
          </div>
          <h3 className="text-lg font-semibold">Pilih Bahan Baku</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2">
            Silakan pilih bahan baku untuk melihat detail histori mutasi stoknya.
          </p>
        </div>
      </div>
    </div>
  );
}