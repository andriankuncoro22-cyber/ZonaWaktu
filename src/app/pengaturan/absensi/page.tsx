
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  Clock, 
  MapPin, 
  Camera,
  Users, 
  Monitor, 
  Trash2, 
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Eye,
  CheckCircle2,
  XCircle,
  Info,
  FileText
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirestore, useCollection, useMemoFirebase, collection, doc } from "@/firebase";
import { setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, where, getDoc, getDocs, writeBatch, serverTimestamp, Firestore } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { normalizeBranchId, BranchId, useActiveBranch } from "@/lib/branch-helper";
import { provisionAuthUserWithoutSessionSwitch, syncAllAccountsToFirebaseAuth } from "@/lib/auth-service";
import Image from "next/image";

interface KaryawanData {
  id: string;
  nama?: string;
  username?: string;
  password?: string;
  gender?: string;
  team?: string;
  cabang?: string;
  status?: string;
  shift?: string;
  [key: string]: unknown;
}

interface AbsensiLogData {
  id: string;
  karyawanId?: string;
  nama?: string;
  tanggal?: string;
  shift?: string;
  jamMasuk?: string;
  jamPulang?: string;
  selfieUrl?: string;
  selfieMasukUrl?: string;
  selfiePulangUrl?: string;
  cabang?: string;
  cabangName?: string;
  statusManual?: "Hadir" | "Ijin" | "Sakit" | "Alpha" | "Cuti" | "Libur" | "Tugas Luar" | string;
  keterangan?: string;
  timestamp?: unknown;
  isVirtual?: boolean;
  [key: string]: unknown;
}

interface ShiftsConfig {
  pagi: { masuk: string; pulang: string };
  siang: { masuk: string; pulang: string };
}

interface AttendanceEvaluation {
  statusText: string;
  statusBadgeColor: "emerald" | "amber" | "rose" | "indigo" | "slate" | "sky" | "purple";
  lateMinutes: number;
  earlyMinutes: number;
  isLate: boolean;
  isEarly: boolean;
  notes: string;
  shiftLabel: string;
  shiftHours: string;
}

const evaluateAttendance = (
  log: AbsensiLogData,
  shiftsConfig: ShiftsConfig
): AttendanceEvaluation => {
  const isShift2 = log.shift === 'shift2' || log.shift === 'siang';
  const targetShift = isShift2 
    ? (shiftsConfig?.siang || { masuk: "14:00", pulang: "22:00" }) 
    : (shiftsConfig?.pagi || { masuk: "08:00", pulang: "16:00" });
  const shiftLabel = isShift2 ? "Shift 2 (Siang)" : "Shift 1 (Pagi)";
  const shiftHours = `${targetShift.masuk} - ${targetShift.pulang}`;

  // If status is manually set (e.g. Ijin, Sakit, Alpha, Cuti, Libur, Tugas Luar)
  if (log.statusManual) {
    if (log.statusManual === "Ijin") {
      return {
        statusText: "Ijin",
        statusBadgeColor: "sky",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Ijin tidak masuk kerja",
        shiftLabel,
        shiftHours
      };
    }
    if (log.statusManual === "Sakit") {
      return {
        statusText: "Sakit",
        statusBadgeColor: "purple",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Izin sakit / istirahat",
        shiftLabel,
        shiftHours
      };
    }
    if (log.statusManual === "Alpha") {
      return {
        statusText: "Alpha",
        statusBadgeColor: "rose",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Tidak ada catatan absensi (Alpha)",
        shiftLabel,
        shiftHours
      };
    }
    if (log.statusManual === "Cuti") {
      return {
        statusText: "Cuti",
        statusBadgeColor: "indigo",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Cuti kerja terencana",
        shiftLabel,
        shiftHours
      };
    }
    if (log.statusManual === "Libur") {
      return {
        statusText: "Libur",
        statusBadgeColor: "slate",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Jadwal libur karyawan",
        shiftLabel,
        shiftHours
      };
    }
    if (log.statusManual === "Tugas Luar") {
      return {
        statusText: "Tugas Luar",
        statusBadgeColor: "emerald",
        lateMinutes: 0,
        earlyMinutes: 0,
        isLate: false,
        isEarly: false,
        notes: log.keterangan || "Tugas kedinasan / luar toko",
        shiftLabel,
        shiftHours
      };
    }
  }

  if (!log.jamMasuk || log.jamMasuk === "-") {
    return {
      statusText: "Alpha",
      statusBadgeColor: "rose",
      lateMinutes: 0,
      earlyMinutes: 0,
      isLate: false,
      isEarly: false,
      notes: log.keterangan || "Tidak ada catatan jam masuk",
      shiftLabel,
      shiftHours
    };
  }

  const parseTimeToMinutes = (timeStr?: string): number | null => {
    if (!timeStr || timeStr === "-") return null;
    const cleaned = timeStr.trim().replace(/\./g, ":");
    const parts = cleaned.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  const masukMin = parseTimeToMinutes(log.jamMasuk);
  const shiftMasukMin = parseTimeToMinutes(targetShift?.masuk);

  let isLate = false;
  let lateMinutes = 0;
  if (masukMin !== null && shiftMasukMin !== null) {
    if (masukMin > shiftMasukMin) {
      isLate = true;
      lateMinutes = masukMin - shiftMasukMin;
    }
  }

  const pulangMin = parseTimeToMinutes(log.jamPulang);
  const shiftPulangMin = parseTimeToMinutes(targetShift?.pulang);

  let isEarly = false;
  let earlyMinutes = 0;
  if (pulangMin !== null && shiftPulangMin !== null) {
    if (pulangMin < shiftPulangMin) {
      isEarly = true;
      earlyMinutes = shiftPulangMin - pulangMin;
    }
  }

  if (isLate) {
    let note = `Terlambat ${lateMinutes} menit (Jadwal: ${targetShift.masuk})`;
    if (isEarly && log.jamPulang && log.jamPulang !== "-") {
      note += `, Pulang awal ${earlyMinutes} menit (Jadwal: ${targetShift.pulang})`;
    }
    if (log.keterangan) {
      note += ` • ${log.keterangan}`;
    }
    return {
      statusText: `Terlambat (${lateMinutes}m)`,
      statusBadgeColor: "amber",
      lateMinutes,
      earlyMinutes,
      isLate: true,
      isEarly,
      notes: note,
      shiftLabel,
      shiftHours
    };
  }

  if (isEarly && log.jamPulang && log.jamPulang !== "-") {
    let note = `Pulang awal ${earlyMinutes} menit sebelum jam ${targetShift.pulang}`;
    if (log.keterangan) {
      note += ` • ${log.keterangan}`;
    }
    return {
      statusText: `Pulang Awal (${earlyMinutes}m)`,
      statusBadgeColor: "amber",
      lateMinutes: 0,
      earlyMinutes,
      isLate: false,
      isEarly: true,
      notes: note,
      shiftLabel,
      shiftHours
    };
  }

  if (!log.jamPulang || log.jamPulang === "-") {
    let note = "Masuk tepat waktu, belum absen pulang";
    if (log.keterangan) {
      note += ` • ${log.keterangan}`;
    }
    return {
      statusText: "Sedang Bekerja",
      statusBadgeColor: "indigo",
      lateMinutes: 0,
      earlyMinutes: 0,
      isLate: false,
      isEarly: false,
      notes: note,
      shiftLabel,
      shiftHours
    };
  }

  let note = "Kehadiran lengkap & tepat waktu";
  if (log.keterangan) {
    note += ` • ${log.keterangan}`;
  }
  return {
    statusText: "Tepat Waktu",
    statusBadgeColor: "emerald",
    lateMinutes: 0,
    earlyMinutes: 0,
    isLate: false,
    isEarly: false,
    notes: note,
    shiftLabel,
    shiftHours
  };
};

const calculateTotalWorkHours = (jamMasuk?: string, jamPulang?: string): string => {
  if (!jamMasuk || !jamPulang || jamPulang === "-" || jamMasuk === "-") {
    return "-";
  }

  const parseTimeToSeconds = (timeStr: string): number | null => {
    const cleaned = timeStr.trim().replace(/\./g, ":");
    const parts = cleaned.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts.length >= 3 ? parseInt(parts[2], 10) : 0;
    if (isNaN(h) || isNaN(m)) return null;
    return h * 3600 + m * 60 + (isNaN(s) ? 0 : s);
  };

  const startSec = parseTimeToSeconds(jamMasuk);
  const endSec = parseTimeToSeconds(jamPulang);

  if (startSec === null || endSec === null) return "-";

  let diffSec = endSec - startSec;
  if (diffSec < 0) {
    diffSec += 24 * 3600;
  }

  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (hours === 0 && minutes === 0) {
    return "0 Menit";
  }

  if (hours === 0) {
    return `${minutes} Menit`;
  }

  if (minutes === 0) {
    return `${hours} Jam`;
  }

  return `${hours} Jam, ${minutes} Menit`;
};

export default function PengaturanAbsensiPage() {
  const db = useFirestore();
  const activeBranch = useActiveBranch();
  const selectedBranch: BranchId = activeBranch;
  const [activeTab, setActiveTab] = useState("jam-kerja");
  const [syncing, setSyncing] = useState(false);

  // State for Jam Kerja
  const defaultShifts: ShiftsConfig = {
    pagi: { masuk: "08:00", pulang: "16:00" },
    siang: { masuk: "14:00", pulang: "22:00" }
  };
  const [shifts, setShifts] = useState<ShiftsConfig>(defaultShifts);
  const [allBranchShifts, setAllBranchShifts] = useState<Record<string, ShiftsConfig>>({
    gdm: defaultShifts,
    kedungreja: defaultShifts,
    tehwarga: defaultShifts,
    gembong: defaultShifts
  });

  // State for Photo Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
    time: string;
    shiftInfo?: string;
  } | null>(null);

  // State for Lokasi
  const [location, setLocation] = useState({
    lat: "-6.2000",
    lng: "106.8166",
    radius: "50"
  });
  const [cloudinaryConfig, setCloudinaryConfig] = useState({
    cloudinaryCloudName: "",
    cloudinaryUploadPreset: "",
    cloudinaryFolder: "absensi-selfie"
  });

  // State for Scheduling
  const [selectedDate, setSelectedDate] = useState(new Date());
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const monthLabel = selectedDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Fetch Karyawan
  const karyawanQuery = useMemoFirebase(() => query(collection(db, "karyawan"), orderBy("nama", "asc")), [db]);
  const { data: karyawanList } = useCollection(karyawanQuery);

  const karyawanMap = useMemo(() => {
    const map: Record<string, KaryawanData> = {};
    ((karyawanList as KaryawanData[]) || []).forEach(k => {
      if (k.id) map[k.id] = k;
      if (k.username) map[k.username.toLowerCase()] = k;
      if (k.nama) map[k.nama.toLowerCase()] = k;
    });
    return map;
  }, [karyawanList]);

  // Map each attendance log to its real branch (prioritizing employee master data, then log.cabang)
  const getLogBranch = useCallback((log: AbsensiLogData): BranchId => {
    const kId = log.karyawanId ? String(log.karyawanId) : "";
    if (kId && karyawanMap[kId]?.cabang) {
      return normalizeBranchId(karyawanMap[kId].cabang);
    }
    const kNama = log.nama ? String(log.nama).trim().toLowerCase() : "";
    if (kNama && karyawanMap[kNama]?.cabang) {
      return normalizeBranchId(karyawanMap[kNama].cabang);
    }
    if (log.cabang) {
      return normalizeBranchId(log.cabang);
    }
    return "gdm";
  }, [karyawanMap]);

  const filteredKaryawanList = useMemo(() => {
    const all = (karyawanList as KaryawanData[]) || [];
    if (selectedBranch === "all") return all;
    return all.filter((k) => normalizeBranchId(k.cabang) === selectedBranch);
  }, [karyawanList, selectedBranch]);

  // Fetch Schedules
  const monthKey = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}`;
  const schedulesQuery = useMemoFirebase(() => 
    query(collection(db, "shifting_schedules"), where("month", "==", monthKey)), 
    [db, monthKey]
  );
  const { data: schedulesData } = useCollection(schedulesQuery);

  // Fetch Monitoring
  const monitoringQuery = useMemoFirebase(() => query(collection(db, "absensi_logs"), orderBy("timestamp", "desc")), [db]);
  const { data: monitoringData } = useCollection(monitoringQuery);

  // Monitoring Filter States
  const [filterMode, setFilterMode] = useState<"harian" | "bulanan">("harian");
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [selectedMonthStr, setSelectedMonthStr] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });
  const [selectedKaryawanFilter, setSelectedKaryawanFilter] = useState<string>("all");

  // State for Edit / Manual Status Modal
  const [editingLog, setEditingLog] = useState<AbsensiLogData | null>(null);
  const [editStatusManual, setEditStatusManual] = useState<string>("Ijin");
  const [editShift, setEditShift] = useState<string>("shift1");
  const [editJamMasuk, setEditJamMasuk] = useState<string>("");
  const [editJamPulang, setEditJamPulang] = useState<string>("");
  const [editKeterangan, setEditKeterangan] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const filteredMonitoringLogs = useMemo(() => {
    if (!monitoringData) return [];
    const logs = monitoringData as AbsensiLogData[];
    if (selectedBranch === "all") return logs;
    return logs.filter((log) => getLogBranch(log) === selectedBranch);
  }, [monitoringData, selectedBranch, getLogBranch]);

  const displayMonitoringLogs = useMemo(() => {
    if (!filteredMonitoringLogs) return [];

    // Mode 1: Harian (Daily)
    if (filterMode === "harian" && selectedDateStr) {
      const parts = selectedDateStr.split("-");
      if (parts.length !== 3) return [];
      const [year, month, day] = parts;
      const slash1 = `${Number(day)}/${Number(month)}/${year}`;
      const slash2 = `${day}/${month}/${year}`;

      // Get real logs for this date
      const dateLogs = filteredMonitoringLogs.filter((log) => {
        return log.tanggal === slash1 || log.tanggal === slash2;
      });

      // Target employees in the current store
      let targetKaryawan = filteredKaryawanList;
      if (selectedKaryawanFilter !== "all") {
        targetKaryawan = targetKaryawan.filter(k => k.id === selectedKaryawanFilter || k.nama === selectedKaryawanFilter);
      }

      const result: AbsensiLogData[] = [];
      const processedEmpIds = new Set<string>();

      // 1. Add real logs
      dateLogs.forEach(log => {
        if (selectedKaryawanFilter === "all" || log.karyawanId === selectedKaryawanFilter || log.nama === selectedKaryawanFilter) {
          result.push(log);
          if (log.karyawanId) processedEmpIds.add(String(log.karyawanId).toLowerCase());
          if (log.nama) processedEmpIds.add(String(log.nama).trim().toLowerCase());
        }
      });

      // 2. Add Alpha for employees who have not checked in on this date
      targetKaryawan.forEach(k => {
        const kIdLower = (k.id || "").toLowerCase();
        const kNamaLower = (k.nama || "").trim().toLowerCase();
        const isPresent = (kIdLower && processedEmpIds.has(kIdLower)) || (kNamaLower && processedEmpIds.has(kNamaLower));

        if (!isPresent) {
          result.push({
            id: `virtual_alpha_${k.id}_${selectedDateStr}`,
            karyawanId: k.id,
            nama: k.nama,
            cabang: k.cabang || selectedBranch,
            cabangName: k.cabang === "gembong" ? "Zona Gembong" : k.cabang === "kedungreja" ? "Zona Kedungreja" : k.cabang === "tehwarga" ? "Teh Warga GDM" : "Zona Waktu GDM",
            tanggal: slash1,
            jamMasuk: "-",
            jamPulang: "-",
            shift: k.shift || "shift1",
            statusManual: "Alpha",
            keterangan: "Tidak Hadir / Belum Absen",
            isVirtual: true
          });
        }
      });

      return result;
    }

    // Mode 2: Bulanan (Monthly)
    if (filterMode === "bulanan" && selectedMonthStr) {
      const parts = selectedMonthStr.split("-");
      if (parts.length !== 2) return [];
      const [year, month] = parts;
      const targetMonthNum = Number(month);

      let logs = filteredMonitoringLogs.filter(log => {
        if (!log.tanggal) return false;
        const dateParts = log.tanggal.split("/");
        if (dateParts.length !== 3) return false;
        const [, m, y] = dateParts;
        return Number(m) === targetMonthNum && y === year;
      });

      if (selectedKaryawanFilter !== "all") {
        logs = logs.filter(log => log.karyawanId === selectedKaryawanFilter || log.nama === selectedKaryawanFilter);
      }

      return logs;
    }

    // Fallback if no specific filter
    if (selectedKaryawanFilter !== "all") {
      return filteredMonitoringLogs.filter(log => log.karyawanId === selectedKaryawanFilter || log.nama === selectedKaryawanFilter);
    }

    return filteredMonitoringLogs;
  }, [filteredMonitoringLogs, filterMode, selectedDateStr, selectedMonthStr, selectedKaryawanFilter, filteredKaryawanList, selectedBranch]);

  const attendanceStats = useMemo(() => {
    let totalKehadiran = 0;
    let totalTerlambat = 0;
    let totalAlpha = 0;
    let totalIjin = 0;

    displayMonitoringLogs.forEach(log => {
      const logBranch = getLogBranch(log);
      const branchShiftConfig = allBranchShifts[logBranch] || shifts;
      const evalResult = evaluateAttendance(log, branchShiftConfig);

      if (log.statusManual === "Ijin" || log.statusManual === "Sakit" || log.statusManual === "Cuti" || evalResult.statusText === "Ijin" || evalResult.statusText === "Sakit") {
        totalIjin++;
      } else if (log.statusManual === "Alpha" || evalResult.statusText.includes("Alpha")) {
        totalAlpha++;
      } else if (log.statusManual === "Libur") {
        // Libur tidak dihitung pelanggaran
      } else {
        // Hadir
        totalKehadiran++;
        if (evalResult.isLate) {
          totalTerlambat++;
        }
      }
    });

    return {
      totalKehadiran,
      totalTerlambat,
      totalAlpha,
      totalIjin,
      totalSemua: displayMonitoringLogs.length
    };
  }, [displayMonitoringLogs, allBranchShifts, shifts, getLogBranch]);

  const handleOpenEditLog = (log: AbsensiLogData) => {
    setEditingLog(log);
    setEditStatusManual(log.statusManual || (log.jamMasuk && log.jamMasuk !== "-" ? "Hadir" : "Ijin"));
    setEditShift(log.shift || "shift1");
    setEditJamMasuk(log.jamMasuk && log.jamMasuk !== "-" ? log.jamMasuk : "");
    setEditJamPulang(log.jamPulang && log.jamPulang !== "-" ? log.jamPulang : "");
    setEditKeterangan(log.keterangan || "");
  };

  const handleSaveEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    setSavingEdit(true);
    try {
      const branch = getLogBranch(editingLog);
      const branchName = branch === "gembong" ? "Zona Gembong" : branch === "kedungreja" ? "Zona Kedungreja" : branch === "tehwarga" ? "Teh Warga GDM" : "Zona Waktu GDM";
      
      const payload: Record<string, unknown> = {
        karyawanId: editingLog.karyawanId || "",
        nama: editingLog.nama || "",
        cabang: branch,
        cabangName: branchName,
        tanggal: editingLog.tanggal || selectedDateStr.split("-").reverse().join("/"),
        shift: editShift,
        jamMasuk: editJamMasuk.trim() || "-",
        jamPulang: editJamPulang.trim() || "-",
        statusManual: editStatusManual,
        keterangan: editKeterangan.trim(),
        updatedAt: serverTimestamp()
      };

      if (editingLog.isVirtual) {
        // Create new real log document
        await addDoc(collection(db, "absensi_logs"), {
          ...payload,
          timestamp: serverTimestamp()
        });
      } else {
        // Update existing document
        await updateDoc(doc(db, "absensi_logs", editingLog.id), payload);
      }

      alert(`Status absensi untuk ${editingLog.nama} (${editStatusManual}) berhasil disimpan!`);
      setEditingLog(null);
    } catch (err) {
      console.error("Error saving edit log:", err);
      alert("Gagal menyimpan perubahan status absensi.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Load Initial Config based on branch
  useEffect(() => {
    const loadConfig = async () => {
      const branchKey = selectedBranch === "all" ? "gdm" : selectedBranch;
      const configDocName = 
        branchKey === "gembong" ? "absensi_config_gembong" :
        branchKey === "tehwarga" ? "absensi_config_tehwarga" :
        branchKey === "kedungreja" ? "absensi_config_kedungreja" :
        "absensi_config";

      try {
        const docRef = doc(db, "settings", configDocName);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.shifts) {
            setShifts(data.shifts);
            setAllBranchShifts(prev => ({ ...prev, [branchKey]: data.shifts }));
          }
          if (data.location) {
            setLocation(data.location);
          } else if (data.lat && data.lng) {
            setLocation({
              lat: String(data.lat),
              lng: String(data.lng),
              radius: String(data.radius || "50")
            });
          }
          if (data.cloudinaryConfig) setCloudinaryConfig(data.cloudinaryConfig);
        } else {
          // Default initial location coordinate per branch if doc doesn't exist yet
          if (branchKey === "gembong") {
            setLocation({ lat: "-7.4900", lng: "108.8500", radius: "50" });
          } else if (branchKey === "kedungreja") {
            setLocation({ lat: "-7.4851", lng: "108.8312", radius: "50" });
          } else if (branchKey === "tehwarga") {
            setLocation({ lat: "-7.5278", lng: "108.8789", radius: "50" });
          } else {
            setLocation({ lat: "-7.5265", lng: "108.8763", radius: "50" });
          }
        }

        // Fetch shift configs for all branches in parallel for accurate multi-store evaluation
        const branchConfigs = [
          { key: "gdm", docName: "absensi_config" },
          { key: "kedungreja", docName: "absensi_config_kedungreja" },
          { key: "tehwarga", docName: "absensi_config_tehwarga" },
          { key: "gembong", docName: "absensi_config_gembong" }
        ];
        for (const item of branchConfigs) {
          try {
            const bSnap = await getDoc(doc(db, "settings", item.docName));
            if (bSnap.exists() && bSnap.data().shifts) {
              setAllBranchShifts(prev => ({ ...prev, [item.key]: bSnap.data().shifts }));
            }
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error("Error loading absensi branch config:", err);
      }
    };
    loadConfig();
  }, [db, selectedBranch]);

  const handleSaveConfig = async (type: string) => {
    const branchKey = selectedBranch === "all" ? "gdm" : selectedBranch;
    const configDocName = 
      branchKey === "gembong" ? "absensi_config_gembong" :
      branchKey === "tehwarga" ? "absensi_config_tehwarga" :
      branchKey === "kedungreja" ? "absensi_config_kedungreja" :
      "absensi_config";

    const branchLabel = 
      branchKey === "gembong" ? "Zona Gembong (ZW-03)" :
      branchKey === "tehwarga" ? "Teh Warga GDM (TW-01)" :
      branchKey === "kedungreja" ? "Zona Kedungreja (ZW-02)" :
      "Zona Waktu GDM (ZW-01)";

    const configRef = doc(db, "settings", configDocName);
    try {
      if (type === 'jam-kerja') {
        await setDoc(configRef, { shifts, updatedAt: serverTimestamp() }, { merge: true });
        setAllBranchShifts(prev => ({ ...prev, [branchKey]: shifts }));
        if (branchKey === "gdm") {
          await setDoc(doc(db, "settings", "absensi_config_gdm"), { shifts, updatedAt: serverTimestamp() }, { merge: true });
        }
      } else if (type === 'lokasi') {
        // Simpan titik koordinat KHUSUS HANYA untuk toko yang dipilih
        const locationData = {
          location,
          lat: location.lat,
          lng: location.lng,
          radius: location.radius,
          updatedAt: serverTimestamp()
        };
        await setDoc(configRef, locationData, { merge: true });
        if (branchKey === "gdm") {
          await setDoc(doc(db, "settings", "absensi_config_gdm"), locationData, { merge: true });
        }
      } else if (type === 'cloudinary') {
        await setDoc(configRef, { cloudinaryConfig, updatedAt: serverTimestamp() }, { merge: true });
        if (branchKey === "gdm") {
          await setDoc(doc(db, "settings", "absensi_config_gdm"), { cloudinaryConfig, updatedAt: serverTimestamp() }, { merge: true });
        }
      }
      alert(`Konfigurasi untuk ${branchLabel} berhasil disimpan!`);
    } catch (e) {
      console.error(e);
      alert(`Gagal menyimpan konfigurasi untuk ${branchLabel}.`);
    }
  };

  const formRef = useRef<HTMLDivElement>(null);
  const [editingKaryawan, setEditingKaryawan] = useState<KaryawanData | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formGender, setFormGender] = useState("Laki-laki");
  const [prevBranch, setPrevBranch] = useState<BranchId>(selectedBranch);
  const [formCabang, setFormCabang] = useState<"gdm" | "kedungreja" | "tehwarga" | "gembong">(
    (selectedBranch === "all" ? "gdm" : selectedBranch) as "gdm" | "kedungreja" | "tehwarga" | "gembong"
  );

  // Otomatis sinkronkan cabang input karyawan baru saat toko aktif di header switcher berubah
  if (prevBranch !== selectedBranch) {
    setPrevBranch(selectedBranch);
    if (!editingKaryawan) {
      const active = selectedBranch === "all" ? "gdm" : selectedBranch;
      setFormCabang(active as "gdm" | "kedungreja" | "tehwarga" | "gembong");
    }
  }

  // Helper untuk sinkronisasi kredensial ke Firestore untuk SEMUA TOKO (GDM, Kedungreja, Teh Warga)
  // Menjamin seluruh cabang tersinkronisasi bersamaan tanpa saling menghapus kasir/absensi
  const syncCredentialsToFirestore = async (firestoreDb: Firestore) => {
    const snapshot = await getDocs(collection(firestoreDb, "karyawan"));
    const allBranches: ("gdm" | "kedungreja" | "tehwarga" | "gembong")[] = ["gdm", "kedungreja", "tehwarga", "gembong"];
    let totalAll = 0;

    for (const b of allBranches) {
      const branchAbsensiUsers: KaryawanData[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const cleanUsername = String(data.username || "").trim();
        const cleanPassword = String(data.password || "").trim();
        const cleanNama = String(data.nama || cleanUsername).trim();
        const userCabang = normalizeBranchId(data.cabang);

        if (cleanUsername && cleanPassword && userCabang === b) {
          totalAll++;
          branchAbsensiUsers.push({
            id: d.id,
            username: cleanUsername,
            password: cleanPassword,
            nama: cleanNama,
            role: "employee",
            cabang: b,
            gender: data.gender || "Laki-laki",
            status: data.status || "aktif"
          });
        }
      });

      // 1. Simpan absensi murni ke absensi_logins_<b>
      await setDoc(doc(firestoreDb, "employee_credentials", `absensi_logins_${b}`), {
        users: branchAbsensiUsers,
        totalUsers: branchAbsensiUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Ambil system_logins_<b> agar akun kasir/POS cabang ini tidak terhapus
      const sysSnap = await getDoc(doc(firestoreDb, "employee_credentials", `system_logins_${b}`));
      const existingSystemUsers: KaryawanData[] = sysSnap.exists() ? (sysSnap.data().users || []) : [];

      // 3. Merge system kasir + absensi untuk cabang ini
      const mergedMap = new Map<string, KaryawanData>();
      existingSystemUsers.forEach(u => {
        if (u.username) mergedMap.set(u.username.toLowerCase(), { ...u, cabang: b });
      });
      branchAbsensiUsers.forEach(u => {
        if (u.username && !mergedMap.has(u.username.toLowerCase())) {
          mergedMap.set(u.username.toLowerCase(), u);
        }
      });
      const combinedUsers = Array.from(mergedMap.values());

      // 4. Update logins_<b> untuk cabang ini
      await setDoc(doc(firestoreDb, "employee_credentials", `logins_${b}`), {
        users: combinedUsers,
        totalUsers: combinedUsers.length,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (b === "gdm") {
        await setDoc(doc(firestoreDb, "employee_credentials", "logins"), {
          users: combinedUsers,
          totalUsers: combinedUsers.length,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    // Sinkronisasi info ke absensi_config
    await setDoc(doc(firestoreDb, "settings", "absensi_config"), {
      lastGlobalSync: serverTimestamp(),
      totalActiveKaryawan: totalAll
    }, { merge: true });

    return totalAll;
  };

  const handleSaveKaryawan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanNama = formNama.trim();
    const cleanUsername = formUsername.trim();
    const cleanPassword = formPassword.trim();

    if (!cleanNama || !cleanUsername || !cleanPassword) {
      alert("Nama, Username, dan Password wajib diisi!");
      return;
    }

    try {
      const data = {
        nama: cleanNama,
        username: cleanUsername,
        password: cleanPassword,
        gender: formGender,
        cabang: formCabang,
        status: "aktif",
        updatedAt: serverTimestamp()
      };

      if (editingKaryawan) {
        await updateDoc(doc(db, "karyawan", editingKaryawan.id), data);
      } else {
        await addDoc(collection(db, "karyawan"), {
          ...data,
          createdAt: serverTimestamp()
        });
      }

      // Otomatis sinkronisasi kredensial ke SELURUH CABANG
      await syncCredentialsToFirestore(db);

      // Sinkronkan akun ke Firebase Authentication
      try {
        await provisionAuthUserWithoutSessionSwitch(
          cleanUsername,
          cleanPassword,
          { role: "employee", cabang: formCabang, nama: cleanNama }
        );
      } catch (authErr) {
        console.warn("Auth provision warning in absensi settings:", authErr);
      }

      alert(editingKaryawan ? "Data karyawan berhasil diupdate & disinkronkan ke seluruh cabang serta Firebase Auth!" : "Karyawan baru berhasil ditambahkan & disinkronkan ke seluruh cabang serta Firebase Auth!");

      // Reset Form
      setEditingKaryawan(null);
      setFormNama("");
      setFormUsername("");
      setFormPassword("");
      setFormGender("Laki-laki");
      setFormCabang("gdm");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan data karyawan.");
    }
  };

  const handleSyncKaderisasi = async () => {
    setSyncing(true);
    try {
      const snapshot = await getDocs(collection(db, "karyawan"));
      const batch = writeBatch(db);
      
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const cleanUsername = String(data.username || "").trim();
        const cleanPassword = String(data.password || "").trim();
        const cleanNama = String(data.nama || cleanUsername).trim();
        const cleanCabang = normalizeBranchId(data.cabang);

        batch.update(d.ref, { 
          nama: cleanNama,
          username: cleanUsername,
          password: cleanPassword,
          cabang: cleanCabang,
          status: "aktif",
          lastSynced: serverTimestamp() 
        });
      });
      
      await batch.commit();
      
      // Sinkronkan seluruh kredensial logins untuk SEMUA TOKO (GDM, Kedungreja, Teh Warga)
      const totalSynced = await syncCredentialsToFirestore(db);

      // Sinkronkan juga ke Firebase Authentication
      try {
        await syncAllAccountsToFirebaseAuth(db);
      } catch (authSyncErr) {
        console.warn("Auth sync error during kaderisasi sync:", authSyncErr);
      }

      alert(`Sinkronisasi Kaderisasi Berhasil!\n${totalSynced} akun karyawan aktif telah disinkronkan ke Firestore & Firebase Authentication untuk SEMUA TOKO (PC, Mobile Android, dan POS).`);
    } catch (err) {
      console.error("Error syncing kaderisasi:", err);
      alert("Gagal melakukan sinkronisasi kaderisasi.");
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSchedule = async (empId: string, day: number, type: string) => {
    const scheduleId = `${empId}_${monthKey}_${day}`;
    const docRef = doc(db, "shifting_schedules", scheduleId);
    await setDoc(docRef, {
      empId,
      month: monthKey,
      day,
      type, // 'shift1', 'shift2', 'libur'
      updatedAt: serverTimestamp()
    });
  };

  const [processingSchedule, setProcessingSchedule] = useState(false);

  const handleAutoFillSchedules = async () => {
    if (!karyawanList || karyawanList.length === 0) return;
    const confirm = window.confirm("Apakah Anda yakin ingin mengisi otomatis seluruh jadwal bulan ini dengan rotasi shift harian?");
    if (!confirm) return;

    setProcessingSchedule(true);
    try {
      const batch = writeBatch(db);
      
      (filteredKaryawanList as KaryawanData[]).forEach((k, idx) => {
        const startsWithS2 = idx % 2 !== 0;
        for (let day = 1; day <= daysInMonth; day++) {
          const isOddDay = day % 2 !== 0;
          let shiftType = "shift1";
          
          if (startsWithS2) {
            shiftType = isOddDay ? "shift2" : "shift1";
          } else {
            shiftType = isOddDay ? "shift1" : "shift2";
          }

          const scheduleId = `${k.id}_${monthKey}_${day}`;
          const docRef = doc(db, "shifting_schedules", scheduleId);
          batch.set(docRef, {
            empId: k.id,
            month: monthKey,
            day,
            type: shiftType,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      await batch.commit();
      alert("Seluruh jadwal bulan ini berhasil diisi otomatis dengan rotasi harian!");
    } catch (err) {
      console.error(err);
      alert("Gagal mengisi otomatis jadwal.");
    } finally {
      setProcessingSchedule(false);
    }
  };

  const handleClearSchedules = async () => {
    const confirm = window.confirm("Apakah Anda yakin ingin menghapus semua jadwal untuk bulan ini?");
    if (!confirm) return;

    setProcessingSchedule(true);
    try {
      const q = query(collection(db, "shifting_schedules"), where("month", "==", monthKey));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert("Tidak ada jadwal yang perlu dihapus.");
        return;
      }

      const batch = writeBatch(db);
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      alert("Semua jadwal bulan ini berhasil dihapus!");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus jadwal.");
    } finally {
      setProcessingSchedule(false);
    }
  };

  const getScheduleType = (empId: string, day: number) => {
    const found = schedulesData?.find(s => s.empId === empId && s.day === day);
    return found?.type || "libur";
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
    setSelectedDate(newDate);
  };

  const renderBranchBadge = (log: AbsensiLogData) => {
    const branch = getLogBranch(log);
    if (branch === "gembong") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-[7.5px] font-bold uppercase whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          Gembong
        </span>
      );
    }
    if (branch === "kedungreja") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-50 text-cyan-700 border border-cyan-200 text-[7.5px] font-bold uppercase whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          Kedungreja
        </span>
      );
    }
    if (branch === "tehwarga") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[7.5px] font-bold uppercase whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Teh Warga
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[7.5px] font-bold uppercase whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Zona GDM
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic">Pengaturan Absensi</h1>
        <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Sistem Kehadiran Zona Waktu</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full h-auto rounded-2xl sm:rounded-[1.5rem] bg-white shadow-sm p-1.5 sm:p-2 mb-8 gap-1.5 sm:gap-2">
          <TabsTrigger value="jam-kerja" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Jam Kerja</span>
          </TabsTrigger>
          <TabsTrigger value="lokasi" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Lokasi</span>
          </TabsTrigger>
          <TabsTrigger value="cloudinary" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Cloudinary</span>
          </TabsTrigger>
          <TabsTrigger value="karyawan" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Karyawan</span>
          </TabsTrigger>
          <TabsTrigger value="penjadwalan" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Penjadwalan</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="rounded-xl font-black uppercase text-[8px] sm:text-[9px] md:text-[10px] tracking-wider sm:tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all py-2.5 sm:py-3 px-1 sm:px-4 flex items-center justify-center text-center">
            <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 hidden sm:inline shrink-0" />
            <span className="truncate">Monitoring</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jam-kerja" className="space-y-6">
          <Card className="rounded-2xl sm:rounded-[2.5rem] border-none shadow-sm p-4 sm:p-8 md:p-10 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-8 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight">Kelola Shifting</h3>
                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Pengaturan jam kerja khusus toko aktif</p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 text-[9px] font-black uppercase tracking-wider w-fit">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  selectedBranch === "gembong" ? "bg-violet-500" :
                  selectedBranch === "kedungreja" ? "bg-cyan-500" :
                  selectedBranch === "tehwarga" ? "bg-amber-500" :
                  "bg-emerald-500"
                )} />
                <span>Toko: {
                  selectedBranch === "gembong" ? "Zona Gembong (ZW-03)" :
                  selectedBranch === "kedungreja" ? "Zona Kedungreja (ZW-02)" :
                  selectedBranch === "tehwarga" ? "Teh Warga GDM (TW-01)" :
                  "Zona Waktu GDM (ZW-01)"
                }</span>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 sm:gap-8">
              <div className="bg-slate-50 p-4 sm:p-8 rounded-xl sm:rounded-[2rem] border border-slate-100 space-y-3 sm:space-y-4">
                <p className="font-black text-primary uppercase text-[10px] sm:text-xs tracking-widest">Shift 1 (Pagi)</p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-[9px] sm:text-[10px] font-black uppercase">Jam Masuk</Label>
                    <Input type="time" value={shifts.pagi.masuk} onChange={(e) => setShifts({...shifts, pagi: {...shifts.pagi, masuk: e.target.value}})} className="rounded-xl bg-white h-9 sm:h-10 text-xs font-bold" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-[9px] sm:text-[10px] font-black uppercase">Jam Pulang</Label>
                    <Input type="time" value={shifts.pagi.pulang} onChange={(e) => setShifts({...shifts, pagi: {...shifts.pagi, pulang: e.target.value}})} className="rounded-xl bg-white h-9 sm:h-10 text-xs font-bold" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-4 sm:p-8 rounded-xl sm:rounded-[2rem] border border-slate-100 space-y-3 sm:space-y-4">
                <p className="font-black text-primary uppercase text-[10px] sm:text-xs tracking-widest">Shift 2 (Siang)</p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-[9px] sm:text-[10px] font-black uppercase">Jam Masuk</Label>
                    <Input type="time" value={shifts.siang.masuk} onChange={(e) => setShifts({...shifts, siang: {...shifts.siang, masuk: e.target.value}})} className="rounded-xl bg-white h-9 sm:h-10 text-xs font-bold" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-[9px] sm:text-[10px] font-black uppercase">Jam Pulang</Label>
                    <Input type="time" value={shifts.siang.pulang} onChange={(e) => setShifts({...shifts, siang: {...shifts.siang, pulang: e.target.value}})} className="rounded-xl bg-white h-9 sm:h-10 text-xs font-bold" />
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => handleSaveConfig('jam-kerja')} className="mt-6 sm:mt-8 rounded-xl sm:rounded-2xl bg-primary px-6 sm:px-8 font-black uppercase tracking-wider sm:tracking-widest text-[9px] sm:text-[10px] h-10 sm:h-12 shadow-lg sm:shadow-xl shadow-primary/20">
              Simpan Konfigurasi Jam
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="lokasi" className="space-y-6">
          <Card className="rounded-2xl sm:rounded-[2.5rem] border-none shadow-sm p-4 sm:p-8 md:p-10 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-8 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight">Titik Koordinat Toko</h3>
                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Koordinat geofencing tersimpan terpisah untuk setiap toko</p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 text-[9px] font-black uppercase tracking-wider w-fit">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  selectedBranch === "gembong" ? "bg-violet-500" :
                  selectedBranch === "kedungreja" ? "bg-cyan-500" :
                  selectedBranch === "tehwarga" ? "bg-amber-500" :
                  "bg-emerald-500"
                )} />
                <span>Toko: {
                  selectedBranch === "gembong" ? "Zona Gembong (ZW-03)" :
                  selectedBranch === "kedungreja" ? "Zona Kedungreja (ZW-02)" :
                  selectedBranch === "tehwarga" ? "Teh Warga GDM (TW-01)" :
                  "Zona Waktu GDM (ZW-01)"
                }</span>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[9px] sm:text-[10px] font-black uppercase">Latitude</Label>
                <Input value={location.lat} onChange={(e) => setLocation({...location, lat: e.target.value})} placeholder="-6.xxx" className="rounded-xl h-9 sm:h-10 text-xs font-bold" />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[9px] sm:text-[10px] font-black uppercase">Longitude</Label>
                <Input value={location.lng} onChange={(e) => setLocation({...location, lng: e.target.value})} placeholder="106.xxx" className="rounded-xl h-9 sm:h-10 text-xs font-bold" />
              </div>
              <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 md:col-span-1">
                <Label className="text-[9px] sm:text-[10px] font-black uppercase">Radius (Meter)</Label>
                <Input value={location.radius} onChange={(e) => setLocation({...location, radius: e.target.value})} placeholder="50" className="rounded-xl h-9 sm:h-10 text-xs font-bold" />
              </div>
            </div>
            <Button onClick={() => handleSaveConfig('lokasi')} className="mt-6 sm:mt-8 rounded-xl sm:rounded-2xl bg-primary px-6 sm:px-8 font-black uppercase tracking-wider sm:tracking-widest text-[9px] sm:text-[10px] h-10 sm:h-12 shadow-lg sm:shadow-xl shadow-primary/20">
              Simpan Lokasi Toko
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="cloudinary" className="space-y-6">
          <Card className="rounded-2xl sm:rounded-[2.5rem] border-none shadow-sm p-4 sm:p-8 md:p-10 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-8 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight">Konfigurasi Upload Selfie</h3>
                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Penyimpanan selfie absensi toko aktif</p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 text-[9px] font-black uppercase tracking-wider w-fit">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  selectedBranch === "gembong" ? "bg-violet-500" :
                  selectedBranch === "kedungreja" ? "bg-cyan-500" :
                  selectedBranch === "tehwarga" ? "bg-amber-500" :
                  "bg-emerald-500"
                )} />
                <span>Toko: {
                  selectedBranch === "gembong" ? "Zona Gembong (ZW-03)" :
                  selectedBranch === "kedungreja" ? "Zona Kedungreja (ZW-02)" :
                  selectedBranch === "tehwarga" ? "Teh Warga GDM (TW-01)" :
                  "Zona Waktu GDM (ZW-01)"
                }</span>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[9px] sm:text-[10px] font-black uppercase">Cloud Name</Label>
                <Input value={cloudinaryConfig.cloudinaryCloudName} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryCloudName: e.target.value})} className="rounded-xl h-9 sm:h-10 text-xs font-bold" placeholder="cloudinary-name" />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[9px] sm:text-[10px] font-black uppercase">Upload Preset</Label>
                <Input value={cloudinaryConfig.cloudinaryUploadPreset} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryUploadPreset: e.target.value})} className="rounded-xl h-9 sm:h-10 text-xs font-bold" placeholder="unsigned_preset" />
              </div>
            </div>
            <div className="mt-4 sm:mt-6 space-y-1.5 sm:space-y-2">
              <Label className="text-[9px] sm:text-[10px] font-black uppercase">Folder</Label>
              <Input value={cloudinaryConfig.cloudinaryFolder} onChange={(e) => setCloudinaryConfig({...cloudinaryConfig, cloudinaryFolder: e.target.value})} className="rounded-xl h-9 sm:h-10 text-xs font-bold" placeholder="absensi-selfie" />
            </div>
            <Button onClick={() => handleSaveConfig('cloudinary')} className="mt-6 sm:mt-8 rounded-xl sm:rounded-2xl bg-primary px-6 sm:px-8 font-black uppercase tracking-wider sm:tracking-widest text-[9px] sm:text-[10px] h-10 sm:h-12 shadow-lg sm:shadow-xl shadow-primary/20">
              Simpan Konfigurasi Cloudinary
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="karyawan" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-8">
            <Card ref={formRef} className="rounded-[2.5rem] border-none shadow-sm p-8 bg-white h-fit">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase italic tracking-tight">
                  {editingKaryawan ? "Edit Karyawan" : "Tambah Karyawan"}
                </h3>
                {editingKaryawan && (
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setEditingKaryawan(null);
                      setFormNama("");
                      setFormUsername("");
                      setFormPassword("");
                      setFormGender("Laki-laki");
                      setFormCabang("gdm");
                    }}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 h-8 px-3 rounded-xl border border-slate-100"
                  >
                    Batal
                  </Button>
                )}
              </div>
              <form onSubmit={handleSaveKaryawan} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase">Nama Lengkap</Label>
                  <Input 
                    value={formNama} 
                    onChange={(e) => setFormNama(e.target.value)} 
                    required 
                    className="rounded-xl h-11" 
                    placeholder="Nama sesuai KTP..." 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Username</Label>
                    <Input 
                      value={formUsername} 
                      onChange={(e) => setFormUsername(e.target.value)} 
                      required 
                      className="rounded-xl h-11" 
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Password</Label>
                    <Input 
                      value={formPassword} 
                      onChange={(e) => setFormPassword(e.target.value)} 
                      type="password" 
                      required 
                      className="rounded-xl h-11" 
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Cabang Penempatan</Label>
                    <select 
                      value={formCabang} 
                      onChange={(e) => setFormCabang(e.target.value as "gdm" | "kedungreja" | "tehwarga" | "gembong")} 
                      required 
                      className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus-visible:outline-none"
                    >
                      <option value="gdm">ZW Gandrungmangu</option>
                      <option value="kedungreja">ZW Kedungreja</option>
                      <option value="tehwarga">Teh Warga GDM</option>
                      <option value="gembong">ZW Gembong</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase">Jenis Kelamin</Label>
                    <select 
                      value={formGender} 
                      onChange={(e) => setFormGender(e.target.value)} 
                      required 
                      className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold focus-visible:outline-none"
                    >
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] h-12 shadow-xl mt-4">
                  {editingKaryawan ? "Update Rincian" : "Simpan Karyawan"}
                </Button>
              </form>
            </Card>

            <Card className="lg:col-span-2 rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-black uppercase italic tracking-tight">Database Karyawan</h3>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-black uppercase tracking-wider">
                      <span className={cn(
                        "h-2 w-2 rounded-full",
                        selectedBranch === "gembong" ? "bg-violet-500" :
                        selectedBranch === "kedungreja" ? "bg-cyan-500" :
                        selectedBranch === "tehwarga" ? "bg-amber-500" :
                        selectedBranch === "all" ? "bg-indigo-500" :
                        "bg-emerald-500"
                      )} />
                      <span>
                        {selectedBranch === "all" 
                          ? "Semua Outlet" 
                          : selectedBranch === "gembong"
                          ? "ZW Gembong (ZW-03)"
                          : selectedBranch === "kedungreja" 
                          ? "ZW Kedungreja (ZW-02)" 
                          : selectedBranch === "tehwarga" 
                          ? "Teh Warga GDM (TW-01)" 
                          : "ZW Gandrungmangu (ZW-01)"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    {filteredKaryawanList.length} Karyawan Terdaftar di {selectedBranch === "all" ? "Semua Outlet" : selectedBranch === "gembong" ? "Zona Gembong" : selectedBranch === "kedungreja" ? "Zona Kedungreja" : selectedBranch === "tehwarga" ? "Teh Warga GDM" : "Zona Gandrungmangu"}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    disabled={syncing}
                    onClick={handleSyncKaderisasi}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest text-primary gap-2 h-9 px-3 rounded-xl border border-primary/20 hover:bg-primary/5 shadow-xs",
                      syncing && "opacity-50"
                    )}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} /> 
                    {syncing ? "Sinkron..." : "Sinkron Kaderisasi"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-8 py-4 text-[9px] font-black uppercase text-slate-500">Nama</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Cabang</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Username</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500">Detail</th>
                      <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredKaryawanList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-10 text-center">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Belum ada karyawan terdaftar di {selectedBranch === "all" ? "semua outlet" : selectedBranch === "kedungreja" ? "Zona Kedungreja" : selectedBranch === "tehwarga" ? "Teh Warga GDM" : "Zona Gandrungmangu"}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredKaryawanList.map((k: KaryawanData) => (
                      <tr key={k.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-900">{k.nama}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-[7px] font-black uppercase px-2 py-0.5 rounded-full",
                              k.status === 'aktif' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                            )}>
                              {k.status || "Baru"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[9px] font-black uppercase px-2.5 py-1 rounded-lg",
                            (k.cabang === "gembong")
                              ? "bg-violet-50 text-violet-700 border border-violet-200"
                              : (k.cabang === "kedungreja") 
                              ? "bg-cyan-50 text-cyan-700 border border-cyan-200" 
                              : (k.cabang === "tehwarga")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          )}>
                            {k.cabang === "gembong" ? "ZW Gembong" : k.cabang === "kedungreja" ? "ZW Kedungreja" : k.cabang === "tehwarga" ? "Teh Warga" : "ZW Gandrungmangu"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-500">{k.username}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5 w-fit">
                              {k.gender || "Laki-laki"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                setEditingKaryawan(k);
                                setFormNama(k.nama || "");
                                setFormUsername(k.username || "");
                                setFormPassword(k.password || "");
                                setFormGender(k.gender || "Laki-laki");
                                const branchValue = normalizeBranchId(k.cabang);
                                setFormCabang(branchValue === "all" ? "gdm" : branchValue);
                                setTimeout(() => {
                                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 50);
                              }} 
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={async () => {
                                if (window.confirm(`Hapus karyawan ${k.nama}?`)) {
                                  await deleteDoc(doc(db, "karyawan", k.id));
                                  await syncCredentialsToFirestore(db);
                                  alert(`Data karyawan ${k.nama} berhasil dihapus & kredensial seluruh toko tersinkronisasi.`);
                                }
                              }} 
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="penjadwalan" className="space-y-6">
          <Card className="rounded-2xl sm:rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <div>
                <h3 className="text-base sm:text-xl font-black uppercase italic tracking-tight">Penjadwalan Karyawan</h3>
                <p className="text-[8.5px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Atur Shift Harian Zona Waktu</p>
              </div>
              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
                <div className="flex gap-1.5 w-full xs:w-auto sm:w-auto">
                  <Button 
                    onClick={handleAutoFillSchedules}
                    disabled={processingSchedule || !karyawanList || karyawanList.length === 0}
                    className="rounded-xl bg-slate-900 text-white font-black uppercase tracking-wider text-[8px] sm:text-[9px] h-8 sm:h-9 px-3 shadow-sm flex-1 sm:flex-none"
                  >
                    Isi Otomatis
                  </Button>
                  <Button 
                    onClick={handleClearSchedules}
                    disabled={processingSchedule}
                    variant="ghost"
                    className="rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-black uppercase tracking-wider text-[8px] sm:text-[9px] h-8 sm:h-9 px-3 flex-1 sm:flex-none"
                  >
                    Hapus Semua
                  </Button>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="rounded-lg h-7 w-7 sm:h-8 sm:w-8">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[9px] sm:text-xs font-black uppercase tracking-wider px-2 text-center">{monthLabel}</span>
                  <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="rounded-lg h-7 w-7 sm:h-8 sm:w-8">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[700px] sm:min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="sticky left-0 bg-slate-50 z-20 px-2.5 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase text-slate-500 min-w-[100px] sm:min-w-[160px] border-r border-slate-100">
                      Nama Karyawan
                    </th>
                    {Array.from({ length: daysInMonth }).map((_, i) => (
                      <th key={i} className="px-1 sm:px-2 py-2 sm:py-3 text-center text-[7.5px] sm:text-[9px] font-black uppercase text-slate-500 border-r border-slate-100 min-w-[26px] sm:min-w-[34px]">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredKaryawanList.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 1} className="px-4 py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Belum ada data karyawan terdaftar di {selectedBranch === "all" ? "semua outlet" : selectedBranch === "kedungreja" ? "Zona Kedungreja" : selectedBranch === "tehwarga" ? "Teh Warga GDM" : "Zona Gandrungmangu"}.
                      </td>
                    </tr>
                  ) : (
                    filteredKaryawanList.map((k: KaryawanData) => (
                      <tr key={k.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="sticky left-0 bg-white z-10 px-2.5 sm:px-4 py-1.5 sm:py-2 border-r border-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <p className="text-[9.5px] sm:text-xs font-black text-slate-900 uppercase truncate max-w-[95px] sm:max-w-[160px]">{k.nama}</p>
                        </td>
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const type = getScheduleType(k.id, day);
                          return (
                            <td key={i} className="px-0.5 sm:px-1 py-1 sm:py-1.5 text-center border-r border-slate-100">
                              <select 
                                value={type}
                                onChange={(e) => handleUpdateSchedule(k.id, day, e.target.value)}
                                className={cn(
                                  "w-6 h-6 sm:w-7 sm:h-7 rounded-md text-[7.5px] sm:text-[8.5px] font-black appearance-none text-center cursor-pointer transition-all outline-none",
                                  type === 'shift1' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                                  type === 'shift2' ? "bg-indigo-100 text-indigo-700 border border-indigo-200" :
                                  "bg-slate-100 text-slate-400 border border-slate-200"
                                )}
                              >
                                <option value="shift1">S1</option>
                                <option value="shift2">S2</option>
                                <option value="libur">L</option>
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 sm:mt-6 flex flex-wrap gap-2 sm:gap-4 px-3 py-2.5 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100">
               <div className="flex items-center gap-1.5">
                 <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-md bg-amber-100 border border-amber-200" />
                 <span className="text-[7.5px] sm:text-[9px] font-black uppercase text-slate-500">S1: Shift 1 ({shifts.pagi.masuk}-{shifts.pagi.pulang})</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-md bg-indigo-100 border border-indigo-200" />
                 <span className="text-[7.5px] sm:text-[9px] font-black uppercase text-slate-500">S2: Shift 2 ({shifts.siang.masuk}-{shifts.siang.pulang})</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-md bg-slate-100 border border-slate-200" />
                 <span className="text-[7.5px] sm:text-[9px] font-black uppercase text-slate-500">L: Libur</span>
               </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4 sm:space-y-5">
          {/* Summary / KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Total Kehadiran */}
            <Card className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-emerald-50/70 border border-emerald-100 shadow-none flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider text-emerald-800 truncate">Total Hadir</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base sm:text-lg font-black text-emerald-950 tabular-nums">
                    {attendanceStats.totalKehadiran}
                  </span>
                  <span className="text-[7.5px] sm:text-[8px] font-bold text-emerald-600 uppercase">Org</span>
                </div>
              </div>
            </Card>

            {/* Total Terlambat */}
            <Card className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-amber-50/70 border border-amber-100 shadow-none flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
                <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider text-amber-800 truncate">Terlambat</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base sm:text-lg font-black text-amber-950 tabular-nums">
                    {attendanceStats.totalTerlambat}
                  </span>
                  <span className="text-[7.5px] sm:text-[8px] font-bold text-amber-600 uppercase">Org</span>
                </div>
              </div>
            </Card>

            {/* Total Alpha */}
            <Card className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-rose-50/70 border border-rose-100 shadow-none flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/20">
                <XCircle className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider text-rose-800 truncate">Total Alpha</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base sm:text-lg font-black text-rose-950 tabular-nums">
                    {attendanceStats.totalAlpha}
                  </span>
                  <span className="text-[7.5px] sm:text-[8px] font-bold text-rose-600 uppercase">Org</span>
                </div>
              </div>
            </Card>

            {/* Total Ijin / Sakit */}
            <Card className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 bg-sky-50/70 border border-sky-100 shadow-none flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-sky-500/20">
                <FileText className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider text-sky-800 truncate">Total Ijin</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base sm:text-lg font-black text-sky-950 tabular-nums">
                    {attendanceStats.totalIjin}
                  </span>
                  <span className="text-[7.5px] sm:text-[8px] font-bold text-sky-600 uppercase">Org</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className="rounded-2xl sm:rounded-3xl border-none shadow-sm bg-white overflow-hidden p-3.5 sm:p-5">
            {/* Header & Comprehensive Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4 mb-3 sm:mb-5 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black uppercase italic tracking-tight">Monitoring Absensi</h3>
                  {selectedBranch !== "all" && (
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider",
                      selectedBranch === "gembong" ? "bg-violet-50 text-violet-700 border border-violet-200" :
                      selectedBranch === "gdm" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                      selectedBranch === "kedungreja" ? "bg-cyan-50 text-cyan-700 border border-cyan-200" :
                      "bg-amber-50 text-amber-700 border border-amber-200"
                    )}>
                      {selectedBranch === "gembong" ? "Zona Gembong" : selectedBranch === "gdm" ? "Zona Waktu GDM" : selectedBranch === "kedungreja" ? "Zona Kedungreja" : "Teh Warga GDM"}
                    </span>
                  )}
                </div>
                <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {filterMode === "harian"
                    ? `Periode: ${selectedDateStr.split("-").reverse().join("/")} • ${displayMonitoringLogs.length} Karyawan`
                    : `Periode: ${selectedMonthStr} • ${displayMonitoringLogs.length} Data`
                  }
                </p>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-50 p-1.5 sm:p-2 rounded-xl border border-slate-100">
                {/* Mode Selector */}
                <div className="flex bg-white rounded-lg p-0.5 border border-slate-200 shadow-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterMode("harian")}
                    className={cn(
                      "px-2 py-1 rounded-md text-[8.5px] font-black uppercase transition-all",
                      filterMode === "harian" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    Harian
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode("bulanan")}
                    className={cn(
                      "px-2 py-1 rounded-md text-[8.5px] font-black uppercase transition-all",
                      filterMode === "bulanan" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    Bulanan
                  </button>
                </div>

                {/* Date / Month Picker */}
                {filterMode === "harian" ? (
                  <Input 
                    type="date" 
                    value={selectedDateStr} 
                    onChange={(e) => setSelectedDateStr(e.target.value)} 
                    className="bg-white border border-slate-200 text-[10px] font-black rounded-lg h-7 sm:h-8 px-2 w-32 sm:w-34 text-slate-700 shadow-sm" 
                  />
                ) : (
                  <Input 
                    type="month" 
                    value={selectedMonthStr} 
                    onChange={(e) => setSelectedMonthStr(e.target.value)} 
                    className="bg-white border border-slate-200 text-[10px] font-black rounded-lg h-7 sm:h-8 px-2 w-32 sm:w-34 text-slate-700 shadow-sm" 
                  />
                )}

                {/* Dropdown Karyawan */}
                <select
                  value={selectedKaryawanFilter}
                  onChange={(e) => setSelectedKaryawanFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-[8.5px] sm:text-[9px] font-black rounded-lg h-7 sm:h-8 px-2 text-slate-700 shadow-sm outline-none cursor-pointer max-w-[130px] sm:max-w-[160px] truncate"
                >
                  <option value="all">Semua Karyawan ({filteredKaryawanList.length})</option>
                  {filteredKaryawanList.map(k => (
                    <option key={k.id} value={k.id}>{k.nama}</option>
                  ))}
                </select>

                {/* Reset Button */}
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    setSelectedDateStr(`${yyyy}-${mm}-${dd}`);
                    setSelectedMonthStr(`${yyyy}-${mm}`);
                    setSelectedKaryawanFilter("all");
                    setFilterMode("harian");
                  }}
                  title="Reset Filter"
                  className="h-7 sm:h-8 px-2 text-[8px] font-black uppercase text-slate-400 hover:text-slate-600 rounded-lg bg-white shadow-sm border border-slate-100"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Mobile View: Cards */}
            <div className="block md:hidden space-y-3">
              <div className="flex items-center justify-between text-[8.5px] font-black text-slate-400 uppercase tracking-wider px-1">
                <span>Daftar Kehadiran</span>
                <span>{displayMonitoringLogs.length} Karyawan</span>
              </div>
              {displayMonitoringLogs.length > 0 ? (
                displayMonitoringLogs.map((log: AbsensiLogData) => {
                  const logBranch = getLogBranch(log);
                  const branchShiftConfig = allBranchShifts[logBranch] || shifts;
                  const evalResult = evaluateAttendance(log, branchShiftConfig);
                  const fotoBerangkat = log.selfieMasukUrl || log.selfieUrl;
                  const fotoPulang = log.selfiePulangUrl;

                  return (
                    <Card key={log.id} className="p-3 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col gap-2.5">
                      {/* Header info */}
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-xs text-slate-900 uppercase truncate">{log.nama}</h4>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {renderBranchBadge(log)}
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[7.5px] font-bold shrink-0">{log.tanggal}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-wider border",
                            evalResult.statusBadgeColor === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            evalResult.statusBadgeColor === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            evalResult.statusBadgeColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                            evalResult.statusBadgeColor === "sky" ? "bg-sky-50 text-sky-700 border-sky-200" :
                            evalResult.statusBadgeColor === "purple" ? "bg-purple-50 text-purple-700 border-purple-200" :
                            evalResult.statusBadgeColor === "slate" ? "bg-slate-100 text-slate-700 border-slate-200" :
                            "bg-rose-50 text-rose-700 border-rose-200"
                          )}>
                            {evalResult.statusText}
                          </span>
                          <span className="text-[7.5px] font-bold text-slate-400 uppercase">
                            {evalResult.shiftLabel} ({evalResult.shiftHours})
                          </span>
                        </div>
                      </div>

                      {/* Foto Berangkat & Foto Pulang 2-Column Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Foto Berangkat */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[7.5px] font-black uppercase text-slate-500">
                            <span>Berangkat</span>
                            <span className="text-emerald-600 font-bold tabular-nums">{log.jamMasuk || "-"}</span>
                          </div>
                          {fotoBerangkat ? (
                            <button 
                              type="button"
                              onClick={() => setPreviewPhoto({
                                url: fotoBerangkat as string,
                                title: `${log.nama} - Foto Berangkat`,
                                subtitle: `${log.tanggal} • ${evalResult.shiftLabel}`,
                                time: `Jam Masuk: ${log.jamMasuk || "-"}`,
                                shiftInfo: `Jadwal Shift: ${evalResult.shiftHours}`
                              })}
                              className="group relative w-full h-22 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 block transition-transform active:scale-95 text-left"
                            >
                              <Image src={fotoBerangkat as string} alt="Foto Berangkat" fill className="object-cover" unoptimized />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-[7.5px] font-black uppercase">
                                <Eye className="h-3 w-3" /> Lihat
                              </div>
                              <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white px-1 py-0.2 rounded text-[6.5px] font-black">
                                Masuk
                              </div>
                            </button>
                          ) : (
                            <div className="w-full h-22 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center p-1.5">
                              <Camera className="h-4 w-4 text-slate-300 mb-0.5" />
                              <span className="text-[7px] font-bold uppercase text-slate-400">Tidak Ada</span>
                            </div>
                          )}
                        </div>

                        {/* Foto Pulang */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[7.5px] font-black uppercase text-slate-500">
                            <span>Pulang</span>
                            <span className="text-rose-600 font-bold tabular-nums">{log.jamPulang || "-"}</span>
                          </div>
                          {fotoPulang ? (
                            <button 
                              type="button"
                              onClick={() => setPreviewPhoto({
                                url: fotoPulang as string,
                                title: `${log.nama} - Foto Pulang`,
                                subtitle: `${log.tanggal} • ${evalResult.shiftLabel}`,
                                time: `Jam Pulang: ${log.jamPulang || "-"}`,
                                shiftInfo: `Jadwal Shift: ${evalResult.shiftHours}`
                              })}
                              className="group relative w-full h-22 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 block transition-transform active:scale-95 text-left"
                            >
                              <Image src={fotoPulang as string} alt="Foto Pulang" fill className="object-cover" unoptimized />
                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-[7.5px] font-black uppercase">
                                <Eye className="h-3 w-3" /> Lihat
                              </div>
                              <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white px-1 py-0.2 rounded text-[6.5px] font-black">
                                Pulang
                              </div>
                            </button>
                          ) : (
                            <div className="w-full h-22 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center p-1.5">
                              <Clock className="h-4 w-4 text-slate-300 mb-0.5" />
                              <span className="text-[7px] font-bold uppercase text-slate-400">
                                {log.jamMasuk && log.jamMasuk !== "-" ? "Belum Pulang" : "Tidak Ada"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timing & Summary */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100 text-center">
                        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider">Masuk</p>
                          <p className={cn("text-[11px] font-black tabular-nums", evalResult.isLate ? "text-amber-600" : "text-emerald-600")}>
                            {log.jamMasuk || "-"}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider">Pulang</p>
                          <p className={cn("text-[11px] font-black tabular-nums", evalResult.isEarly ? "text-amber-600" : "text-rose-600")}>
                            {log.jamPulang || "-"}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider">Durasi</p>
                          <p className="text-[9.5px] font-black text-indigo-600 tabular-nums truncate">
                            {calculateTotalWorkHours(log.jamMasuk, log.jamPulang)}
                          </p>
                        </div>
                      </div>

                      {/* Keterangan & Action Edit Button */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="bg-slate-50 px-2 py-1 rounded-lg flex items-center gap-1 text-[7.5px] font-medium text-slate-600 flex-1 min-w-0 border border-slate-100">
                          <Info className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                          <span className="truncate">{evalResult.notes}</span>
                        </div>
                        <Button
                          type="button"
                          onClick={() => handleOpenEditLog(log)}
                          size="sm"
                          className="h-7 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold uppercase text-[7.5px] tracking-wider shrink-0 flex items-center gap-1"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          Edit
                        </Button>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 text-[10px] font-black uppercase border border-dashed rounded-2xl p-4">
                  Tidak ada data absensi untuk filter toko & tanggal ini.
                </div>
              )}
            </div>
            
            {/* Desktop View: Full History Table */}
            <div className="hidden md:block rounded-2xl border border-slate-100 overflow-hidden bg-white">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-3 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Nama</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Toko</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Tanggal</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Shift</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Masuk</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Pulang</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Total Jam</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500 text-center">Foto Masuk</th>
                      <th className="px-2 py-2.5 text-[8.5px] font-black uppercase text-slate-500 text-center">Foto Pulang</th>
                      <th className="px-2.5 py-2.5 text-[8.5px] font-black uppercase text-slate-500">Status & Keterangan</th>
                      <th className="px-2.5 py-2.5 text-[8.5px] font-black uppercase text-slate-500 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayMonitoringLogs.length > 0 ? displayMonitoringLogs.map((log: AbsensiLogData) => {
                      const logBranch = getLogBranch(log);
                      const branchShiftConfig = allBranchShifts[logBranch] || shifts;
                      const evalResult = evaluateAttendance(log, branchShiftConfig);
                      const fotoBerangkat = log.selfieMasukUrl || log.selfieUrl;
                      const fotoPulang = log.selfiePulangUrl;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <p className="font-extrabold text-[11px] text-slate-900 uppercase leading-tight">{log.nama}</p>
                            <p className="text-[7.5px] font-bold text-slate-400 uppercase">{evalResult.shiftLabel}</p>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {renderBranchBadge(log)}
                          </td>
                          <td className="px-2 py-2 text-[10px] font-bold text-slate-700 tabular-nums whitespace-nowrap">{log.tanggal}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-bold text-slate-600 border border-slate-200/60 tabular-nums">
                              {evalResult.shiftHours}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-[11px] font-black tabular-nums whitespace-nowrap">
                            <span className={cn(evalResult.isLate ? "text-amber-600" : log.jamMasuk !== "-" ? "text-emerald-600" : "text-slate-300")}>
                              {log.jamMasuk || "-"}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-[11px] font-black tabular-nums whitespace-nowrap">
                            <span className={cn(evalResult.isEarly ? "text-amber-600" : log.jamPulang !== "-" ? "text-rose-600" : "text-slate-300")}>
                              {log.jamPulang || "-"}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {log.jamPulang && log.jamPulang !== "-" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[9px] tabular-nums">
                                <Clock className="h-2.5 w-2.5 text-indigo-500" />
                                {calculateTotalWorkHours(log.jamMasuk, log.jamPulang)}
                              </span>
                            ) : log.jamMasuk && log.jamMasuk !== "-" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[8px] font-bold">
                                <Clock className="h-2.5 w-2.5 text-amber-500 animate-spin" />
                                Sedang Kerja
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-300">-</span>
                            )}
                          </td>
                          {/* Foto Berangkat */}
                          <td className="px-2 py-2 text-center whitespace-nowrap">
                            {fotoBerangkat ? (
                              <button
                                type="button"
                                onClick={() => setPreviewPhoto({
                                  url: fotoBerangkat as string,
                                  title: `${log.nama} - Foto Berangkat`,
                                  subtitle: `${log.tanggal} • ${evalResult.shiftLabel}`,
                                  time: `Jam Masuk: ${log.jamMasuk || "-"}`,
                                  shiftInfo: `Jadwal Shift: ${evalResult.shiftHours}`
                                })}
                                className="group relative h-8 w-8 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 inline-block transition-transform hover:scale-105 shadow-xs"
                              >
                                <Image src={fotoBerangkat as string} alt="Foto Masuk" fill className="object-cover" unoptimized />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Eye className="h-3 w-3" />
                                </div>
                              </button>
                            ) : (
                              <span className="text-[7.5px] font-bold uppercase text-slate-300">Kosong</span>
                            )}
                          </td>
                          {/* Foto Pulang */}
                          <td className="px-2 py-2 text-center whitespace-nowrap">
                            {fotoPulang ? (
                              <button
                                type="button"
                                onClick={() => setPreviewPhoto({
                                  url: fotoPulang as string,
                                  title: `${log.nama} - Foto Pulang`,
                                  subtitle: `${log.tanggal} • ${evalResult.shiftLabel}`,
                                  time: `Jam Pulang: ${log.jamPulang || "-"}`,
                                  shiftInfo: `Jadwal Shift: ${evalResult.shiftHours}`
                                })}
                                className="group relative h-8 w-8 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 inline-block transition-transform hover:scale-105 shadow-xs"
                              >
                                <Image src={fotoPulang as string} alt="Foto Pulang" fill className="object-cover" unoptimized />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Eye className="h-3 w-3" />
                                </div>
                              </button>
                            ) : (
                              <span className="text-[7.5px] font-bold uppercase text-slate-300">
                                {log.jamMasuk && log.jamMasuk !== "-" ? "Belum" : "Kosong"}
                              </span>
                            )}
                          </td>
                          <td className="px-2.5 py-2">
                            <div className="flex flex-col items-start gap-0.5 max-w-[150px]">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase border whitespace-nowrap",
                                evalResult.statusBadgeColor === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                evalResult.statusBadgeColor === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                evalResult.statusBadgeColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                evalResult.statusBadgeColor === "sky" ? "bg-sky-50 text-sky-700 border-sky-200" :
                                evalResult.statusBadgeColor === "purple" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                evalResult.statusBadgeColor === "slate" ? "bg-slate-100 text-slate-700 border-slate-200" :
                                "bg-rose-50 text-rose-700 border-rose-200"
                              )}>
                                {evalResult.statusText}
                              </span>
                              <span className="text-[7.5px] font-medium text-slate-400 truncate w-full" title={evalResult.notes}>
                                {evalResult.notes}
                              </span>
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-right whitespace-nowrap">
                            <Button
                              type="button"
                              onClick={() => handleOpenEditLog(log)}
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-wider"
                            >
                              <Pencil className="h-2.5 w-2.5 mr-1" />
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={11} className="py-12 text-center opacity-40 italic text-[11px] font-bold uppercase">
                          Belum ada data absensi untuk toko / tanggal yang dipilih
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit / Sesuaikan Status Kehadiran Modal */}
      {editingLog && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setEditingLog(null)}
        >
          <div 
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-base uppercase text-slate-900 italic">Sesuaikan Status Absensi</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                  {editingLog.nama} • {editingLog.tanggal || selectedDateStr.split("-").reverse().join("/")}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setEditingLog(null)} 
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditLog} className="space-y-4">
              {/* Pilihan Status */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500">Status Kehadiran</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["Hadir", "Ijin", "Sakit", "Alpha", "Cuti", "Libur"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditStatusManual(st)}
                      className={cn(
                        "py-2 px-2 rounded-xl font-black text-[9px] uppercase transition-all border text-center",
                        editStatusManual === st
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shift Selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500">Shift Kerja</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditShift("shift1")}
                    className={cn(
                      "py-2 px-3 rounded-xl font-black text-[9px] uppercase transition-all border text-center",
                      editShift === "shift1"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    )}
                  >
                    Shift 1 (Pagi)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditShift("shift2")}
                    className={cn(
                      "py-2 px-3 rounded-xl font-black text-[9px] uppercase transition-all border text-center",
                      editShift === "shift2"
                        ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    )}
                  >
                    Shift 2 (Siang)
                  </button>
                </div>
              </div>

              {/* Jam Masuk & Jam Pulang (Jika Hadir / Disesuaikan) */}
              {editStatusManual === "Hadir" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Jam Masuk</Label>
                    <Input 
                      type="time" 
                      value={editJamMasuk} 
                      onChange={(e) => setEditJamMasuk(e.target.value)} 
                      className="bg-slate-50 border-slate-200 text-xs font-bold rounded-xl h-10" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Jam Pulang</Label>
                    <Input 
                      type="time" 
                      value={editJamPulang} 
                      onChange={(e) => setEditJamPulang(e.target.value)} 
                      className="bg-slate-50 border-slate-200 text-xs font-bold rounded-xl h-10" 
                    />
                  </div>
                </div>
              )}

              {/* Keterangan / Alasan */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500">Keterangan / Alasan</Label>
                <Input 
                  value={editKeterangan} 
                  onChange={(e) => setEditKeterangan(e.target.value)} 
                  placeholder={
                    editStatusManual === "Ijin" ? "Contoh: Ijin urusan keluarga" :
                    editStatusManual === "Sakit" ? "Contoh: Sakit demam / surat dokter" :
                    editStatusManual === "Alpha" ? "Contoh: Tanpa kabar / tidak hadir" :
                    "Masukkan catatan tambahan..."
                  }
                  className="bg-slate-50 border-slate-200 text-xs font-bold rounded-xl h-10" 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setEditingLog(null)}
                  className="flex-1 rounded-xl h-11 text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Batal
                </Button>
                <Button 
                  type="submit" 
                  disabled={savingEdit}
                  className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-wider text-[10px] h-11 shadow-lg shadow-primary/20"
                >
                  {savingEdit ? "Menyimpan..." : "Simpan Status"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Resolution Photo Preview Modal */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" 
          onClick={() => setPreviewPhoto(null)}
        >
          <div 
            className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-black text-sm sm:text-base uppercase text-slate-900 italic leading-tight">{previewPhoto.title}</h4>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                  {previewPhoto.subtitle} {previewPhoto.shiftInfo ? `• ${previewPhoto.shiftInfo}` : ""}
                </p>
                <p className="text-[10px] sm:text-xs font-black text-primary uppercase mt-1 tabular-nums">
                  {previewPhoto.time}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewPhoto(null)} 
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner">
              <Image src={previewPhoto.url} alt={previewPhoto.title} fill className="object-cover" unoptimized />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[8px] font-bold text-slate-400 uppercase">Zona Waktu Smart Absensi</span>
              <Button onClick={() => setPreviewPhoto(null)} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider h-9 px-4">
                Tutup Foto
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
