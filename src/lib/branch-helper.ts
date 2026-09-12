import { useSyncExternalStore } from 'react';
import { 
  collection as fsCollection, 
  doc as fsDoc, 
  Firestore, 
  CollectionReference, 
  DocumentReference, 
  DocumentData 
} from 'firebase/firestore';

export type BranchId = 'all' | 'gdm' | 'kedungreja' | 'tehwarga';
export type WarehouseId = 'gdm' | 'kedungreja';

export interface BranchInfo {
  id: BranchId;
  code: string;
  name: string;
  shortName: string;
  landingRoute: string;
  loginRoute: string;
  badgeColor: string;
}

export interface WarehouseInfo {
  id: WarehouseId;
  code: string;
  name: string;
  shortName: string;
  description: string;
  badgeColor: string;
}

export const WAREHOUSE_LIST: Record<WarehouseId, WarehouseInfo> = {
  gdm: {
    id: 'gdm',
    code: 'GD-GDM',
    name: 'Gudang Utama Gandrungmangu',
    shortName: 'Gudang GDM',
    description: 'Gudang Terpadu Zona Waktu & Teh Warga Gandrungmangu',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
  },
  kedungreja: {
    id: 'kedungreja',
    code: 'GD-KDRJ',
    name: 'Gudang Utama Kedungreja',
    shortName: 'Gudang Kedungreja',
    description: 'Gudang Utama Zona Waktu Kedungreja',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30'
  }
};

export const BRANCH_LIST: Record<BranchId, BranchInfo> = {
  all: {
    id: 'all',
    code: 'ALL',
    name: 'Semua Toko (Konsolidasi)',
    shortName: 'Semua Toko',
    landingRoute: '/',
    loginRoute: '/owner-login',
    badgeColor: 'bg-slate-900 text-white border-slate-700'
  },
  gdm: {
    id: 'gdm',
    code: 'ZW-01',
    name: 'Zona Waktu - Cabang Gandrungmangu',
    shortName: 'Zona Waktu GDM',
    landingRoute: '/zona_gdm',
    loginRoute: '/owner-login',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
  },
  kedungreja: {
    id: 'kedungreja',
    code: 'ZW-02',
    name: 'Zona Waktu - Cabang Kedungreja',
    shortName: 'Zona Kedungreja',
    landingRoute: '/zona_kedungreja',
    loginRoute: '/zona_kedungreja/owner-login',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30'
  },
  tehwarga: {
    id: 'tehwarga',
    code: 'TW-01',
    name: 'Teh Warga - Cabang Gandrungmangu',
    shortName: 'Teh Warga GDM',
    landingRoute: '/teh_warga_gdm',
    loginRoute: '/teh_warga_gdm/owner-login',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/30'
  }
};

/**
 * Normalize any branch string to standard BranchId ('all' | 'gdm' | 'kedungreja' | 'tehwarga')
 */
export function normalizeBranchId(raw: unknown): BranchId {
  if (!raw) return 'gdm';
  const str = String(raw).trim().toLowerCase();
  if (str === 'all' || str === 'semua' || str === 'semua toko' || str === 'semuatoko' || str === 'global') return 'all';
  if (str === 'kedungreja' || str === 'kdrj' || str === 'zw-02' || str.includes('kedungreja')) return 'kedungreja';
  if (str === 'tehwarga' || str === 'teh_warga' || str === 'teh_warga_gdm' || str === 'tw-01' || str.includes('teh') || str.includes('warga')) return 'tehwarga';
  return 'gdm';
}

/**
 * Get current active branch ('gdm' | 'kedungreja' | 'tehwarga')
 */
export function getActiveBranch(): BranchId {
  if (typeof window === 'undefined') return 'gdm';
  const saved = localStorage.getItem('current_branch');
  if (saved) return normalizeBranchId(saved);
  if (window.location.pathname.startsWith('/teh_warga_gdm')) return 'tehwarga';
  if (window.location.pathname.startsWith('/zona_kedungreja')) return 'kedungreja';
  if (window.location.pathname.startsWith('/zona_gdm')) return 'gdm';
  return 'gdm';
}

function subscribeBranch(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('branch_changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('branch_changed', callback);
    window.removeEventListener('storage', callback);
  };
}

/**
 * Hook to reactively listen to active branch changes
 */
export function useActiveBranch(): BranchId {
  return useSyncExternalStore(
    subscribeBranch,
    getActiveBranch,
    () => 'gdm'
  );
}

/**
 * Set current active branch
 */
export function setActiveBranch(branch: BranchId) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('current_branch', branch);
    document.documentElement.setAttribute('data-branch', branch);
    window.dispatchEvent(new Event('branch_changed'));
  }
}

/**
 * Get document ID in 'settings' collection for branch business identity
 */
export function getStoreConfigDocId(explicitBranch?: BranchId): string {
  const branch = explicitBranch || getActiveBranch();
  if (branch === 'tehwarga') return 'store_config_tehwarga';
  if (branch === 'kedungreja') return 'store_config_kedungreja';
  return 'store_config';
}

/**
 * Get default store identity per branch
 */
export function getDefaultStoreIdentity(explicitBranch?: BranchId) {
  const branch = explicitBranch || getActiveBranch();
  if (branch === 'all') {
    return {
      name: "Zona Waktu Group",
      tagline: "Semua Outlet & Cabang Usaha",
      logoLanding: "",
      logoHeader: ""
    };
  }
  if (branch === 'tehwarga') {
    return {
      name: "Teh Warga Gandrungmangu",
      tagline: "Spesialis Racikan Varian Teh Autentik",
      logoLanding: "",
      logoHeader: ""
    };
  }
  if (branch === 'kedungreja') {
    return {
      name: "Zona Waktu Kedungreja",
      tagline: "Coffee & Teh Bakar Cabang Kedungreja",
      logoLanding: "",
      logoHeader: ""
    };
  }
  return {
    name: "Zona Waktu",
    tagline: "Coffee & Teh Bakar Autentik",
    logoLanding: "",
    logoHeader: ""
  };
}

const GLOBAL_COLLECTIONS = new Set(['settings', 'users', 'transfer_requests']);

/**
 * Scope collection name based on current active branch
 * GDM uses standard collections (preserving all existing data)
 * Kedungreja uses '_kdrj' collections (starting 100% clean & completely isolated)
 * Teh Warga uses '_tehwarga' collections (starting 100% clean & completely isolated)
 */
export function getBranchScopedCollectionName(name: string, explicitBranch?: BranchId): string {
  if (!name) return name;
  const branch = explicitBranch || getActiveBranch();
  if (GLOBAL_COLLECTIONS.has(name)) return name;
  
  if (branch === 'tehwarga') {
    if (name.endsWith('_tehwarga') || name.endsWith('_twgdm')) return name;
    return `${name}_tehwarga`;
  }
  if (branch === 'kedungreja') {
    if (name.endsWith('_kdrj') || name.endsWith('_kedungreja')) return name;
    return `${name}_kdrj`;
  }
  return name;
}

/**
 * Branch-scoped collection() helper
 */
export function branchCollection(
  firestoreOrRef: Firestore | DocumentReference, 
  path: string, 
  explicitBranchOrSegment?: BranchId | string,
  ...pathSegments: string[]
): CollectionReference<DocumentData> {
  const isBranchId = explicitBranchOrSegment === 'all' || explicitBranchOrSegment === 'gdm' || explicitBranchOrSegment === 'kedungreja' || explicitBranchOrSegment === 'tehwarga';
  const branch = isBranchId ? (explicitBranchOrSegment as BranchId) : undefined;
  const remainingSegments = isBranchId ? pathSegments : (explicitBranchOrSegment ? [explicitBranchOrSegment, ...pathSegments] : []);
  
  const scopedPath = getBranchScopedCollectionName(path, branch);
  if (remainingSegments.length > 0) {
    return fsCollection(firestoreOrRef as Firestore, scopedPath, ...remainingSegments);
  }
  return fsCollection(firestoreOrRef as Firestore, scopedPath);
}

/**
 * Branch-scoped doc() helper
 * Supports:
 * - branchDoc(db, "bahan-baku", "item123", "tehwarga")
 * - branchDoc(db, "bahan-baku/item123", "tehwarga")
 * - branchDoc(colRef)
 */
export function branchDoc(
  firestoreOrRefOrCol: Firestore | CollectionReference | DocumentReference, 
  path?: string, 
  idOrBranch?: string | BranchId,
  explicitBranch?: BranchId,
  ...pathSegments: string[]
): DocumentReference<DocumentData> {
  // If called without path (e.g. doc(collectionRef) for generating an auto ID)
  if (path === undefined) {
    return fsDoc(firestoreOrRefOrCol as CollectionReference<DocumentData>);
  }

  // Check if second param is docId or branchId
  const isBranchId = idOrBranch === 'all' || idOrBranch === 'gdm' || idOrBranch === 'kedungreja' || idOrBranch === 'tehwarga';

  // If path is a string
  if (typeof path === 'string') {
    const parts = path.split('/');
    const targetBranch = isBranchId ? (idOrBranch as BranchId) : explicitBranch;
    parts[0] = getBranchScopedCollectionName(parts[0], targetBranch);
    
    if (!isBranchId && idOrBranch) {
      parts.push(idOrBranch);
    }
    if (pathSegments.length > 0) {
      parts.push(...pathSegments);
    }

    const fullPath = parts.join('/');
    return fsDoc(firestoreOrRefOrCol as Firestore, fullPath);
  }

  return fsDoc(firestoreOrRefOrCol as Firestore, path, ...pathSegments);
}

/**
 * Map any branch to its parent physical warehouse:
 * 'gdm' -> 'gdm'
 * 'tehwarga' -> 'gdm' (Shared physical warehouse with GDM)
 * 'kedungreja' -> 'kedungreja'
 */
export function getWarehouseForBranch(branchId?: BranchId): WarehouseId {
  const b = branchId || getActiveBranch();
  if (b === 'kedungreja') return 'kedungreja';
  return 'gdm'; // default both gdm and tehwarga to gdm warehouse
}

/**
 * Scope collection specifically for Gudang Utama operations:
 * If warehouseId is 'gdm' -> uses standard collections (e.g. 'bahan-baku', 'log_pembelian_bahan', 'opnam_gudang')
 * If warehouseId is 'kedungreja' -> uses '_kdrj' collections (e.g. 'bahan-baku_kdrj', 'log_pembelian_bahan_kdrj', 'opnam_gudang_kdrj')
 */
export function getWarehouseScopedCollectionName(name: string, explicitWarehouse?: WarehouseId): string {
  if (!name) return name;
  const wId = explicitWarehouse || getWarehouseForBranch();
  if (GLOBAL_COLLECTIONS.has(name)) return name;
  if (wId === 'kedungreja') {
    if (name.endsWith('_kdrj') || name.endsWith('_kedungreja')) return name;
    return `${name}_kdrj`;
  }
  // GDM warehouse uses standard collection names (stripping any _tehwarga / _kdrj suffix)
  return name.replace(/_tehwarga|_twgdm|_kdrj|_kedungreja$/, '');
}

/**
 * Warehouse-scoped collection() helper
 */
export function warehouseCollection(
  firestoreOrRef: Firestore | DocumentReference,
  path: string,
  explicitWarehouse?: WarehouseId,
  ...pathSegments: string[]
): CollectionReference<DocumentData> {
  const scopedPath = getWarehouseScopedCollectionName(path, explicitWarehouse);
  if (pathSegments.length > 0) {
    return fsCollection(firestoreOrRef as Firestore, scopedPath, ...pathSegments);
  }
  return fsCollection(firestoreOrRef as Firestore, scopedPath);
}

/**
 * Warehouse-scoped doc() helper
 * Supports:
 * - warehouseDoc(db, "bahan-baku", "item123", "gdm")
 * - warehouseDoc(db, "bahan-baku/item123", "gdm")
 * - warehouseDoc(colRef)
 */
export function warehouseDoc(
  firestoreOrRefOrCol: Firestore | CollectionReference | DocumentReference,
  path?: string,
  idOrWarehouse?: string | WarehouseId,
  explicitWarehouse?: WarehouseId,
  ...pathSegments: string[]
): DocumentReference<DocumentData> {
  if (path === undefined) {
    return fsDoc(firestoreOrRefOrCol as CollectionReference<DocumentData>);
  }

  const isWarehouseId = idOrWarehouse === 'gdm' || idOrWarehouse === 'kedungreja';

  if (typeof path === 'string') {
    const parts = path.split('/');
    const targetWarehouse = isWarehouseId ? (idOrWarehouse as WarehouseId) : explicitWarehouse;
    parts[0] = getWarehouseScopedCollectionName(parts[0], targetWarehouse);
    
    if (!isWarehouseId && idOrWarehouse) {
      parts.push(idOrWarehouse);
    }
    if (pathSegments.length > 0) {
      parts.push(...pathSegments);
    }

    const fullPath = parts.join('/');
    return fsDoc(firestoreOrRefOrCol as Firestore, fullPath);
  }

  return fsDoc(firestoreOrRefOrCol as Firestore, path, ...pathSegments);
}

/**
 * Check if a material belongs to a specific branch container/outlet.
 * - 'gdm' (Zona Waktu Gandrungmangu): Only Zona Waktu items (excludes Teh Warga items that have isFromTehWarga, originalTwCode, or code BB-001..BB-049)
 * - 'tehwarga' (Teh Warga Gandrungmangu): Only Teh Warga items
 * - 'kedungreja' (Zona Waktu Kedungreja): Kedungreja items
 * - 'all': All items
 */
export function isMaterialForBranchContainer(
  item: { code?: string; isFromTehWarga?: boolean; originalTwCode?: string; [key: string]: any },
  branch?: BranchId
): boolean {
  const targetBranch = branch || getActiveBranch();
  if (targetBranch === 'all') return true;
  if (targetBranch === 'kedungreja') return true; // bahan-baku_kdrj is already isolated

  const isTwItem = Boolean(
    item.isFromTehWarga ||
    item.originalTwCode ||
    /^BB-0(0[1-9]|[1-4][0-9])$/i.test((item.code || '').trim())
  );

  if (targetBranch === 'tehwarga') {
    // If querying bahan-baku_tehwarga, all items belong to TW.
    // If inspecting a combined list (like bahan-baku in GDM), only accept TW items.
    return isTwItem;
  }

  // targetBranch === 'gdm' (Zona Waktu Gandrungmangu container)
  return !isTwItem;
}

/**
 * Filter an array of materials to only include materials belonging to the specified container/outlet.
 */
export function filterContainerMaterials<T extends { code?: string; isFromTehWarga?: boolean; originalTwCode?: string }>(
  materials: T[] | null | undefined,
  branch?: BranchId
): T[] {
  if (!materials || !Array.isArray(materials)) return [];
  const targetBranch = branch || getActiveBranch();
  return materials.filter(item => isMaterialForBranchContainer(item, targetBranch));
}

