import { 
  collection as fsCollection, 
  doc as fsDoc, 
  Firestore, 
  CollectionReference, 
  DocumentReference, 
  DocumentData 
} from 'firebase/firestore';

export type BranchId = 'gdm' | 'kedungreja';

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
  gdm: {
    id: 'gdm',
    code: 'ZW-01',
    name: 'Zona Waktu - Cabang Gandrungmangu',
    shortName: 'Cabang Gandrungmangu',
    landingRoute: '/zona_gdm',
    loginRoute: '/owner-login',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
  },
  kedungreja: {
    id: 'kedungreja',
    code: 'ZW-02',
    name: 'Zona Waktu - Cabang Kedungreja',
    shortName: 'Cabang Kedungreja',
    landingRoute: '/zona_kedungreja',
    loginRoute: '/zona_kedungreja/owner-login',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/30'
  }
};

/**
 * Get current active branch ('gdm' | 'kedungreja')
 */
export function getActiveBranch(): BranchId {
  if (typeof window === 'undefined') return 'gdm';
  const saved = localStorage.getItem('current_branch');
  if (saved === 'kedungreja') return 'kedungreja';
  if (window.location.pathname.startsWith('/zona_kedungreja')) return 'kedungreja';
  if (window.location.pathname.startsWith('/zona_gdm')) return 'gdm';
  return (saved as BranchId) || 'gdm';
}

/**
 * Set current active branch
 */
export function setActiveBranch(branch: BranchId) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('current_branch', branch);
    window.dispatchEvent(new Event('branch_changed'));
  }
}

const GLOBAL_COLLECTIONS = new Set(['settings', 'users']);

/**
 * Scope collection name based on current active branch
 * GDM uses standard collections (preserving all existing data)
 * Kedungreja uses '_kdrj' collections (starting 100% clean & completely isolated)
 */
export function getBranchScopedCollectionName(name: string, explicitBranch?: BranchId): string {
  if (!name) return name;
  const branch = explicitBranch || getActiveBranch();
  if (branch === 'kedungreja') {
    if (GLOBAL_COLLECTIONS.has(name)) return name;
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
    return (fsCollection as any)(firestoreOrRef, scopedPath, ...pathSegments);
  }
  return (fsCollection as any)(firestoreOrRef, scopedPath);
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
    return (fsDoc as any)(firestoreOrRefOrCol);
  }

  // If path is a string
  if (typeof path === 'string') {
    const parts = path.split('/');
    parts[0] = getBranchScopedCollectionName(parts[0]);
    const fullPath = parts.join('/');
    if (pathSegments.length > 0) {
      return (fsDoc as any)(firestoreOrRefOrCol, fullPath, ...pathSegments);
    }
    return (fsDoc as any)(firestoreOrRefOrCol, fullPath);
  }

  return (fsDoc as any)(firestoreOrRefOrCol, path, ...pathSegments);
}
