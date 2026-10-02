"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  useFirestore, 
  useConsolidatedCollection 
} from "@/firebase";
import { 
  collection, 
  addDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  useActiveBranch, 
  BRANCH_LIST, 
  BranchId,
  normalizeBranchId
} from "@/lib/branch-helper";
import { 
  DEFAULT_KONSINYASI_PRODUCTS, 
  isKonsinyasiProduct 
} from "@/lib/konsinyasi-helper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowDownLeft, 
  History, 
  Calendar, 
  Trash2, 
  Save, 
  Cookie,
  FileSpreadsheet,
  FileDown,
  DollarSign,
  TrendingUp,
  RotateCcw,
  Boxes,
  Search,
  Building2,
  Receipt,
  Sparkles,
  ShieldCheck
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";

interface TitipJualItem {
  code: string;
  nama: string;
  qtyMasuk: number;
  qtyRetur: number;
  hargaJual: number;
  hargaDasar: number;
  catatan?: string;
}

interface TitipJualDoc {
  id: string;
  tanggal: string;
  branchId: string;
  vendor: string;
  penerima: string;
  pengembali?: string;
  items: TitipJualItem[];
  tipe?: "masuk" | "retur";
  catatan?: string;
  status?: string;
  createdAt?: unknown;
}

interface RawProductDoc {
  code?: string;
  nama?: string;
  name?: string;
  kategori?: string;
  hargaJual?: number;
  hargaDasar?: number;
  isKonsinyasi?: boolean;
  namaPenitip?: string;
}

interface RawSaleItem {
  code?: string;
  name?: string;
  nama?: string;
  total?: number;
  qty?: number;
}

interface RawSaleDoc {
  tanggal?: string;
  _branchId?: string;
  branchId?: string;
  items?: RawSaleItem[];
}

interface SettlementRow {
  key: string;
  tanggal: string;
  branchId: string;
  branchName: string;
  code: string;
  nama: string;
  vendor: string;
  qtyMasuk: number;
  qtyTerjual: number;
  qtyRetur: number;
  sisaFisik: number;
  hargaJual: number;
  hargaDasar: number;
  omsetPenjualan: number;
  wajibBayarVendor: number;
  marginToko: number;
}

export default function OperasionalTitipJualPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const { toast } = useToast();

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  // Operational State
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<"masuk" | "retur" | "rekap" | "histori">("rekap");
  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranch);
  const [vendorName, setVendorName] = useState<string>("Penitip Soft Cookies");
  const [managerName, setManagerName] = useState<string>("Owner / Manajemen");
  const [pengembaliName, setPengembaliName] = useState<string>("Owner / Manajemen");
  const [saving, setSaving] = useState<boolean>(false);

  // Form State for Incoming Goods
  const [inputItems, setInputItems] = useState<{ [code: string]: number }>({});
  const [catatanMasuk, setCatatanMasuk] = useState<string>("");

  // Form State for Returns
  const [returInputs, setReturInputs] = useState<{ [code: string]: number }>({});
  const [catatanRetur, setCatatanRetur] = useState<string>("");

  // Filter State for Rekapitulasi
  const [rekapPeriodMode, setRekapPeriodMode] = useState<"daily" | "monthly">("daily");
  const [rekapMonth, setRekapMonth] = useState<string>(currentMonthStr);
  const [rekapSearch, setRekapSearch] = useState<string>("");

  // Fetch product catalog
  const { data: rawProducts } = useConsolidatedCollection(db, "produk");
  
  // Fetch closing sales (penjualan collection)
  const { data: rawSales } = useConsolidatedCollection(db, "penjualan");

  // Fetch titip-jual records
  const { data: rawTitipJual, loading: loadingTitip } = useConsolidatedCollection(db, "titip-jual");

  // Load user name from localStorage
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedUser = localStorage.getItem("karyawan_user") || localStorage.getItem("absensi_user") || localStorage.getItem("auth_user");
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          const name = parsed.nama || parsed.name || parsed.username || "Owner / Manajemen";
          setManagerName(name);
          setPengembaliName(name);
        }
      } catch {
        // ignore
      }
    });
  }, []);

  // Sync selectedBranch with activeBranch if activeBranch changes
  useEffect(() => {
    if (activeBranch) {
      queueMicrotask(() => {
        setSelectedBranch(activeBranch);
      });
    }
  }, [activeBranch]);

  // Consignment product list
  const availableKonsinyasiProducts = useMemo(() => {
    const list = [...DEFAULT_KONSINYASI_PRODUCTS];
    if (rawProducts && Array.isArray(rawProducts)) {
      (rawProducts as RawProductDoc[]).forEach((p) => {
        if (isKonsinyasiProduct(p)) {
          const code = String(p.code || "").trim();
          if (!list.some((item) => item.code === code)) {
            list.push({
              code: code || `KONS-${list.length + 1}`,
              name: p.nama || p.name || "Produk Konsinyasi",
              kategori: p.kategori || "Titip Jual",
              hargaJual: Number(p.hargaJual || 8000),
              hargaDasar: Number(p.hargaDasar || 5000),
              margin: Math.max(0, Number(p.hargaJual || 8000) - Number(p.hargaDasar || 5000)),
              vendor: p.namaPenitip || "Penitip Soft Cookies",
            });
          }
        }
      });
    }
    return list;
  }, [rawProducts]);

  // Map of products by code for rapid lookup
  const productMap = useMemo(() => {
    const map: Record<string, { code: string; name: string; hargaJual: number; hargaDasar: number; vendor: string }> = {};
    availableKonsinyasiProducts.forEach((p) => {
      map[p.code] = {
        code: p.code,
        name: p.name,
        hargaJual: p.hargaJual,
        hargaDasar: p.hargaDasar,
        vendor: p.vendor,
      };
    });
    return map;
  }, [availableKonsinyasiProducts]);

  // Filter sales for the selected date & branch (Daily Reconciliation)
  const currentSalesMap = useMemo(() => {
    const map: { [key: string]: number } = {};
    if (!rawSales || !Array.isArray(rawSales)) return map;

    const targetBranch = selectedBranch === "all" ? null : selectedBranch;

    (rawSales as RawSaleDoc[]).forEach((sale) => {
      if (sale.tanggal !== selectedDate) return;
      if (targetBranch) {
        const sBranch = normalizeBranchId(sale.branchId || sale._branchId || "");
        if (sBranch !== normalizeBranchId(targetBranch)) return;
      }

      if (Array.isArray(sale.items)) {
        sale.items.forEach((item) => {
          const itemCode = String(item.code || "").trim();
          const itemName = String(item.nama || item.name || "").toLowerCase().trim();
          const qty = Number(item.qty || item.total || 0);

          if (itemCode) {
            map[itemCode] = (map[itemCode] || 0) + qty;
          }
          if (itemName) {
            map[itemName] = (map[itemName] || 0) + qty;
          }
        });
      }
    });

    return map;
  }, [rawSales, selectedDate, selectedBranch]);

  // Aggregate titip-jual mutasi for the current selected date & branch
  const currentDayTitipSummary = useMemo(() => {
    const masukMap: { [code: string]: number } = {};
    const returMap: { [code: string]: number } = {};

    if (!rawTitipJual || !Array.isArray(rawTitipJual)) {
      return { masukMap, returMap };
    }

    const targetBranch = selectedBranch === "all" ? null : selectedBranch;

    (rawTitipJual as TitipJualDoc[]).forEach((docItem) => {
      if (docItem.tanggal !== selectedDate) return;
      if (targetBranch) {
        const docBranch = normalizeBranchId(docItem.branchId);
        if (docBranch !== normalizeBranchId(targetBranch)) return;
      }

      if (Array.isArray(docItem.items)) {
        docItem.items.forEach((it) => {
          const code = String(it.code || "").trim();
          if (!code) return;
          masukMap[code] = (masukMap[code] || 0) + Number(it.qtyMasuk || 0);
          returMap[code] = (returMap[code] || 0) + Number(it.qtyRetur || 0);
        });
      }
    });

    return { masukMap, returMap };
  }, [rawTitipJual, selectedDate, selectedBranch]);

  // All historical titip-jual docs sorted by date desc
  const historyDocs = useMemo(() => {
    if (!rawTitipJual || !Array.isArray(rawTitipJual)) return [];
    const list = [...(rawTitipJual as TitipJualDoc[])];

    return list
      .filter((docItem) => {
        if (selectedBranch !== "all") {
          return normalizeBranchId(docItem.branchId) === normalizeBranchId(selectedBranch);
        }
        return true;
      })
      .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  }, [rawTitipJual, selectedBranch]);

  // Comprehensive Settlement Rows for Rekapitulasi Tab (Owner Versi Lengkap)
  const settlementRows = useMemo(() => {
    // 1. Build aggregates across all records
    const titipAggregate: Record<string, { masuk: number; retur: number; vendor: string; name: string }> = {};
    const salesAggregate: Record<string, number> = {};
    const allKeys = new Set<string>();

    const targetBranches: BranchId[] = ["gdm", "kedungreja", "tehwarga", "gembong"];

    // Populate titip-jual
    if (rawTitipJual && Array.isArray(rawTitipJual)) {
      (rawTitipJual as TitipJualDoc[]).forEach((docItem) => {
        const tgl = docItem.tanggal || "";
        const bId = normalizeBranchId(docItem.branchId) as BranchId;
        if (!tgl || !bId) return;

        if (Array.isArray(docItem.items)) {
          docItem.items.forEach((it) => {
            const code = String(it.code || "").trim();
            if (!code) return;
            const key = `${tgl}_${bId}_${code}`;
            allKeys.add(key);

            if (!titipAggregate[key]) {
              titipAggregate[key] = { masuk: 0, retur: 0, vendor: docItem.vendor || "Penitip Soft Cookies", name: it.nama };
            }
            titipAggregate[key].masuk += Number(it.qtyMasuk || 0);
            titipAggregate[key].retur += Number(it.qtyRetur || 0);
          });
        }
      });
    }

    // Populate sales
    if (rawSales && Array.isArray(rawSales)) {
      (rawSales as RawSaleDoc[]).forEach((sale) => {
        const tgl = sale.tanggal || "";
        const bId = normalizeBranchId(sale.branchId || sale._branchId || "") as BranchId;
        if (!tgl || !bId) return;

        if (Array.isArray(sale.items)) {
          sale.items.forEach((it) => {
            const code = String(it.code || "").trim();
            const name = String(it.nama || it.name || "").toLowerCase().trim();
            const qty = Number(it.qty || it.total || 0);

            // Match by code
            availableKonsinyasiProducts.forEach((kp) => {
              if (kp.code === code || kp.name.toLowerCase() === name) {
                const key = `${tgl}_${bId}_${kp.code}`;
                allKeys.add(key);
                salesAggregate[key] = (salesAggregate[key] || 0) + qty;
              }
            });
          });
        }
      });
    }

    // If daily mode, ensure all products for active branches exist on that date
    if (rekapPeriodMode === "daily") {
      targetBranches.forEach((b) => {
        availableKonsinyasiProducts.forEach((p) => {
          allKeys.add(`${selectedDate}_${b}_${p.code}`);
        });
      });
    }

    const rows: SettlementRow[] = [];

    allKeys.forEach((key) => {
      const parts = key.split("_");
      if (parts.length < 3) return;
      const tanggal = parts[0];
      const branchId = parts[1] as BranchId;
      const code = parts[2];

      // Filter by period
      if (rekapPeriodMode === "daily" && tanggal !== selectedDate) return;
      if (rekapPeriodMode === "monthly" && !tanggal.startsWith(rekapMonth)) return;

      // Filter by branch
      if (selectedBranch !== "all" && branchId !== selectedBranch) return;

      const pInfo = productMap[code] || {
        code,
        name: titipAggregate[key]?.name || "Soft Cookies",
        hargaJual: 8000,
        hargaDasar: 5000,
        vendor: "Penitip Soft Cookies",
      };

      const titipData = titipAggregate[key] || { masuk: 0, retur: 0, vendor: pInfo.vendor, name: pInfo.name };
      const qtyMasuk = titipData.masuk;
      const qtyRetur = titipData.retur;
      const qtyTerjual = salesAggregate[key] || 0;

      // In monthly view, skip if completely zero activity
      if (rekapPeriodMode === "monthly" && qtyMasuk === 0 && qtyTerjual === 0 && qtyRetur === 0) {
        return;
      }

      const sisaFisik = Math.max(0, qtyMasuk - qtyTerjual - qtyRetur);
      const hj = pInfo.hargaJual;
      const hd = pInfo.hargaDasar;
      const omset = qtyTerjual * hj;
      const wajibBayar = qtyTerjual * hd;
      const margin = qtyTerjual * (hj - hd);

      const branchName = BRANCH_LIST[branchId]?.shortName || branchId.toUpperCase();

      rows.push({
        key,
        tanggal,
        branchId,
        branchName,
        code,
        nama: pInfo.name,
        vendor: titipData.vendor || pInfo.vendor,
        qtyMasuk,
        qtyTerjual,
        qtyRetur,
        sisaFisik,
        hargaJual: hj,
        hargaDasar: hd,
        omsetPenjualan: omset,
        wajibBayarVendor: wajibBayar,
        marginToko: margin,
      });
    });

    return rows
      .filter((r) => {
        if (!rekapSearch.trim()) return true;
        const q = rekapSearch.toLowerCase();
        return (
          r.nama.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.vendor.toLowerCase().includes(q) ||
          r.branchName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.code.localeCompare(b.code));
  }, [
    rawTitipJual,
    rawSales,
    rekapPeriodMode,
    selectedDate,
    rekapMonth,
    selectedBranch,
    rekapSearch,
    availableKonsinyasiProducts,
    productMap,
  ]);

  // Overall Financial & Volume Stats for Owner
  const overallStats = useMemo(() => {
    return settlementRows.reduce(
      (acc, r) => {
        acc.totalMasuk += r.qtyMasuk;
        acc.totalTerjual += r.qtyTerjual;
        acc.totalRetur += r.qtyRetur;
        acc.totalSisa += r.sisaFisik;
        acc.totalOmset += r.omsetPenjualan;
        acc.totalWajibBayar += r.wajibBayarVendor;
        acc.totalMargin += r.marginToko;
        return acc;
      },
      {
        totalMasuk: 0,
        totalTerjual: 0,
        totalRetur: 0,
        totalSisa: 0,
        totalOmset: 0,
        totalWajibBayar: 0,
        totalMargin: 0,
      }
    );
  }, [settlementRows]);

  // Calculations for Tab 1 (Catat Masuk)
  const incomingCalculations = useMemo(() => {
    let totalPcs = 0;
    let totalNilai = 0;
    let totalPotensiMargin = 0;

    availableKonsinyasiProducts.forEach((p) => {
      const qty = inputItems[p.code] || 0;
      totalPcs += qty;
      totalNilai += qty * p.hargaDasar;
      totalPotensiMargin += qty * (p.hargaJual - p.hargaDasar);
    });

    return { totalPcs, totalNilai, totalPotensiMargin };
  }, [availableKonsinyasiProducts, inputItems]);

  // Helper for Retur inputs
  const getProductReturQty = (code: string, sisaFisik: number) => {
    if (code in returInputs) {
      return returInputs[code];
    }
    return sisaFisik;
  };

  // Quick Action: Retur Semua Sisa
  const handleReturSemuaSisa = () => {
    const updated: { [code: string]: number } = {};
    availableKonsinyasiProducts.forEach((p) => {
      const masuk = currentDayTitipSummary.masukMap[p.code] || 0;
      const terjual = currentSalesMap[p.code] || currentSalesMap[p.name.toLowerCase()] || 0;
      const sisa = Math.max(0, masuk - terjual);
      updated[p.code] = sisa;
    });
    setReturInputs(updated);
    toast({
      title: "Sisa Otomatis Terisi",
      description: "Jumlah retur telah disesuaikan dengan seluruh sisa barang yang belum terjual.",
    });
  };

  // Submit Catat Barang Masuk
  const handleSaveIncoming = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToSave: TitipJualItem[] = [];

    availableKonsinyasiProducts.forEach((p) => {
      const qty = inputItems[p.code] || 0;
      if (qty > 0) {
        itemsToSave.push({
          code: p.code,
          nama: p.name,
          qtyMasuk: qty,
          qtyRetur: 0,
          hargaJual: p.hargaJual,
          hargaDasar: p.hargaDasar,
        });
      }
    });

    if (itemsToSave.length === 0) {
      toast({
        variant: "destructive",
        title: "Jumlah Masuk Kosong",
        description: "Silakan isi minimal 1 produk dengan jumlah masuk lebih dari 0.",
      });
      return;
    }

    setSaving(true);
    try {
      const targetBranch = selectedBranch === "all" ? "gdm" : selectedBranch;
      await addDoc(collection(db, "titip-jual"), {
        tanggal: selectedDate,
        branchId: targetBranch,
        vendor: vendorName || "Penitip Soft Cookies",
        penerima: managerName || "Owner / Manajemen",
        items: itemsToSave,
        tipe: "masuk",
        catatan: catatanMasuk || "",
        status: "aktif",
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Penerimaan Berhasil Disimpan",
        description: `Berhasil mencatat penerimaan ${itemsToSave.length} produk konsinyasi ke outlet ${targetBranch.toUpperCase()}.`,
      });

      setInputItems({});
      setCatatanMasuk("");
      setActiveTab("rekap");
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error?.message || "Terjadi kesalahan saat menyimpan data.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Submit Pengembalian (Retur)
  const handleSaveRetur = async (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToSave: TitipJualItem[] = [];

    availableKonsinyasiProducts.forEach((p) => {
      const masuk = currentDayTitipSummary.masukMap[p.code] || 0;
      const terjual = currentSalesMap[p.code] || currentSalesMap[p.name.toLowerCase()] || 0;
      const sisa = Math.max(0, masuk - terjual);
      const returQty = getProductReturQty(p.code, sisa);

      if (masuk > 0 || returQty > 0) {
        itemsToSave.push({
          code: p.code,
          nama: p.name,
          qtyMasuk: 0,
          qtyRetur: returQty,
          hargaJual: p.hargaJual,
          hargaDasar: p.hargaDasar,
        });
      }
    });

    if (itemsToSave.length === 0) {
      toast({
        variant: "destructive",
        title: "Belum Ada Data Retur",
        description: "Tidak ada produk titip yang dapat diretur.",
      });
      return;
    }

    setSaving(true);
    try {
      const targetBranch = selectedBranch === "all" ? "gdm" : selectedBranch;
      await addDoc(collection(db, "titip-jual"), {
        tanggal: selectedDate,
        branchId: targetBranch,
        vendor: vendorName || "Penitip Soft Cookies",
        penerima: managerName || "Owner / Manajemen",
        pengembali: pengembaliName || managerName || "Owner / Manajemen",
        items: itemsToSave,
        tipe: "retur",
        catatan: catatanRetur || "",
        status: "selesai",
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Pengembalian (Retur) Disimpan",
        description: `Berhasil mencatat retur barang konsinyasi ke ${vendorName}.`,
      });

      setCatatanRetur("");
      setActiveTab("rekap");
    } catch (err: unknown) {
      const error = err as { message?: string };
      console.error(err);
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Retur",
        description: error?.message || "Terjadi kendala sistem.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete Mutasi Document
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus catatan mutasi titip jual ini?")) return;
    try {
      await deleteDoc(doc(db, "titip-jual", docId));
      toast({ title: "Dokumen Berhasil Dihapus" });
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast({ variant: "destructive", title: "Gagal Menghapus", description: error?.message || "Gagal menghapus data" });
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const exportData = settlementRows.map((r, idx) => ({
      No: idx + 1,
      Tanggal: r.tanggal,
      Outlet: r.branchName,
      Kode: r.code,
      "Nama Produk": r.nama,
      Penitip: r.vendor,
      "Barang Masuk (Pcs)": r.qtyMasuk,
      "Terjual (Excel Closing)": r.qtyTerjual,
      "Retur Kembali (Pcs)": r.qtyRetur,
      "Sisa Fisik Toko": r.sisaFisik,
      "Harga Jual (Rp)": r.hargaJual,
      "Setor Vendor / Pcs (Rp)": r.hargaDasar,
      "Omset Penjualan (Rp)": r.omsetPenjualan,
      "Wajib Bayar Vendor (Rp)": r.wajibBayarVendor,
      "Margin Laba Toko (Rp)": r.marginToko,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Konsinyasi");
    const periodLabel = rekapPeriodMode === "daily" ? selectedDate : rekapMonth;
    XLSX.writeFile(wb, `Rekap_Konsinyasi_Owner_${periodLabel}.xlsx`);
  };

  // Export PDF Nota Pelunasan Resmi
  const handleExportPDF = () => {
    const docPdf = new jsPDF("p", "mm", "a4");

    // Header Kop
    docPdf.setFontSize(16);
    docPdf.setTextColor(180, 83, 9); // Amber 700
    docPdf.text("NOTA PELUNASAN KONSINYASI (TITIP JUAL)", 105, 18, { align: "center" });

    docPdf.setFontSize(10);
    docPdf.setTextColor(71, 85, 105);
    const periodLabel = rekapPeriodMode === "daily" ? `Tanggal: ${selectedDate}` : `Bulan: ${rekapMonth}`;
    const branchLabel = selectedBranch === "all" ? "Semua Cabang Toko (Konsolidasi)" : BRANCH_LIST[selectedBranch as BranchId]?.name || selectedBranch;
    docPdf.text(`Zona Waktu Management • ${periodLabel} • ${branchLabel}`, 105, 24, { align: "center" });

    docPdf.setDrawColor(217, 119, 6);
    docPdf.setLineWidth(0.5);
    docPdf.line(14, 28, 196, 28);

    // Summary Box
    docPdf.setFillColor(254, 243, 199); // amber 100
    docPdf.roundedRect(14, 32, 182, 24, 3, 3, "F");
    docPdf.setFontSize(9);
    docPdf.setTextColor(120, 53, 15);
    docPdf.text(`Total Masuk: ${overallStats.totalMasuk} Pcs`, 20, 40);
    docPdf.text(`Total Terjual: ${overallStats.totalTerjual} Pcs`, 68, 40);
    docPdf.text(`Total Retur: ${overallStats.totalRetur} Pcs`, 116, 40);
    docPdf.text(`Sisa Fisik: ${overallStats.totalSisa} Pcs`, 155, 40);

    docPdf.setFontSize(11);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`TOTAL WAJIB BAYAR (HAK PENITIP): Rp ${overallStats.totalWajibBayar.toLocaleString("id-ID")}`, 20, 50);

    // Table Data
    const tableBody = settlementRows.map((r, idx) => [
      idx + 1,
      r.tanggal,
      r.branchName,
      r.nama,
      `${r.qtyMasuk} pcs`,
      `${r.qtyTerjual} pcs`,
      `${r.qtyRetur} pcs`,
      `Rp ${r.hargaDasar.toLocaleString("id-ID")}`,
      `Rp ${r.wajibBayarVendor.toLocaleString("id-ID")}`,
    ]);

    autoTable(docPdf, {
      head: [["No", "Tgl", "Toko", "Produk", "Masuk", "Laku", "Retur", "Setor/Pcs", "Wajib Bayar"]],
      body: tableBody,
      startY: 60,
      theme: "grid",
      headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { halign: "center", cellWidth: 20 },
        2: { halign: "center", cellWidth: 20 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 16 },
        6: { halign: "right", cellWidth: 16 },
        7: { halign: "right", cellWidth: 22 },
        8: { halign: "right", cellWidth: 26, fontStyle: "bold" },
      },
    });

    const finalY = (docPdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 160;

    // Signatures
    docPdf.setFontSize(9);
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(71, 85, 105);
    docPdf.text("Diserahkan oleh (Pihak Manajemen Toko),", 25, finalY + 18);
    docPdf.text("Diterima oleh (Pihak Penitip / Vendor),", 135, finalY + 18);

    docPdf.line(25, finalY + 36, 75, finalY + 36);
    docPdf.line(135, finalY + 36, 185, finalY + 36);

    docPdf.text(`(${managerName || "Manajemen Toko"})`, 26, finalY + 41);
    docPdf.text(`(${vendorName || "Penitip Soft Cookies"})`, 136, finalY + 41);

    docPdf.save(`Nota_Pelunasan_Konsinyasi_${rekapPeriodMode === "daily" ? selectedDate : rekapMonth}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* 1. Top Executive Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-6 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 opacity-10 pointer-events-none">
          <Cookie className="h-64 w-64" />
        </div>
        
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white border border-white/30 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Owner & Executive Portal
            </span>
            <span className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-100">
              Versi Lengkap Keuangan & Fisik
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
            Manajemen Titip Jual (Konsinyasi)
          </h1>
          <p className="text-xs sm:text-sm text-amber-100/90 font-medium max-w-2xl">
            Pusat kendali penerimaan barang titip, rekonsiliasi otomatis penjualan closing kasir, kontrol margin keuntungan toko, dan pelunasan hak vendor.
          </p>
        </div>

        {/* Branch & Date Quick Selector */}
        <div className="flex flex-wrap items-center gap-2.5 relative z-10 bg-black/20 p-2.5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
            <Building2 className="h-4 w-4 text-amber-200" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="all" className="text-slate-900 font-semibold">Semua Outlet (Konsolidasi)</option>
              <option value="gdm" className="text-slate-900 font-semibold">Zona Waktu GDM</option>
              <option value="kedungreja" className="text-slate-900 font-semibold">Zona Waktu Kedungreja</option>
              <option value="tehwarga" className="text-slate-900 font-semibold">Zona Waktu Teh Warga</option>
              <option value="gembong" className="text-slate-900 font-semibold">Zona Waktu Gembong</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
            <Calendar className="h-4 w-4 text-amber-200" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 rounded-3xl border-slate-100 shadow-sm bg-gradient-to-br from-white to-amber-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Terjual</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {overallStats.totalTerjual} <span className="text-xs font-bold text-slate-400">Pcs</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Masuk: {overallStats.totalMasuk} • Retur: {overallStats.totalRetur} • Sisa: {overallStats.totalSisa}
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-3xl border-slate-100 shadow-sm bg-gradient-to-br from-white to-blue-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Omset Penjualan</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
              Rp {overallStats.totalOmset.toLocaleString("id-ID")}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Harga Jual Rata-rata Rp 8.000 / Pcs
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-3xl border-amber-200/60 shadow-sm bg-gradient-to-br from-white to-amber-100/40 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Wajib Bayar Vendor</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-amber-900 tracking-tight">
              Rp {overallStats.totalWajibBayar.toLocaleString("id-ID")}
            </div>
            <div className="text-[10px] text-amber-700/80 font-medium mt-0.5">
              Hak penitip (Rp 5.000 x {overallStats.totalTerjual} Pcs)
            </div>
          </div>
        </Card>

        <Card className="p-4 rounded-3xl border-emerald-200/60 shadow-sm bg-gradient-to-br from-white to-emerald-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Margin Laba Toko</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
              Rp {overallStats.totalMargin.toLocaleString("id-ID")}
            </div>
            <div className="text-[10px] text-emerald-600/80 font-medium mt-0.5">
              Margin Bersih Toko (Rp 3.000 / Pcs)
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab("rekap")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            activeTab === "rekap"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <Receipt className="h-4 w-4 text-amber-600" />
          Rekapitulasi & Pelunasan Vendor
        </button>

        <button
          onClick={() => setActiveTab("masuk")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            activeTab === "masuk"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
          Catat Penerimaan Barang Masuk
        </button>

        <button
          onClick={() => setActiveTab("retur")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            activeTab === "retur"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <RotateCcw className="h-4 w-4 text-orange-600" />
          Pengembalian (Retur) Real-Time
        </button>

        <button
          onClick={() => setActiveTab("histori")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            activeTab === "histori"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <History className="h-4 w-4 text-slate-600" />
          Riwayat & Mutasi Dokumen ({historyDocs.length})
        </button>
      </div>

      {/* 4. Tab Content: REKAPITULASI & PELUNASAN (Versi Lengkap Keuangan) */}
      {activeTab === "rekap" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setRekapPeriodMode("daily")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    rekapPeriodMode === "daily" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  )}
                >
                  Harian
                </button>
                <button
                  onClick={() => setRekapPeriodMode("monthly")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    rekapPeriodMode === "monthly" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  )}
                >
                  Bulanan
                </button>
              </div>

              {rekapPeriodMode === "monthly" ? (
                <input
                  type="month"
                  value={rekapMonth}
                  onChange={(e) => setRekapMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-xl focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold border border-amber-200/50">
                  <Calendar className="h-3.5 w-3.5" />
                  {selectedDate}
                </div>
              )}

              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari produk / vendor..."
                  value={rekapSearch}
                  onChange={(e) => setRekapSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs rounded-xl focus:outline-none w-44"
                />
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="rounded-xl border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Export Excel
              </Button>
              <Button
                size="sm"
                onClick={handleExportPDF}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5 shadow-md shadow-amber-600/20"
              >
                <FileDown className="h-4 w-4" />
                Cetak Nota Pelunasan (PDF)
              </Button>
            </div>
          </div>

          {/* Versi Lengkap Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 text-[10px]">
                    <th className="py-3 px-3 text-center">No</th>
                    <th className="py-3 px-3 text-left">Tgl & Toko</th>
                    <th className="py-3 px-3 text-left">Kode & Nama Produk</th>
                    <th className="py-3 px-3 text-center">Masuk</th>
                    <th className="py-3 px-3 text-center bg-amber-50/40 text-amber-800">Terjual (POS)</th>
                    <th className="py-3 px-3 text-center">Retur</th>
                    <th className="py-3 px-3 text-center">Sisa</th>
                    <th className="py-3 px-3 text-right">Harga Jual</th>
                    <th className="py-3 px-3 text-right">Setor Vendor</th>
                    <th className="py-3 px-3 text-right">Omset (Rp)</th>
                    <th className="py-3 px-3 text-right bg-amber-500/10 text-amber-900 font-black">Wajib Bayar Vendor</th>
                    <th className="py-3 px-3 text-right bg-emerald-50 text-emerald-800 font-black">Margin Toko</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {settlementRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400">
                        Belum ada rekapan data titip jual untuk filter ini.
                      </td>
                    </tr>
                  ) : (
                    settlementRows.map((r, idx) => (
                      <tr key={r.key} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{r.tanggal}</div>
                          <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            {r.branchName}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{r.nama}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.code} • {r.vendor}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">{r.qtyMasuk}</td>
                        <td className="py-3 px-3 text-center font-black text-amber-800 bg-amber-50/40">{r.qtyTerjual}</td>
                        <td className="py-3 px-3 text-center font-bold text-orange-600">{r.qtyRetur}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600">{r.sisaFisik}</td>
                        <td className="py-3 px-3 text-right">Rp {r.hargaJual.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right">Rp {r.hargaDasar.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right font-bold text-blue-700">Rp {r.omsetPenjualan.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right font-black text-amber-900 bg-amber-500/10">
                          Rp {r.wajibBayarVendor.toLocaleString("id-ID")}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-700 bg-emerald-50">
                          Rp {r.marginToko.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {settlementRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold text-xs">
                      <td colSpan={3} className="py-3 px-4 uppercase text-left font-black tracking-wider">
                        Total Rekapitulasi
                      </td>
                      <td className="py-3 px-3 text-center font-black">{overallStats.totalMasuk}</td>
                      <td className="py-3 px-3 text-center font-black text-amber-300">{overallStats.totalTerjual}</td>
                      <td className="py-3 px-3 text-center font-black text-orange-300">{overallStats.totalRetur}</td>
                      <td className="py-3 px-3 text-center font-black">{overallStats.totalSisa}</td>
                      <td colSpan={2} className="py-3 px-3 text-center text-slate-400 font-normal">
                        -
                      </td>
                      <td className="py-3 px-3 text-right font-black text-blue-300">
                        Rp {overallStats.totalOmset.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-amber-300 bg-amber-950/60">
                        Rp {overallStats.totalWajibBayar.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-300 bg-emerald-950/60">
                        Rp {overallStats.totalMargin.toLocaleString("id-ID")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab Content: CATAT PENERIMAAN BARANG MASUK */}
      {activeTab === "masuk" && (
        <form onSubmit={handleSaveIncoming} className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Toko / Outlet Tujuan</Label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 p-2.5 rounded-xl focus:outline-none"
                >
                  <option value="gdm">Zona Waktu GDM</option>
                  <option value="kedungreja">Zona Waktu Kedungreja</option>
                  <option value="tehwarga">Zona Waktu Teh Warga</option>
                  <option value="gembong">Zona Waktu Gembong</option>
                </select>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tanggal Masuk</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="mt-1.5 text-xs font-bold rounded-xl"
                />
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Nama Penitip / Vendor</Label>
                <Input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Contoh: Penitip Soft Cookies"
                  className="mt-1.5 text-xs font-bold rounded-xl"
                />
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Penerima (Manajemen / Toko)</Label>
                <Input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Nama Penerima"
                  className="mt-1.5 text-xs font-bold rounded-xl"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Catatan Pengiriman (Opsional)</Label>
              <Input
                type="text"
                value={catatanMasuk}
                onChange={(e) => setCatatanMasuk(e.target.value)}
                placeholder="Contoh: Titipan batch pagi 50 pcs kemasan mika"
                className="mt-1.5 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Form Table Barang Masuk */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Daftar Produk Konsinyasi</h3>
                <p className="text-[10px] text-slate-500">Masukkan jumlah fisik barang yang masuk dititipkan oleh vendor.</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400">Total Masuk: </span>
                <span className="text-xs font-black text-slate-900">{incomingCalculations.totalPcs} Pcs</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 text-[10px]">
                    <th className="py-3 px-3 text-center">No</th>
                    <th className="py-3 px-3 text-left">Kode & Nama Produk</th>
                    <th className="py-3 px-3 text-right">Harga Jual</th>
                    <th className="py-3 px-3 text-right">Setor Vendor</th>
                    <th className="py-3 px-3 text-right">Margin Toko</th>
                    <th className="py-3 px-4 text-center w-36 bg-amber-50/60 text-amber-900">Qty Masuk (Pcs)</th>
                    <th className="py-3 px-3 text-right">Nilai Barang</th>
                    <th className="py-3 px-3 text-right">Potensi Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {availableKonsinyasiProducts.map((p, idx) => {
                    const qty = inputItems[p.code] || 0;
                    const nilai = qty * p.hargaDasar;
                    const potensi = qty * (p.hargaJual - p.hargaDasar);

                    return (
                      <tr key={p.code} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.code}</div>
                        </td>
                        <td className="py-3 px-3 text-right">Rp {p.hargaJual.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right font-bold text-amber-800">Rp {p.hargaDasar.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">Rp {(p.hargaJual - p.hargaDasar).toLocaleString("id-ID")}</td>
                        <td className="py-3 px-4 text-center bg-amber-50/40">
                          <Input
                            type="number"
                            min="0"
                            value={inputItems[p.code] ?? ""}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setInputItems((prev) => ({ ...prev, [p.code]: val }));
                            }}
                            placeholder="0"
                            className="h-8 w-24 mx-auto text-center font-black text-xs rounded-lg border-amber-300 focus:border-amber-500 bg-white"
                          />
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-700">
                          Rp {nilai.toLocaleString("id-ID")}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          Rp {potensi.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-bold">Total Masuk: </span>
                  <span className="font-black text-slate-900">{incomingCalculations.totalPcs} Pcs</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Nilai Setor: </span>
                  <span className="font-black text-amber-800">Rp {incomingCalculations.totalNilai.toLocaleString("id-ID")}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Potensi Margin Toko: </span>
                  <span className="font-black text-emerald-700">Rp {incomingCalculations.totalPotensiMargin.toLocaleString("id-ID")}</span>
                </div>
              </div>

              <Button
                type="submit"
                disabled={saving || incomingCalculations.totalPcs === 0}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl px-6 gap-2 shadow-md shadow-amber-600/20"
              >
                <Save className="h-4 w-4" />
                {saving ? "Menyimpan..." : "Simpan Penerimaan Barang Masuk"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* 6. Tab Content: PENGEMBALIAN (RETUR) REAL-TIME */}
      {activeTab === "retur" && (
        <form onSubmit={handleSaveRetur} className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Rekonsiliasi Retur Konsinyasi</h3>
                <p className="text-[10px] text-slate-500">
                  Data Terjual otomatis tersinkronisasi dari upload Excel Closing POS Kasir pada tanggal & outlet terpilih.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReturSemuaSisa}
                className="rounded-xl border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold hover:bg-amber-100 gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                Isi Otomatis Retur Semua Sisa
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Nama Penitip / Vendor</Label>
                <Input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="mt-1.5 text-xs font-bold rounded-xl"
                />
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pengembali (Manajemen Toko)</Label>
                <Input
                  type="text"
                  value={pengembaliName}
                  onChange={(e) => setPengembaliName(e.target.value)}
                  className="mt-1.5 text-xs font-bold rounded-xl"
                />
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Catatan Retur (Opsional)</Label>
                <Input
                  type="text"
                  value={catatanRetur}
                  onChange={(e) => setCatatanRetur(e.target.value)}
                  placeholder="Contoh: Sisa fisik 8 pcs dikembalikan dalam kondisi utuh"
                  className="mt-1.5 text-xs rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Form Table Retur */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 text-[10px]">
                    <th className="py-3 px-3 text-center">No</th>
                    <th className="py-3 px-3 text-left">Kode & Nama Produk</th>
                    <th className="py-3 px-3 text-center">Masuk Hari Ini</th>
                    <th className="py-3 px-3 text-center bg-amber-50/40 text-amber-800">Terjual (POS)</th>
                    <th className="py-3 px-3 text-center">Sisa Belum Laku</th>
                    <th className="py-3 px-4 text-center w-36 bg-orange-50 text-orange-900 font-black">Qty Retur (Pcs)</th>
                    <th className="py-3 px-3 text-right">Setor Vendor</th>
                    <th className="py-3 px-3 text-right font-black text-amber-900">Wajib Bayar Vendor</th>
                    <th className="py-3 px-3 text-right font-black text-emerald-700">Margin Toko</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {availableKonsinyasiProducts.map((p, idx) => {
                    const masuk = currentDayTitipSummary.masukMap[p.code] || 0;
                    const terjual = currentSalesMap[p.code] || currentSalesMap[p.name.toLowerCase()] || 0;
                    const sisa = Math.max(0, masuk - terjual);
                    const returQty = getProductReturQty(p.code, sisa);
                    const wajibBayar = terjual * p.hargaDasar;
                    const margin = terjual * (p.hargaJual - p.hargaDasar);

                    return (
                      <tr key={p.code} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.code}</div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">{masuk}</td>
                        <td className="py-3 px-3 text-center font-black text-amber-800 bg-amber-50/40">{terjual}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600">{sisa}</td>
                        <td className="py-3 px-4 text-center bg-orange-50/40">
                          <Input
                            type="number"
                            min="0"
                            max={masuk}
                            value={returInputs[p.code] ?? returQty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setReturInputs((prev) => ({ ...prev, [p.code]: val }));
                            }}
                            className="h-8 w-24 mx-auto text-center font-black text-xs rounded-lg border-orange-300 focus:border-orange-500 bg-white"
                          />
                        </td>
                        <td className="py-3 px-3 text-right">Rp {p.hargaDasar.toLocaleString("id-ID")}</td>
                        <td className="py-3 px-3 text-right font-black text-amber-900">
                          Rp {wajibBayar.toLocaleString("id-ID")}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-700">
                          Rp {margin.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Retur akan mengubah status konsinyasi menjadi selesai dan mencatat fisik barang yang kembali ke penitip.
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl px-6 gap-2 shadow-md shadow-orange-600/20"
              >
                <Save className="h-4 w-4" />
                {saving ? "Menyimpan..." : "Simpan Pengembalian (Retur)"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* 7. Tab Content: RIWAYAT & DOKUMEN MUTASI */}
      {activeTab === "histori" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Riwayat Mutasi Dokumen Konsinyasi</h3>
              <p className="text-[10px] text-slate-500">Seluruh dokumen masuk dan retur yang tercatat di database.</p>
            </div>
            <span className="text-xs font-bold text-slate-400">{historyDocs.length} Dokumen</span>
          </div>

          {loadingTitip ? (
            <div className="py-12 text-center text-xs text-slate-400">Memuat riwayat konsinyasi...</div>
          ) : historyDocs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Belum ada riwayat dokumen konsinyasi.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {historyDocs.map((docItem) => {
                const isRetur = docItem.tipe === "retur";
                const totalPcs = (docItem.items || []).reduce((acc, it) => acc + (isRetur ? it.qtyRetur : it.qtyMasuk), 0);
                const bName = BRANCH_LIST[docItem.branchId as BranchId]?.shortName || docItem.branchId.toUpperCase();

                return (
                  <div key={docItem.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        isRetur ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600"
                      )}>
                        {isRetur ? <RotateCcw className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                            isRetur ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            {isRetur ? "Retur Pengembalian" : "Penerimaan Masuk"}
                          </span>
                          <span className="text-xs font-bold text-slate-800">{docItem.tanggal}</span>
                          <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            {bName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Penitip: <span className="font-semibold text-slate-700">{docItem.vendor}</span> • 
                          PIC: <span className="font-semibold text-slate-700">{docItem.pengembali || docItem.penerima}</span> • 
                          Total: <span className="font-bold text-slate-900">{totalPcs} Pcs</span>
                        </div>
                        {docItem.catatan && (
                          <div className="text-[10px] text-slate-400 italic mt-0.5">Catatan: {docItem.catatan}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDoc(docItem.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2 rounded-lg text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Hapus
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
