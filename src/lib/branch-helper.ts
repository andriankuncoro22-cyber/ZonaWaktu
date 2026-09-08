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

export interface BranchInfo {
  id: BranchId;
  code: string;
  name: string;
  shortName: string;
  landingRoute: string;
  loginRoute: string;
  badgeColor: string;
}

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

const GLOBAL_COLLECTIONS = new Set(['settings', 'users']);

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
  ...pathSegments: string[]
): CollectionReference<DocumentData> {
  const scopedPath = getBranchScopedCollectionName(path);
  if (pathSegments.length > 0) {
    return fsCollection(firestoreOrRef as Firestore, scopedPath, ...pathSegments);
  }
  return fsCollection(firestoreOrRef as Firestore, scopedPath);
}

/**
 * Branch-scoped doc() helper
 */
export function branchDoc(
  firestoreOrRefOrCol: Firestore | CollectionReference | DocumentReference, 
  path?: string, 
  ...pathSegments: string[]
): DocumentReference<DocumentData> {
  // If called without path (e.g. doc(collectionRef) for generating an auto ID)
  if (path === undefined) {
    return fsDoc(firestoreOrRefOrCol as CollectionReference<DocumentData>);
  }

  // If path is a string
  if (typeof path === 'string') {
    const parts = path.split('/');
    parts[0] = getBranchScopedCollectionName(parts[0]);
    const fullPath = parts.join('/');
    if (pathSegments.length > 0) {
      return fsDoc(firestoreOrRefOrCol as Firestore, fullPath, ...pathSegments);
    }
    return fsDoc(firestoreOrRefOrCol as Firestore, fullPath);
  }

  return fsDoc(firestoreOrRefOrCol as Firestore, path, ...pathSegments);
}
