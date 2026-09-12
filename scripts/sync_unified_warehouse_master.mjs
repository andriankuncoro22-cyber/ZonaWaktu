import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyARQJvG1Lt8-NgrcGctWSso9kaHOxBDyNc",
  authDomain: "sistempakyani.firebaseapp.com",
  projectId: "sistempakyani",
  storageBucket: "sistempakyani.firebasestorage.app",
  messagingSenderId: "786197161585",
  appId: "1:786197161585:web:114536cc8aa9496be49dd0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const normalizeName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function sync() {
  console.log("=== SINKRONISASI MASTER GUDANG UTAMA GANDRUNGMANGU ===");

  const zwSnap = await getDocs(collection(db, "bahan-baku"));
  const twSnap = await getDocs(collection(db, "bahan-baku_tehwarga"));

  const zwItems = [];
  zwSnap.forEach(d => zwItems.push({ id: d.id, ...d.data() }));

  const twItems = [];
  twSnap.forEach(d => twItems.push({ id: d.id, ...d.data() }));

  console.log(`Bahan ZW: ${zwItems.length}, Bahan TW: ${twItems.length}`);

  let addedCount = 0;

  // Filter out "Pembuatan Sendiri" from adding to Gudang
  for (const tw of twItems) {
    if (tw.metodePembelian === "Pembuatan Sendiri") {
      console.log(`[SKIP OLAHAN] TW: ${tw.nama} (${tw.code})`);
      continue;
    }

    const normTwName = normalizeName(tw.nama);

    // Check if already represented in ZW / Gudang by name or alias
    const existingInGudang = zwItems.find(z => {
      const normZ = normalizeName(z.nama);
      if (normZ === normTwName) return true;
      if (normTwName.includes("gulapasir") && normZ.includes("gulapasir")) return true;
      if (normTwName.includes("susuuht") && normZ.includes("susuuht")) return true;
      if (normTwName.includes("susuevaporasi") && normZ.includes("susuevaporasi")) return true;
      if (normTwName.includes("esbatu") && normZ.includes("esbatu")) return true;
      if (normTwName.includes("airgalon") && normZ.includes("airgalon")) return true;
      if (normTwName.includes("ovalet") && normZ.includes("ovalet")) return true;
      return false;
    });

    if (existingInGudang) {
      console.log(`[SUDAH ADA DI GUDANG (SHARED)] TW "${tw.nama}" cocok dengan Gudang "${existingInGudang.nama}" (${existingInGudang.code})`);
    } else {
      // It's an exclusive TW physical item! Ensure it exists in Gudang collection
      // Check if doc ID exists in bahan-baku
      const existingDoc = await getDoc(doc(db, "bahan-baku", tw.id));
      if (!existingDoc.exists()) {
        console.log(`[MENAMBAHKAN KE GUDANG GDM] TW "${tw.nama}" (${tw.code})`);
        
        // Give it a safe code if code conflicts with an existing ZW item
        let finalCode = tw.code;
        const codeConflict = zwItems.find(z => (z.code || '').trim().toUpperCase() === (tw.code || '').trim().toUpperCase());
        if (codeConflict) {
          finalCode = `TW-${tw.code.replace(/^BB-?/, '')}`;
          console.log(`  -> Ubah kode Gudang untuk menghindari bentrok: ${tw.code} -> ${finalCode}`);
        }

        const newGudangDoc = {
          ...tw,
          code: finalCode,
          originalTwCode: tw.code,
          isFromTehWarga: true,
          qtyBesar: 0,
          qtyGudangKecil: 0,
          qtyKontainerBesar: 0,
          qtyKontainerKecil: 0,
        };

        await setDoc(doc(db, "bahan-baku", tw.id), newGudangDoc);
        addedCount++;
      } else {
        console.log(`[SUDAH TERCATAT DI GUDANG] ID: ${tw.id} ("${tw.nama}")`);
      }
    }
  }

  console.log(`\nSinkronisasi selesai! Menambahkan ${addedCount} bahan unik Teh Warga ke Gudang Utama GDM.`);
  process.exit(0);
}

sync();
