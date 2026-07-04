"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFirestore } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Loader2, FileSpreadsheet, FileDown, CalendarDays } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Row {
  id: string;
  tanggal: string;
  createdAt?: any;
  pembayaran: string;
  nominal: number;
  sumber: "Karyawan" | "Owner";
}

export default function LaporanOperasionalPage() {
  const db = useFirestore();
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);

  async function fetchReport() {
    setLoading(true);
    setRows(null);
    try {
      const [karyawanSnap, ownerSnap] = await Promise.all([
        getDocs(query(
          collection(db, "operasional-kontainer"),
          where("tanggal", ">=", startDate),
          where("tanggal", "<=", endDate)
        )),
        getDocs(query(
          collection(db, "operasional-toko"),
          where("tanggal", ">=", startDate),
          where("tanggal", "<=", endDate)
        )),
      ]);

      const data: Row[] = [];

      karyawanSnap.forEach((d) => {
        const s = d.data() as any;
        data.push({
          id: d.id,
          tanggal: s.tanggal || "",
          createdAt: s.createdAt,
          pembayaran: s.pembayaran || "-",
          nominal: Number(s.nominal || 0),
          sumber: "Karyawan",
        });
      });

      ownerSnap.forEach((d) => {
        const s = d.data() as any;
        data.push({
          id: d.id,
          tanggal: s.tanggal || "",
          createdAt: s.createdAt,
          pembayaran: s.paymentTypeLabel || s.paymentType || "Operasional Toko",
          nominal: Number(s.nominal || s.total || 0),
          sumber: "Owner",
        });
      });

      data.sort((a, b) => {
        const dateCompare = a.tanggal.localeCompare(b.tanggal);
        if (dateCompare !== 0) return dateCompare;
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setRows(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function exportExcel(data: Row[]) {
    const wsData = data.map((r) => ({
      Tanggal: r.tanggal,
      Sumber: r.sumber,
      Pembayaran: r.pembayaran,
      Nominal: r.nominal,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LaporanOperasional");
    XLSX.writeFile(wb, `Laporan_Operasional_${startDate}_to_${endDate}.xlsx`);
  }

  async function exportPDF(data: Row[]) {
    const docPDF = new jsPDF();
    docPDF.setFontSize(14);
    docPDF.text("Laporan Operasional - Karyawan & Owner", 14, 20);
    docPDF.setFontSize(10);
    docPDF.text(`Periode: ${startDate} - ${endDate}`, 14, 28);

    autoTable(docPDF, {
      head: [["Tanggal", "Sumber", "Pembayaran", "Nominal"]],
      body: data.map((r) => [
        r.tanggal,
        r.sumber,
        r.pembayaran,
        `Rp ${r.nominal.toLocaleString("id-ID")}`,
      ]),
      startY: 36,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [139, 26, 26] },
    });

    docPDF.save(`Laporan_Operasional_${startDate}_to_${endDate}.pdf`);
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Laporan Operasional</h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">Rekap pengeluaran karyawan dan owner dalam satu laporan</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-2xl px-5 py-3">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Periode: {startDate} — {endDate}</span>
        </div>
      </header>

      <Card className="rounded-[2.5rem] border-none bg-white overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-50 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Mulai</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 px-4 rounded-xl bg-slate-50 border-none text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Sampai</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-12 px-4 rounded-xl bg-slate-50 border-none text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-primary/20" />
          </div>

          <Button onClick={fetchReport} disabled={loading} className="h-12 px-8 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
            Tampilkan
          </Button>

          {rows && rows.length > 0 && (
            <>
              <Button variant="outline" onClick={() => exportExcel(rows)} className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
              </Button>
              <Button variant="outline" onClick={() => exportPDF(rows)} className="h-12 px-5 rounded-xl border-slate-200 font-black uppercase tracking-widest text-[9px] gap-2 bg-white">
                <FileDown className="h-4 w-4 text-primary" /> PDF
              </Button>
            </>
          )}
        </div>

        <div className="p-6 md:p-8">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          )}

          {!loading && rows && rows.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-xs font-black uppercase tracking-widest">Tidak ada data pada periode ini.</div>
          )}

          {!loading && rows && rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total pengeluaran periode ini</p>
                <p className="text-lg font-black text-primary">Rp {rows.reduce((sum, row) => sum + row.nominal, 0).toLocaleString("id-ID")}</p>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-slate-500">Tanggal</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-500">Sumber</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-500">Pembayaran</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-500 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 text-sm font-black text-slate-900">{r.tanggal}</td>
                        <td className="px-4 py-4 text-sm font-black text-slate-700">{r.sumber}</td>
                        <td className="px-4 py-4 text-sm text-slate-700">{r.pembayaran}</td>
                        <td className="px-4 py-4 text-right font-black text-primary">Rp {r.nominal.toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
