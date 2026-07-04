
export * from './config';
export * from './provider';
export * from './client-provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './error-emitter';
export * from './errors';

import { useMemo } from 'react';
import { app, auth, db } from './config';

/**
 * Hook untuk menstabilkan referensi Firebase (Query, DocumentReference).
 * Mencegah re-subscription yang tidak perlu ke Firestore.
 */
export function useMemoFirebase<T>(factory: () => T, deps: any[]): T {
  return useMemo(factory, deps);
}

export function initializeFirebase() {
  return { app, auth, db };
}
