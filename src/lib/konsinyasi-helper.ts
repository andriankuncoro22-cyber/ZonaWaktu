// Helper and definitions for Titip Jual (Konsinyasi) System

export interface KonsinyasiDefaultItem {
  code: string;
  name: string;
  kategori: string;
  hargaJual: number;
  hargaDasar: number; // Harga beli/setor ke penitip
  margin: number;     // hargaJual - hargaDasar
  vendor: string;
}

export const DEFAULT_KONSINYASI_PRODUCTS: KonsinyasiDefaultItem[] = [
  { 
    code: "0000000000052", 
    name: "Double Choco Soft Cookies", 
    kategori: "Soft Cookies", 
    hargaJual: 8000, 
    hargaDasar: 5000, 
    margin: 3000,
    vendor: "Penitip Soft Cookies" 
  },
  { 
    code: "0000000000053", 
    name: "Matcha Soft Cookies", 
    kategori: "Soft Cookies", 
    hargaJual: 8000, 
    hargaDasar: 5000, 
    margin: 3000,
    vendor: "Penitip Soft Cookies" 
  },
  { 
    code: "0000000000054", 
    name: "Strawberry Soft Cookies", 
    kategori: "Soft Cookies", 
    hargaJual: 8000, 
    hargaDasar: 5000, 
    margin: 3000,
    vendor: "Penitip Soft Cookies" 
  },
  { 
    code: "0000000000055", 
    name: "Red Velvet Soft Cookies", 
    kategori: "Soft Cookies", 
    hargaJual: 8000, 
    hargaDasar: 5000, 
    margin: 3000,
    vendor: "Penitip Soft Cookies" 
  },
  { 
    code: "0000000000056", 
    name: "Classic Soft Cookies", 
    kategori: "Soft Cookies", 
    hargaJual: 8000, 
    hargaDasar: 5000, 
    margin: 3000,
    vendor: "Penitip Soft Cookies" 
  },
];

export const KONSINYASI_CODES = new Set(DEFAULT_KONSINYASI_PRODUCTS.map(p => p.code));

export function isKonsinyasiProduct(item: { 
  code?: string; 
  name?: string; 
  nama?: string; 
  kategori?: string;
  isKonsinyasi?: boolean;
}): boolean {
  if (item.isKonsinyasi === true) return true;
  
  const code = String(item.code || "").trim();
  if (code && KONSINYASI_CODES.has(code)) return true;

  const name = String(item.name || item.nama || "").toLowerCase();
  if (name.includes("soft cookies") || name.includes("soft cookie")) return true;

  const kategori = String(item.kategori || "").toLowerCase();
  if (kategori.includes("soft cookies") || kategori.includes("konsinyasi") || kategori.includes("titip jual")) {
    return true;
  }

  return false;
}

export function getKonsinyasiPrice(item: {
  code?: string;
  name?: string;
  nama?: string;
  hargaJual?: number;
  hargaDasar?: number;
}) {
  const code = String(item.code || "").trim();
  const matched = DEFAULT_KONSINYASI_PRODUCTS.find(p => p.code === code);
  if (matched) {
    return {
      hargaJual: item.hargaJual || matched.hargaJual,
      hargaDasar: item.hargaDasar || matched.hargaDasar,
      margin: (item.hargaJual || matched.hargaJual) - (item.hargaDasar || matched.hargaDasar)
    };
  }

  const hj = Number(item.hargaJual || 0);
  const hd = Number(item.hargaDasar || 0);
  return {
    hargaJual: hj,
    hargaDasar: hd,
    margin: Math.max(0, hj - hd)
  };
}
