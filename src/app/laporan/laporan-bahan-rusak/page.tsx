"use client";

import React, { useState, useMemo } from "react";
import { 
  AlertTriangle, 
  Trash2, 
  Search, 
  Calendar as CalendarIcon, 
  FileUp, 
  FileDown,
  PackageX,
  User,
  Clock,
  Layers,
  CheckCircle2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { 
  collection, 
  query, 
  where, 
  doc, 
  deleteDoc, 
  updateDoc, 
  increment,
  orderBy 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function LaporanBahanRusakPage() {
  const db = useFirestore();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [reportType, setReportType] = useState<"daily" | "monthly">("daily");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Store config settings for PDF Kop
  const settingsRef = useMemoFirebase(() => doc(db, "settings", "store_config"), [db]);
  const { data: settings } = useDoc(settingsRef);

  // Fetch Bahan Rusak logs
  const rusakQuery = useMemoFirebase(() => {
    return query(collection(db, "bahan-rusak"), orderBy("createdAt", "desc"));
  }, [db]);
  const { data: rawLogs, loading } = useCollection(rusakQuery);

  // Filter logs by date/month and search term
  const filteredLogs = useMemo(() => {
    if (!rawLogs) return [];

    return rawLogs.filter((log: any) => {
      // Date filter
      const matchesDate = reportType === "daily" 
        ? log.tanggal === selectedDate 
        : (log.tanggal && log.tanggal.startsWith(selectedMonth));

      if (!matchesDate) return false;

      // Search filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const nameMatch = (log.materialName || "").toLowerCase().includes(term);
      const codeMatch = (log.materialCode || "").toLowerCase().includes(term);
      const karyawanMatch = (log.karyawanNama || "").toLowerCase().includes(term);
      const noteMatch = (log.keterangan || "").toLowerCase().includes(term);

      return nameMatch || codeMatch || karyawanMatch || noteMatch;
    });
  }, [rawLogs, reportType, selectedDate, selectedMonth, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalIncidents = filteredLogs.length;
    const uniqueMaterials = new Set(filteredLogs.map((l: any) => l.materialId || l.materialName)).size;
    const totalQty = filteredLogs.reduce((sum: number, l: any) => sum + Number(l.jumlah || 0), 0);

    return { totalIncidents, uniqueMaterials, totalQty };
  }, [filteredLogs]);

  const handleDelete = async (log: any) => {
    const confirmMessage = `Hapus catatan bahan rusak "${log.materialName}" (${log.jumlah} ${log.satuanKecil})?\n\nTindakan ini akan OTOMATIS mengembalikan ${log.jumlah} ${log.satuanKecil} ke stok kontainer bahan baku.`;
    if (!confirm(confirmMessage)) return;

    try {
      // 1. Revert container stock in bahan-baku collection
      if (log.materialId) {
        const matRef = doc(db, "bahan-baku", log.materialId);
        await updateDoc(matRef, {
          qtyKontainerKecil: increment(Number(log.jumlah || 0))
        });
      }

      // 2. Delete document from bahan-rusak collection
      await deleteDoc(doc(db, "bahan-rusak", log.id));

      toast({
        title: "Catatan Bahan Rusak Dihapus",
        description: `Stok kontainer ${log.materialName} sebanyak ${log.jumlah} ${log.satuanKecil} berhasil dikembalikan.`,
      });
    } catch (err) {
      console.error("Error deleting bahan rusak log:", err);
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: "Terjadi kesalahan saat mengembalikan stok kontainer.",
      });
    }
  };

  const handleExportExcel = () => {
    const dataToExport = filteredLogs.map((log: any, idx: number) => ({
      No: idx + 1,
      Tanggal: log.tanggal || "-",
      Shift: `Shift ${log.shift || 1}`,
      "Kode Bahan": log.materialCode || "-",
      "Nama Bahan": log.materialName || "-",
      "Jumlah Rusak": `${log.jumlah || 0} ${log.satuanKecil || "pcs"}`,
      Keterangan: log.keterangan || "-",
      "Penginput (Karyawan)": log.karyawanNama || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Bahan Rusak");
    XLSX.writeFile(wb, `laporan-bahan-rusak-${reportType === "daily" ? selectedDate : selectedMonth}.xlsx`);
  };

  const handleExportPDF = async () => {
    const docPDF = new jsPDF();
    
    // Header Kop
    if (settings?.logoHeader) {
      try {
        const response = await fetch(settings.logoHeader);
        const blob = await response.blob();
        const logoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        docPDF.addImage(logoBase64 as string, 'PNG', 15, 10, 35, 12);
      } catch (e) {
        console.error("Failed to load logo for PDF", e);
      }
    }

    docPDF.setFontSize(16);
    docPDF.setTextColor(139, 26, 26);
    docPDF.text(settings?.name?.toUpperCase() || "ZONA WAKTU", 105, 15, { align: 'center' });
    docPDF.setFontSize(9);
    docPDF.setTextColor(100);
    docPDF.text(settings?.tagline || "Coffee & Teh Bakar Autentik", 105, 21, { align: 'center' });
    docPDF.setDrawColor(139, 26, 26);
    docPDF.line(15, 26, 195, 26);
    
    docPDF.setFontSize(13);
    docPDF.setTextColor(0);
    docPDF.text(`LAPORAN BAHAN RUSAK / AFKIR (${reportType === "daily" ? selectedDate : selectedMonth})`, 105, 36, { align: 'center' });

    const tableData = filteredLogs.map((log: any) => [
      log.materialCode || "-",
      log.materialName || "-",
      `${log.jumlah} ${log.satuanKecil || "pcs"}`,
      log.tanggal || "-",
      `Shift ${log.shift || 1} (${log.karyawanNama || "-"})`,
      log.keterangan || "-"
    ]);

    autoTable(docPDF, {
      head: [["KODE", "NAMA BAHAN", "JUMLAH", "TANGGAL", "PENGINPUT", "KETERANGAN"]],
      body: tableData,
      startY: 44,
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8 },
    });

    docPDF.save(`laporan-bahan-rusak-${reportType === "daily" ? selectedDate : selectedMonth}.pdf`);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
      {/* Filters Bar */}
      <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <Button
                variant={reportType === "daily" ? "default" : "ghost"}
                onClick={() => setReportType("daily")}
                className={cn("rounded-xl px-4 font-bold text-xs h-9", reportType === "daily" ? "bg-rose-600 hover:bg-rose-700 text-white" : "text-slate-600")}
              >
                Harian
              </Button>
              <Button
                variant={reportType === "monthly" ? "default" : "ghost"}
                onClick={() => setReportType("monthly")}
                className={cn("rounded-xl px-4 font-bold text-xs h-9", reportType === "monthly" ? "bg-rose-600 hover:bg-rose-700 text-white" : "text-slate-600")}
              >
                Bulanan
              </Button>
            </div>

            {reportType === "daily" ? (
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-bold text-xs text-slate-800 w-auto"
              />
            ) : (
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-bold text-xs text-slate-800 w-auto"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="rounded-2xl border-slate-200 font-bold text-xs h-11 px-4 gap-2 text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4 text-emerald-600" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="rounded-2xl border-slate-200 font-bold text-xs h-11 px-4 gap-2 text-slate-700 hover:bg-slate-50"
            >
              <FileUp className="h-4 w-4 text-rose-600" /> PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Kejadian Rusak</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalIncidents} Insiden</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
            <PackageX className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Jenis Bahan Terpengaruh</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.uniqueMaterials} Item</p>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Kuantitas Rusak</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalQty.toLocaleString('id-ID')} Satuan</p>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="rounded-[2rem] border-none bg-white overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
            <Input
              type="text"
              placeholder="Cari kode, bahan, karyawan, keterangan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-11 rounded-2xl border-none bg-slate-50 font-bold text-xs text-slate-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Records:</span>
            <span className="text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-full">{filteredLogs.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="pl-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Kode Bahan</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Nama Bahan</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Jumlah Bahan</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Tanggal & Waktu</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Penginput</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700">Keterangan</th>
                <th className="pr-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-700 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-xs font-bold text-slate-400">
                    Memuat data laporan bahan rusak...
                  </td>
                </tr>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="pl-6 py-4 font-bold text-xs text-rose-600">
                      {log.materialCode || "-"}
                    </td>
                    <td className="px-4 py-4 font-black text-xs text-slate-900 uppercase">
                      {log.materialName || "-"}
                    </td>
                    <td className="px-4 py-4 font-black text-xs text-slate-900">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100">
                        {log.jumlah} {log.satuanKecil || "pcs"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                      <div>{log.tanggal || "-"}</div>
                      <div className="text-[9px] text-slate-600 font-medium">
                        {log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          Shift {log.shift || 1}
                        </span>
                        <span>{log.karyawanNama || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-600 max-w-xs truncate">
                      {log.keterangan || "-"}
                    </td>
                    <td className="pr-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(log)}
                        className="h-8 w-8 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Hapus rincian & kembalikan ke stok kontainer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-60" />
                      <p className="text-xs font-black uppercase tracking-wider text-slate-600">Tidak ada catatan bahan rusak pada periode ini</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
