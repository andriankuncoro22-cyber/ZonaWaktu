'use client';

import { useEffect, useState } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';

export const useDoc = <T = DocumentData>(docRef: DocumentReference<T> | null) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docRef) {
      queueMicrotask(() => setLoading(false));
      return;
    }

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: DocumentSnapshot<T>) => {
        setData(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [docRef]);

  return { data, loading, error };
};
