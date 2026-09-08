"use client";

import { initializeApp, deleteApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  collection, 
  Firestore
} from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/firebase/config";
import { BranchId, normalizeBranchId } from "@/lib/branch-helper";

export interface UserProfile {
  id?: string;
  uid?: string;
  username: string;
  nama: string;
  email: string;
  role: "owner" | "admin" | "employee";
  cabang: BranchId;
  status?: "aktif" | "nonaktif";
  karyawanId?: string;
  permissions?: string[];
  updatedAt?: string | number | Date | null;
}

export interface AuthUserSession extends UserProfile {
  id: string;
}

export interface LoginParams {
  username: string;
  password: string;
  expectedRole?: "owner" | "admin" | "employee";
  expectedBranch?: BranchId;
  storageKey?: string;
  branchStorageKey?: string;
}

interface FirebaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * Format username into a standard Firebase Auth email format.
 * Examples:
 *   zonagdm -> zonagdm@zonawaktu.app
 *   adminzona -> adminzona@zonawaktu.app
 *   budi -> budi@zonawaktu.app
 */
export function formatAuthEmail(username: string): string {
  if (!username) return "";
  const cleaned = username.trim().toLowerCase();
  if (cleaned.includes("@")) {
    return cleaned;
  }
  // Sanitize username characters for valid email local-part
  const safeUser = cleaned.replace(/[^a-z0-9._-]/g, "");
  return `${safeUser}@zonawaktu.app`;
}

/**
 * Normalizes password to meet Firebase Auth requirements (minimum 6 chars).
 */
export function normalizePassword(password: string): string {
  const trimmed = (password || "").trim();
  if (trimmed.length === 0) return "123456";
  if (trimmed.length < 6) {
    // Pad to 6 characters if shorter than minimum
    return trimmed.padEnd(6, "0");
  }
  return trimmed;
}

/**
 * Provision a user into Firebase Auth using a temporary app instance,
 * preventing the currently logged-in Admin/Owner session from being signed out.
 */
export async function provisionAuthUserWithoutSessionSwitch(
  username: string,
  rawPassword: string,
  profile: Partial<UserProfile>
): Promise<{ success: boolean; uid?: string; error?: string }> {
  const email = formatAuthEmail(username);
  const password = normalizePassword(rawPassword);

  const tempAppName = `temp_auth_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);

  try {
    let uid: string | undefined;

    try {
      // 1. Try creating a new Firebase Auth account
      const userCred = await createUserWithEmailAndPassword(tempAuth, email, password);
      uid = userCred.user.uid;
    } catch (createErr: unknown) {
      const fbErr = createErr as FirebaseErrorLike;
      if (fbErr?.code === "auth/email-already-in-use") {
        // 2. Account already exists -> attempt sign-in to verify or update password
        try {
          const signinCred = await signInWithEmailAndPassword(tempAuth, email, password);
          uid = signinCred.user.uid;
        } catch {
          // If password differed, we still record metadata
          console.warn(`User ${email} exists in Firebase Auth with existing credentials.`);
        }
      } else {
        throw createErr;
      }
    }

    // 3. Save / update user profile metadata in Firestore collection 'users'
    const userDocRef = doc(db, "users", formatAuthEmail(username).replace(/[^a-z0-9]/g, "_"));
    await setDoc(userDocRef, {
      username: username.trim().toLowerCase(),
      nama: profile.nama || username,
      email,
      role: profile.role || "employee",
      cabang: normalizeBranchId(profile.cabang || "gdm"),
      status: profile.status || "aktif",
      karyawanId: profile.karyawanId || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return { success: true, uid };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Gagal mendaftarkan akun di Firebase Auth";
    console.error(`Gagal provision auth user ${username}:`, err);
    return { success: false, error: errorMsg };
  } finally {
    try {
      await signOut(tempAuth);
      await deleteApp(tempApp);
    } catch {}
  }
}

/**
 * Universal Login function with Firebase Authentication & Auto-Provisioning fallback.
 */
export async function loginWithFirebaseAuth(
  arg1: string | Firestore | LoginParams | Record<string, unknown>,
  arg2?: string,
  arg3?: string | Partial<LoginParams>,
  arg4?: Partial<LoginParams>
): Promise<{
  success: boolean;
  user?: AuthUserSession;
  authUser?: FirebaseUser;
  profile?: UserProfile;
  error?: string;
}> {
  let params: LoginParams;
  if (typeof arg1 === "object" && arg1 !== null && !("app" in arg1 || "type" in arg1)) {
    params = arg1 as LoginParams;
  } else if (typeof arg1 === "string") {
    params = {
      username: arg1,
      password: arg2 || "",
      ...(typeof arg3 === "object" ? arg3 : {}),
      ...(typeof arg4 === "object" ? arg4 : {})
    };
  } else {
    // arg1 is Firestore db instance or other
    params = {
      username: arg2 || "",
      password: typeof arg3 === "string" ? arg3 : "",
      ...(typeof arg4 === "object" ? arg4 : {})
    };
  }

  const inputUser = (params.username || "").trim();
  const inputPass = (params.password || "").trim();

  if (!inputUser || !inputPass) {
    return { success: false, error: "Silakan masukkan Username dan Password." };
  }

  const email = formatAuthEmail(inputUser);
  const normalizedPass = normalizePassword(inputPass);

  try {
    let authUser: FirebaseUser | null = null;

    // 1. Primary: Direct Firebase Authentication
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, normalizedPass);
      authUser = userCredential.user;
    } catch (authErr: unknown) {
      const fbErr = authErr as FirebaseErrorLike;
      const isAuthFail = 
        fbErr?.code === "auth/user-not-found" || 
        fbErr?.code === "auth/invalid-credential" || 
        fbErr?.code === "auth/wrong-password" ||
        fbErr?.code === "auth/invalid-email";

      if (isAuthFail) {
        // 2. On-the-fly Migration Fallback: Check if credentials exist in Firestore master
        const migrationResult = await checkAndMigrateFirestoreUserToAuth(inputUser, inputPass, params.expectedRole, params.expectedBranch);
        if (migrationResult.success) {
          // Try sign in again after auto-provision
          const retryCred = await signInWithEmailAndPassword(auth, email, normalizedPass);
          authUser = retryCred.user;
        } else if (migrationResult.error) {
          return { success: false, error: migrationResult.error };
        }
      } else {
        throw authErr;
      }
    }

    if (!authUser) {
      return { success: false, error: "Username atau Password salah. Pastikan penulisan sudah sesuai." };
    }

    // 3. Resolve & Verify User Profile in Firestore
    const userProfile = await resolveUserProfile(inputUser, params.expectedRole, params.expectedBranch);

    // 4. Branch Restriction Check
    if (params.expectedBranch) {
      const userBranch = normalizeBranchId(userProfile.cabang);
      const targetBranch = normalizeBranchId(params.expectedBranch);
      
      if (userProfile.role === "employee" && userBranch !== targetBranch) {
        await signOut(auth);
        const branchName = userBranch === "kedungreja" ? "Kedungreja" : userBranch === "tehwarga" ? "Teh Warga" : "Gandrungmangu";
        return {
          success: false,
          error: `Akses Ditolak: Akun Anda terdaftar di Cabang ${branchName}. Silakan login di portal cabang Anda.`
        };
      }
    }

    const sessionUser: AuthUserSession = {
      ...userProfile,
      id: userProfile.karyawanId || userProfile.uid || `emp_${userProfile.username}`,
      uid: authUser.uid
    };

    // 5. Store session state in LocalStorage for app-wide compatibility
    try {
      localStorage.setItem("user_role", userProfile.role);
      const branchKey = params.branchStorageKey || "current_branch";
      localStorage.setItem(branchKey, userProfile.cabang);
      localStorage.setItem("current_branch", userProfile.cabang);

      if (userProfile.role === "employee") {
        const storageKey = params.storageKey || "absensi_user";
        localStorage.setItem(storageKey, JSON.stringify(sessionUser));
        if (storageKey !== "absensi_user") {
          localStorage.setItem("absensi_user", JSON.stringify(sessionUser));
        }
      }
    } catch (storageErr) {
      console.warn("Storage warning in webview:", storageErr);
    }

    return {
      success: true,
      user: sessionUser,
      authUser,
      profile: userProfile
    };
  } catch (error: unknown) {
    console.error("Login error:", error);
    const fbErr = error as FirebaseErrorLike;
    let errorMessage = "Terjadi kesalahan saat memproses login. Periksa koneksi internet Anda.";
    if (fbErr?.code === "auth/invalid-credential" || fbErr?.code === "auth/wrong-password" || fbErr?.code === "auth/user-not-found") {
      errorMessage = "Username atau Password salah.";
    } else if (fbErr?.code === "auth/network-request-failed") {
      errorMessage = "Gagal terhubung ke server Firebase. Cek koneksi internet Anda.";
    } else if (fbErr?.code === "auth/too-many-requests") {
      errorMessage = "Terlalu banyak percobaan login gagal. Silakan tunggu beberapa saat.";
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Helper to check Firestore database if account exists and auto-provision it to Firebase Auth.
 */
async function checkAndMigrateFirestoreUserToAuth(
  username: string,
  rawPass: string,
  _expectedRole?: "owner" | "admin" | "employee",
  expectedBranch?: BranchId
): Promise<{ success: boolean; error?: string }> {
  const inputUser = username.trim().toLowerCase();
  const inputPass = rawPass.trim();

  // A. Check Owner Credentials (Unified & Branch Aliases)
  const ownerConfigs = [
    { username: "owner", pass: "ownerzona", role: "owner", cabang: "all", nama: "Owner Zona Waktu Group" },
    { username: "ownerzona", pass: "ownerzona", role: "owner", cabang: "all", nama: "Owner Zona Waktu Group" },
    { username: "zonagdm", pass: "ownerzona", role: "owner", cabang: "gdm", nama: "Owner Zona Waktu GDM" },
    { username: "zonakdrj", pass: "ownerzona", role: "owner", cabang: "kedungreja", nama: "Owner Zona Waktu Kedungreja" },
    { username: "zonakedungreja", pass: "ownerzona", role: "owner", cabang: "kedungreja", nama: "Owner Zona Waktu Kedungreja" },
    { username: "tehgdm", pass: "ownerteh", role: "owner", cabang: "tehwarga", nama: "Owner Teh Warga GDM" },
    { username: "tehwargagdm", pass: "ownerteh", role: "owner", cabang: "tehwarga", nama: "Owner Teh Warga GDM" },
  ];

  const matchedOwner = ownerConfigs.find(o => o.username === inputUser && o.pass === inputPass);
  if (matchedOwner) {
    await provisionAuthUserWithoutSessionSwitch(inputUser, inputPass, {
      nama: matchedOwner.nama,
      role: "owner",
      cabang: matchedOwner.cabang as BranchId,
      status: "aktif"
    });
    return { success: true };
  }

  // B. Check Admin Credentials from Firestore (Unified & Branch Aliases)
  if ((inputUser === "admin" || inputUser === "adminzona") && (inputPass === "admin00" || inputPass === "admin")) {
    await provisionAuthUserWithoutSessionSwitch(inputUser, inputPass, {
      nama: "Admin Zona Waktu Group",
      role: "admin",
      cabang: "all",
      status: "aktif"
    });
    return { success: true };
  }

  const adminDocNames = [
    { docId: "admin_gdm", cabang: "gdm", defaultUser: "adminzona", defaultPass: "admin00", nama: "Admin Gandrungmangu" },
    { docId: "admin_kedungreja", cabang: "kedungreja", defaultUser: "adminkedungreja", defaultPass: "admin00", nama: "Admin Kedungreja" },
    { docId: "admin_tehwarga", cabang: "tehwarga", defaultUser: "admintehwarga", defaultPass: "admin00", nama: "Admin Teh Warga" },
    { docId: "admin", cabang: "gdm", defaultUser: "adminzona", defaultPass: "admin00", nama: "Admin Zona Waktu" },
  ];

  for (const item of adminDocNames) {
    try {
      const snap = await getDoc(doc(db, "employee_credentials", item.docId));
      let targetU = item.defaultUser;
      let targetP = item.defaultPass;
      if (snap.exists()) {
        const d = snap.data();
        if (d.username) targetU = d.username;
        if (d.password) targetP = d.password;
      }
      if (targetU.toLowerCase() === inputUser && targetP === inputPass) {
        await provisionAuthUserWithoutSessionSwitch(inputUser, inputPass, {
          nama: item.nama,
          role: "admin",
          cabang: item.cabang as BranchId,
          status: "aktif"
        });
        return { success: true };
      }
    } catch {}
  }

  // C. Check Karyawan collection
  try {
    const kSnap = await getDocs(collection(db, "karyawan"));
    const foundK = kSnap.docs.find(d => {
      const dData = d.data();
      return (
        String(dData.username || "").trim().toLowerCase() === inputUser &&
        String(dData.password || "").trim() === inputPass
      );
    });

    if (foundK) {
      const dData = foundK.data();
      const cabang = normalizeBranchId(dData.cabang || expectedBranch || "gdm");
      await provisionAuthUserWithoutSessionSwitch(inputUser, inputPass, {
        nama: dData.nama || inputUser,
        role: "employee",
        cabang,
        karyawanId: foundK.id,
        status: dData.status === "nonaktif" ? "nonaktif" : "aktif"
      });
      return { success: true };
    }
  } catch {}

  // D. Check employee_credentials documents
  const credDocNames = [
    "system_logins_gdm", "logins_gdm", "absensi_logins_gdm", "logins",
    "system_logins_kedungreja", "logins_kedungreja", "absensi_logins_kedungreja",
    "system_logins_tehwarga", "logins_tehwarga", "absensi_logins_tehwarga"
  ];

  for (const docName of credDocNames) {
    try {
      const snap = await getDoc(doc(db, "employee_credentials", docName));
      if (snap.exists()) {
        const rawUsers = (snap.data().users || []) as Array<Record<string, unknown>>;
        const found = rawUsers.find((u) => 
          String(u.username || "").trim().toLowerCase() === inputUser &&
          String(u.password || "").trim() === inputPass
        );
        if (found) {
          const cabang = normalizeBranchId((found.cabang as string) || (docName.includes("kedungreja") ? "kedungreja" : docName.includes("tehwarga") ? "tehwarga" : "gdm"));
          await provisionAuthUserWithoutSessionSwitch(inputUser, inputPass, {
            nama: (found.nama as string) || inputUser,
            role: "employee",
            cabang,
            karyawanId: (found.id as string) || null,
            status: "aktif"
          });
          return { success: true };
        }
      }
    } catch {}
  }

  return { success: false };
}

/**
 * Resolve UserProfile from Firestore
 */
async function resolveUserProfile(
  username: string,
  fallbackRole?: "owner" | "admin" | "employee",
  fallbackBranch?: BranchId
): Promise<UserProfile> {
  const email = formatAuthEmail(username);
  const docKey = email.replace(/[^a-z0-9]/g, "_");

  try {
    const userDoc = await getDoc(doc(db, "users", docKey));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        uid: userDoc.id,
        username: data.username || username,
        nama: data.nama || username,
        email: data.email || email,
        role: data.role || fallbackRole || "employee",
        cabang: normalizeBranchId(data.cabang || fallbackBranch || "gdm"),
        status: data.status || "aktif",
        karyawanId: data.karyawanId
      };
    }
  } catch {}

  // Fallback defaults if doc not yet created
  let defaultRole: "owner" | "admin" | "employee" = fallbackRole || "employee";
  const lower = username.toLowerCase();
  if (lower.startsWith("owner") || lower.startsWith("zona") || lower.startsWith("teh")) {
    defaultRole = fallbackRole || (lower.includes("admin") ? "admin" : "owner");
  } else if (lower.startsWith("admin")) {
    defaultRole = "admin";
  }

  return {
    username,
    nama: username,
    email,
    role: defaultRole,
    cabang: normalizeBranchId(fallbackBranch || "gdm"),
    status: "aktif"
  };
}

/**
 * Sync all accounts (Owner, Admin, and Karyawan) into Firebase Authentication.
 */
export async function syncAllAccountsToFirebaseAuth(
  firestoreDb: Firestore,
  extraUsers?: Array<{
    username: string;
    password?: string;
    nama?: string;
    role?: "owner" | "admin" | "employee";
    cabang?: BranchId;
  }>
): Promise<{
  success: boolean;
  totalSynced: number;
  syncedCount: number;
  details: string[];
  errors: string[];
  error?: string;
}> {
  const details: string[] = [];
  const errors: string[] = [];
  let totalSynced = 0;

  try {
    const usersMap = new Map<string, {
      username: string;
      password: string;
      nama: string;
      role: "owner" | "admin" | "employee";
      cabang: BranchId;
      karyawanId?: string;
      status?: "aktif" | "nonaktif";
    }>();

    // 1. Sync Default Owner Accounts (Unified & Branch Aliases)
    const defaultOwners = [
      { username: "owner", pass: "ownerzona", nama: "Owner Zona Waktu Group", cabang: "all" },
      { username: "ownerzona", pass: "ownerzona", nama: "Owner Zona Waktu Group", cabang: "all" },
      { username: "zonagdm", pass: "ownerzona", nama: "Owner Zona Gandrungmangu", cabang: "gdm" },
      { username: "zonakdrj", pass: "ownerzona", nama: "Owner Zona Kedungreja", cabang: "kedungreja" },
      { username: "zonakedungreja", pass: "ownerzona", nama: "Owner Zona Kedungreja", cabang: "kedungreja" },
      { username: "tehgdm", pass: "ownerteh", nama: "Owner Teh Warga Gandrungmangu", cabang: "tehwarga" },
      { username: "tehwargagdm", pass: "ownerteh", nama: "Owner Teh Warga Gandrungmangu", cabang: "tehwarga" },
    ];

    for (const owner of defaultOwners) {
      usersMap.set(owner.username.toLowerCase(), {
        username: owner.username.toLowerCase(),
        password: owner.pass,
        nama: owner.nama,
        role: "owner",
        cabang: owner.cabang as BranchId,
        status: "aktif"
      });
    }

    // 2. Sync Admin Accounts Defaults (Unified & Branch Aliases)
    usersMap.set("admin", {
      username: "admin",
      password: "admin00",
      nama: "Admin Zona Waktu Group",
      role: "admin",
      cabang: "all" as BranchId,
      status: "aktif"
    });

    const adminDocs = [
      { docId: "admin_gdm", defaultUser: "adminzona", defaultPass: "admin00", cabang: "gdm", nama: "Admin Gandrungmangu" },
      { docId: "admin_kedungreja", defaultUser: "adminkedungreja", defaultPass: "admin00", cabang: "kedungreja", nama: "Admin Kedungreja" },
      { docId: "admin_tehwarga", defaultUser: "admintehwarga", defaultPass: "admin00", cabang: "tehwarga", nama: "Admin Teh Warga" },
      { docId: "admin", defaultUser: "adminzona", defaultPass: "admin00", cabang: "gdm", nama: "Admin Zona Waktu" },
    ];

    for (const adm of adminDocs) {
      let u = adm.defaultUser;
      let p = adm.defaultPass;
      try {
        const snap = await getDoc(doc(firestoreDb, "employee_credentials", adm.docId));
        if (snap.exists()) {
          const d = snap.data();
          if (d.username) u = d.username;
          if (d.password) p = d.password;
        }
      } catch {}

      usersMap.set(u.toLowerCase(), {
        username: u.toLowerCase(),
        password: p || "admin00",
        nama: adm.nama,
        role: "admin",
        cabang: adm.cabang as BranchId,
        status: "aktif"
      });
    }

    // 3. Sync Karyawan from master 'karyawan' collection
    try {
      const kSnap = await getDocs(collection(firestoreDb, "karyawan"));
      for (const kDoc of kSnap.docs) {
        const kData = kDoc.data();
        const username = String(kData.username || kData.user || "").trim().toLowerCase();
        const password = String(kData.password || kData.pass || kData.pin || "123456").trim();
        const nama = String(kData.nama || kData.name || username).trim();
        const cabang = normalizeBranchId(kData.cabang || "gdm");

        if (username) {
          usersMap.set(username, {
            username,
            password: password || "123456",
            nama: nama || username,
            role: "employee",
            cabang,
            karyawanId: kDoc.id,
            status: kData.status === "nonaktif" ? "nonaktif" : "aktif"
          });
        }
      }
    } catch (kErr) {
      console.warn("Warning reading karyawan collection in syncAllAccounts:", kErr);
    }

    // 4. Dynamic Scan of ALL documents in 'employee_credentials' collection
    try {
      const allCredSnap = await getDocs(collection(firestoreDb, "employee_credentials"));
      for (const cDoc of allCredSnap.docs) {
        const cData = cDoc.data();
        const docIdLower = cDoc.id.toLowerCase();
        const branchFromDocId: BranchId = (docIdLower.includes("teh") || docIdLower.includes("warga")) 
          ? "tehwarga" 
          : (docIdLower.includes("kedungreja") || docIdLower.includes("kdrj")) 
          ? "kedungreja" 
          : "gdm";

        // Check array fields: users, karyawan, accounts, employees
        const list = (cData.users || cData.karyawan || cData.accounts || cData.employees || []) as Array<Record<string, unknown>>;
        if (Array.isArray(list)) {
          for (const u of list) {
            const cleanU = String(u.username || u.user || u.email || "").trim().toLowerCase();
            const cleanP = String(u.password || u.pass || u.pin || "").trim();
            const cleanNama = String(u.nama || u.name || cleanU).trim();
            const cleanCabang = normalizeBranchId((u.cabang as string) || branchFromDocId);
            if (cleanU) {
              const existing = usersMap.get(cleanU);
              usersMap.set(cleanU, {
                username: cleanU,
                password: cleanP || (existing?.password) || "123456",
                nama: cleanNama || existing?.nama || cleanU,
                role: (u.role === "admin" || u.role === "owner") ? (u.role as "admin" | "owner") : (existing?.role || "employee"),
                cabang: cleanCabang,
                karyawanId: (u.id as string) || existing?.karyawanId,
                status: "aktif"
              });
            }
          }
        }

        // Check if document itself has single username/password (like admin_tehwarga, admin_gdm)
        if (cData.username && !Array.isArray(cData.users)) {
          const singleU = String(cData.username).trim().toLowerCase();
          const singleP = String(cData.password || "admin00").trim();
          const singleNama = String(cData.nama || singleU).trim();
          const singleRole = (cDoc.id.includes("admin") ? "admin" : (cData.role || "employee")) as "admin" | "employee" | "owner";
          usersMap.set(singleU, {
            username: singleU,
            password: singleP,
            nama: singleNama,
            role: singleRole,
            cabang: branchFromDocId,
            status: "aktif"
          });
        }
      }
    } catch (allCredErr) {
      console.warn("Warning scanning all employee_credentials collection:", allCredErr);
    }

    // 5. Fallback scan for known credential documents
    const credDocsToScan = [
      { docId: "absensi_logins_tehwarga", branch: "tehwarga" as BranchId },
      { docId: "system_logins_tehwarga", branch: "tehwarga" as BranchId },
      { docId: "logins_tehwarga", branch: "tehwarga" as BranchId },
      { docId: "absensi_logins_teh_warga", branch: "tehwarga" as BranchId },
      { docId: "system_logins_teh_warga", branch: "tehwarga" as BranchId },
      { docId: "logins_teh_warga", branch: "tehwarga" as BranchId },
      { docId: "absensi_logins_teh_warga_gdm", branch: "tehwarga" as BranchId },
      { docId: "system_logins_teh_warga_gdm", branch: "tehwarga" as BranchId },
      { docId: "logins_teh_warga_gdm", branch: "tehwarga" as BranchId },
      { docId: "absensi_logins_kedungreja", branch: "kedungreja" as BranchId },
      { docId: "system_logins_kedungreja", branch: "kedungreja" as BranchId },
      { docId: "logins_kedungreja", branch: "kedungreja" as BranchId },
      { docId: "absensi_logins_gdm", branch: "gdm" as BranchId },
      { docId: "system_logins_gdm", branch: "gdm" as BranchId },
      { docId: "logins_gdm", branch: "gdm" as BranchId },
      { docId: "logins", branch: "gdm" as BranchId },
    ];

    for (const credItem of credDocsToScan) {
      try {
        const snap = await getDoc(doc(firestoreDb, "employee_credentials", credItem.docId));
        if (snap.exists()) {
          const rawUsers = (snap.data().users || snap.data().karyawan || snap.data().accounts || []) as Array<Record<string, unknown>>;
          for (const u of rawUsers) {
            const cleanU = String(u.username || u.user || "").trim().toLowerCase();
            const cleanP = String(u.password || u.pass || u.pin || "").trim();
            const cleanNama = String(u.nama || u.name || cleanU).trim();
            const cleanCabang = normalizeBranchId((u.cabang as string) || credItem.branch);

            if (cleanU) {
              const existing = usersMap.get(cleanU);
              usersMap.set(cleanU, {
                username: cleanU,
                password: cleanP || (existing?.password) || "123456",
                nama: cleanNama || existing?.nama || cleanU,
                role: (u.role === "admin" || u.role === "owner") ? (u.role as "admin" | "owner") : (existing?.role || "employee"),
                cabang: cleanCabang,
                karyawanId: (u.id as string) || existing?.karyawanId,
                status: "aktif"
              });
            }
          }
        }
      } catch (credReadErr) {
        console.warn(`Warning reading cred doc ${credItem.docId}:`, credReadErr);
      }
    }

    // 6. Include any in-memory extra users passed from callers
    if (extraUsers && Array.isArray(extraUsers)) {
      for (const extra of extraUsers) {
        const cleanU = String(extra.username || "").trim().toLowerCase();
        const cleanP = String(extra.password || "").trim();
        const cleanNama = String(extra.nama || cleanU).trim();
        const cleanCabang = normalizeBranchId(extra.cabang || "tehwarga");
        if (cleanU) {
          const existing = usersMap.get(cleanU);
          usersMap.set(cleanU, {
            username: cleanU,
            password: cleanP || (existing?.password) || "123456",
            nama: cleanNama || existing?.nama || cleanU,
            role: extra.role || existing?.role || "employee",
            cabang: cleanCabang,
            status: "aktif"
          });
        }
      }
    }

    // 7. Execute provisioning to Firebase Authentication
    for (const user of usersMap.values()) {
      try {
        const res = await provisionAuthUserWithoutSessionSwitch(user.username, user.password, {
          nama: user.nama,
          role: user.role,
          cabang: user.cabang,
          karyawanId: user.karyawanId,
          status: user.status || "aktif"
        });

        if (res.success) {
          totalSynced++;
          details.push(`${user.role.toUpperCase()}: ${user.username} (${user.cabang})`);
        } else {
          errors.push(`${user.username}: ${res.error}`);
        }
      } catch (userProvErr: unknown) {
        const errObj = userProvErr as Error;
        errors.push(`${user.username}: ${errObj?.message || "Gagal provision"}`);
      }
    }

    return {
      success: errors.length === 0,
      totalSynced,
      syncedCount: totalSynced,
      details,
      errors,
      error: errors.length > 0 ? `${errors.length} akun gagal disinkronkan: ${errors.slice(0, 3).join(", ")}` : undefined
    };
  } catch (err: unknown) {
    const errObj = err as Error;
    console.error("Error in syncAllAccountsToFirebaseAuth:", err);
    return {
      success: false,
      totalSynced,
      syncedCount: totalSynced,
      details,
      errors: [errObj?.message || "Terjadi kesalahan saat sinkronisasi ke Firebase Auth"],
      error: errObj?.message || "Terjadi kesalahan saat sinkronisasi ke Firebase Auth"
    };
  }
}

/**
 * Logout cleanly from Firebase Auth and clear local sessions.
 */
export async function logoutWithFirebaseAuth(extraKeys?: string[]) {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("SignOut warning:", err);
  }
  try {
    localStorage.removeItem("user_role");
    localStorage.removeItem("current_branch");
    localStorage.removeItem("absensi_user");
    localStorage.removeItem("absensi_user_gdm");
    localStorage.removeItem("absensi_user_kedungreja");
    localStorage.removeItem("absensi_user_tehwarga");
    localStorage.removeItem("karyawan_user");
    localStorage.removeItem("karyawan_user_kedungreja");
    localStorage.removeItem("karyawan_user_tehwarga");
    if (extraKeys && Array.isArray(extraKeys)) {
      extraKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
    }
  } catch {}
}
