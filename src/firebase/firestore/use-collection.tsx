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
  BranchId,
  WarehouseId 
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
 * - Saat activeBranch === 'all': Menggabungkan data dari keempat toko ('gdm', 'kedungreja', 'tehwarga', 'gembong').
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

  const qGmb = useMemo(() => {
    if (!firestore || (!isAll && activeBranch !== 'gembong')) return null;
    const col = branchCollection(firestore, collectionName, 'gembong');
    return queryBuilder ? queryBuilder(col, 'gembong') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, activeBranch, ...deps]);

  const resGdm = useCollection((isAll || activeBranch === 'gdm') ? qGdm : null);
  const resKdrj = useCollection((isAll || activeBranch === 'kedungreja') ? qKdrj : null);
  const resTeh = useCollection((isAll || activeBranch === 'tehwarga') ? qTeh : null);
  const resGmb = useCollection((isAll || activeBranch === 'gembong') ? qGmb : null);

  const data = useMemo(() => {
    if (!isAll) {
      if (activeBranch === 'gembong') {
        return (resGmb.data || []).map(it => ({ ...it, _branchId: 'gembong', _branchName: 'Zona Gembong' }));
      }
      if (activeBranch === 'kedungreja') {
        return (resKdrj.data || []).map(it => ({ ...it, _branchId: 'kedungreja', _branchName: 'Zona Kedungreja' }));
      }
      if (activeBranch === 'tehwarga') {
        return (resTeh.data || []).map(it => ({ ...it, _branchId: 'tehwarga', _branchName: 'Teh Warga GDM' }));
      }
      return (resGdm.data || []).map(it => ({ ...it, _branchId: 'gdm', _branchName: 'Zona Waktu GDM' }));
    }

    const itemsGdm = (resGdm.data || []).map(it => ({ ...it, _branchId: 'gdm', _branchName: 'Zona Waktu GDM' }));
    const itemsKdrj = (resKdrj.data || []).map(it => ({ ...it, _branchId: 'kedungreja', _branchName: 'Zona Kedungreja' }));
    const itemsTeh = (resTeh.data || []).map(it => ({ ...it, _branchId: 'tehwarga', _branchName: 'Teh Warga GDM' }));
    const itemsGmb = (resGmb.data || []).map(it => ({ ...it, _branchId: 'gembong', _branchName: 'Zona Gembong' }));

    return [...itemsGdm, ...itemsKdrj, ...itemsTeh, ...itemsGmb];
  }, [isAll, activeBranch, resGdm.data, resKdrj.data, resTeh.data, resGmb.data]);

  const loading = isAll 
    ? (resGdm.loading || resKdrj.loading || resTeh.loading || resGmb.loading) 
    : (activeBranch === 'gembong' ? resGmb.loading : activeBranch === 'kedungreja' ? resKdrj.loading : activeBranch === 'tehwarga' ? resTeh.loading : resGdm.loading);

  const error = resGdm.error || resKdrj.error || resTeh.error || resGmb.error;

  return { data: data as T[], loading, error };
}

/**
 * Hook untuk melakukan query reaktif ke Gudang Utama yang otomatis mendukung mode konsolidasi 'Semua Toko' (all).
 * - Saat activeBranch === 'all': Menggabungkan data dari 3 Gudang Utama ('gdm', 'kedungreja', dan 'gembong').
 * - Saat activeBranch !== 'all': Mengambil data gudang induk toko tersebut.
 */
export function useConsolidatedWarehouseCollection<T = DocumentData>(
  firestore: Firestore,
  collectionName: string,
  queryBuilder?: (col: CollectionReference<DocumentData>, whId: WarehouseId) => Query<DocumentData> | CollectionReference<DocumentData>,
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

  const qWhGmb = useMemo(() => {
    if (!firestore || (!isAll && targetWarehouse !== 'gembong')) return null;
    const col = warehouseCollection(firestore, collectionName, 'gembong');
    return queryBuilder ? queryBuilder(col, 'gembong') : col;
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, [firestore, collectionName, isAll, targetWarehouse, ...deps]);

  const resWhGdm = useCollection((isAll || targetWarehouse === 'gdm') ? qWhGdm : null);
  const resWhKdrj = useCollection((isAll || targetWarehouse === 'kedungreja') ? qWhKdrj : null);
  const resWhGmb = useCollection((isAll || targetWarehouse === 'gembong') ? qWhGmb : null);

  const data = useMemo(() => {
    if (!isAll) {
      if (targetWarehouse === 'gembong') return (resWhGmb.data || []);
      if (targetWarehouse === 'kedungreja') return (resWhKdrj.data || []);
      return (resWhGdm.data || []);
    }

    const itemsGdm = (resWhGdm.data || []).map(it => ({ ...it, _warehouseId: 'gdm', _warehouseName: 'Gudang Utama GDM' }));
    const itemsKdrj = (resWhKdrj.data || []).map(it => ({ ...it, _warehouseId: 'kedungreja', _warehouseName: 'Gudang Utama Kedungreja' }));
    const itemsGmb = (resWhGmb.data || []).map(it => ({ ...it, _warehouseId: 'gembong', _warehouseName: 'Gudang Utama Gembong' }));

    return [...itemsGdm, ...itemsKdrj, ...itemsGmb];
  }, [isAll, targetWarehouse, resWhGdm.data, resWhKdrj.data, resWhGmb.data]);

  const loading = isAll 
    ? (resWhGdm.loading || resWhKdrj.loading || resWhGmb.loading) 
    : (targetWarehouse === 'gembong' ? resWhGmb.loading : targetWarehouse === 'kedungreja' ? resWhKdrj.loading : resWhGdm.loading);

  const error = resWhGdm.error || resWhKdrj.error || resWhGmb.error;

  return { data: data as T[], loading, error };
}
