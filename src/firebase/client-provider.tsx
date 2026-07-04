'use client';

import React, { useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { app, auth, db } from './config';

export const FirebaseClientProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useMemo(() => ({ app, auth, db }), []);

  return (
    <FirebaseProvider app={value.app} auth={value.auth} db={value.db}>
      {children}
    </FirebaseProvider>
  );
};
