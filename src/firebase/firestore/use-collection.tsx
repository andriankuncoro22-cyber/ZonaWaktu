'use client';

import { useEffect, useState, useMemo, DependencyList } from 'react';
import {
  Query,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  FirestoreError,
  Firestore,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';
import { 
  useActiveBranch, 
  branchCollection, 
  warehouseCollection, 
  getWarehouseForBranch,
  BranchId 
} from '@/lib/branch-helper';

export const useCollection = <T = DocumentData>(query: Query<T> | null) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Reset state saat query berubah untuk menghindari data lama (ghosting)
    queueMicrotask(() => {
      setData([]);
      setLoading(true);
      setError(null);
    });

    if (!query) {
      queueMicrotask(() => setLoading(false));
      return;
    }

    const unsubscribe = onSnapshot(
      query,
      (snapshot: QuerySnapshot<T>) => {
        const items = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        } as T & { id: string }));
        setData(items);
        setLoading(false);
        setError(null);
      },
      (serverError: FirestoreError) => {
        setLoading(false);
        setError(serverError);
        
        if (serverError.code === 'permission-denied') {
          const permissionError = new FirestorePermissionError({
            path: 'koleksi-terproteksi',
            operation: 'list',
          });
          errorEmitter.emit('permission-error', permissionError);
        }
      }
    );

    return () => unsubscribe();
  }, [query]);

  return { data, loading, error };
};

/**
 * Hook untuk melakukan query reaktif yang otomatis mendukung mode konsolidasi 'Semua Toko' (all).
 * - Saat activeBranch === 'all': Menggabungkan data dari ketiga toko ('gdm', 'kedungreja', 'tehwarga').
 * - Saat activeBranch !== 'all': Mengambil data khusus toko yang dipilih.
 */
export function useConsolidatedCollection<T = DocumentData>(
  firestore: Firestore,
  collectionName: string,
  queryBuilder?: (col: CollectionReference<DocumentData>, branch: BranchId) => Query<DocumentData> | CollectionReference<DocumentData>,
  deps: DependencyList = []
) {
  const activeBranch = useActiveBranch();
  const isAll = activeBranch === 'all';

  const qGdm = useMemo(() => {
    if (!firestore || (!isAll && activeBranch !== 'gdm')) return null;
    const col = branchCollection(firestore, collectionName, 'gdm');
    return queryBuilder ? queryBuilder(col, 'gdm') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, activeBranch, ...deps]);

  const qKdrj = useMemo(() => {
    if (!firestore || (!isAll && activeBranch !== 'kedungreja')) return null;
    const col = branchCollection(firestore, collectionName, 'kedungreja');
    return queryBuilder ? queryBuilder(col, 'kedungreja') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, activeBranch, ...deps]);

  const qTeh = useMemo(() => {
    if (!firestore || (!isAll && activeBranch !== 'tehwarga')) return null;
    const col = branchCollection(firestore, collectionName, 'tehwarga');
    return queryBuilder ? queryBuilder(col, 'tehwarga') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, activeBranch, ...deps]);

  const resGdm = useCollection((isAll || activeBranch === 'gdm') ? qGdm : null);
  const resKdrj = useCollection((isAll || activeBranch === 'kedungreja') ? qKdrj : null);
  const resTeh = useCollection((isAll || activeBranch === 'tehwarga') ? qTeh : null);

  const data = useMemo(() => {
    if (!isAll) {
      if (activeBranch === 'kedungreja') return resKdrj.data || [];
      if (activeBranch === 'tehwarga') return resTeh.data || [];
      return resGdm.data || [];
    }

    const itemsGdm = (resGdm.data || []).map(it => ({ ...it, _branchId: 'gdm', _branchName: 'Zona Waktu GDM' }));
    const itemsKdrj = (resKdrj.data || []).map(it => ({ ...it, _branchId: 'kedungreja', _branchName: 'Zona Kedungreja' }));
    const itemsTeh = (resTeh.data || []).map(it => ({ ...it, _branchId: 'tehwarga', _branchName: 'Teh Warga GDM' }));

    return [...itemsGdm, ...itemsKdrj, ...itemsTeh];
  }, [isAll, activeBranch, resGdm.data, resKdrj.data, resTeh.data]);

  const loading = isAll 
    ? (resGdm.loading || resKdrj.loading || resTeh.loading) 
    : (activeBranch === 'kedungreja' ? resKdrj.loading : activeBranch === 'tehwarga' ? resTeh.loading : resGdm.loading);

  const error = resGdm.error || resKdrj.error || resTeh.error;

  return { data: data as T[], loading, error };
}

/**
 * Hook untuk melakukan query reaktif ke Gudang Utama yang otomatis mendukung mode konsolidasi 'Semua Toko' (all).
 * - Saat activeBranch === 'all': Menggabungkan data dari 2 Gudang Utama ('gdm' dan 'kedungreja').
 * - Saat activeBranch !== 'all': Mengambil data gudang induk toko tersebut.
 */
export function useConsolidatedWarehouseCollection<T = DocumentData>(
  firestore: Firestore,
  collectionName: string,
  queryBuilder?: (col: CollectionReference<DocumentData>, whId: 'gdm' | 'kedungreja') => Query<DocumentData> | CollectionReference<DocumentData>,
  deps: DependencyList = []
) {
  const activeBranch = useActiveBranch();
  const isAll = activeBranch === 'all';
  const targetWarehouse = getWarehouseForBranch(activeBranch);

  const qWhGdm = useMemo(() => {
    if (!firestore || (!isAll && targetWarehouse !== 'gdm')) return null;
    const col = warehouseCollection(firestore, collectionName, 'gdm');
    return queryBuilder ? queryBuilder(col, 'gdm') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, targetWarehouse, ...deps]);

  const qWhKdrj = useMemo(() => {
    if (!firestore || (!isAll && targetWarehouse !== 'kedungreja')) return null;
    const col = warehouseCollection(firestore, collectionName, 'kedungreja');
    return queryBuilder ? queryBuilder(col, 'kedungreja') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, targetWarehouse, ...deps]);

  const resWhGdm = useCollection((isAll || targetWarehouse === 'gdm') ? qWhGdm : null);
  const resWhKdrj = useCollection((isAll || targetWarehouse === 'kedungreja') ? qWhKdrj : null);

  const data = useMemo(() => {
    if (!isAll) {
      return targetWarehouse === 'kedungreja' ? (resWhKdrj.data || []) : (resWhGdm.data || []);
    }

    const itemsGdm = (resWhGdm.data || []).map(it => ({ ...it, _warehouseId: 'gdm', _warehouseName: 'Gudang Utama GDM' }));
    const itemsKdrj = (resWhKdrj.data || []).map(it => ({ ...it, _warehouseId: 'kedungreja', _warehouseName: 'Gudang Utama Kedungreja' }));

    return [...itemsGdm, ...itemsKdrj];
  }, [isAll, targetWarehouse, resWhGdm.data, resWhKdrj.data]);

  const loading = isAll 
    ? (resWhGdm.loading || resWhKdrj.loading) 
    : (targetWarehouse === 'kedungreja' ? resWhKdrj.loading : resWhGdm.loading);

  const error = resWhGdm.error || resWhKdrj.error;

  return { data: data as T[], loading, error };
}
