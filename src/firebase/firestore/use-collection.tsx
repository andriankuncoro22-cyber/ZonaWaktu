'use client';

import { useEffect, useState } from 'react';
import {
  Query,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  FirestoreError,
} from 'firebase/firestore';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';

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
