import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function scan() {
  console.log("=== SCANNING MASTER BAHAN BAKU ===");
  
  const cols = [
    { name: "Zona Waktu GDM (bahan-baku)", id: "bahan-baku" },
    { name: "Teh Warga GDM (bahan-baku_tehwarga)", id: "bahan-baku_tehwarga" },
    { name: "Kedungreja (bahan-baku_kdrj)", id: "bahan-baku_kdrj" }
  ];

  const allData = {};

  for (const c of cols) {
    try {
      const snap = await getDocs(collection(db, c.id));
      const items = [];
      snap.forEach(doc => {
        const d = doc.data();
        items.push({
          id: doc.id,
          code: d.code || "-",
          nama: d.nama || "-",
          metode: d.metodePembelian || "-",
          satuanBesar: d.satuanBesar || "-",
          satuanKecil: d.satuanKecil || "-",
          qtyKecil: d.qtyKecil || 1,
          qtyBesar: d.qtyBesar || 0,
          qtyKontainerBesar: d.qtyKontainerBesar || 0,
          qtyKontainerKecil: d.qtyKontainerKecil || 0
        });
      });
      items.sort((a,b) => (a.code || "").localeCompare(b.code || ""));
      allData[c.id] = items;
      console.log(`\n======================================================`);
      console.log(`KOLEKSI: ${c.name} (Total: ${items.length} bahan)`);
      console.log(`======================================================`);
      items.forEach(it => {
        console.log(`[${it.code}] ${it.nama.padEnd(30)} | Metode: ${it.metode.padEnd(18)} | Gudang: ${it.qtyBesar} ${it.satuanBesar} | Kontainer: ${it.qtyKontainerBesar} ${it.satuanBesar} & ${it.qtyKontainerKecil} ${it.satuanKecil}`);
      });
    } catch (err) {
      console.error(`Error scanning ${c.id}:`, err.message);
    }
  }

  // Cross-analysis between ZW GDM and TW GDM
  console.log(`\n======================================================`);
  console.log(`ANALISIS KORELASI ZONA WAKTU GDM vs TEH WARGA GDM`);
  console.log(`======================================================`);
  const zw = allData["bahan-baku"] || [];
  const tw = allData["bahan-baku_tehwarga"] || [];

  console.log(`\n--- BAHAN METODE PEMBUATAN SENDIRI (TIDAK PERLU GUDANG UTAMA) ---`);
  const zwSelf = zw.filter(i => i.metode === "Pembuatan Sendiri");
  const twSelf = tw.filter(i => i.metode === "Pembuatan Sendiri");
  console.log(`ZW Pembuatan Sendiri (${zwSelf.length}):`, zwSelf.map(i => `${i.code}: ${i.nama}`).join(", "));
  console.log(`TW Pembuatan Sendiri (${twSelf.length}):`, twSelf.map(i => `${i.code}: ${i.nama}`).join(", "));

  console.log(`\n--- BAHAN FISIK / SUPLIYER / BELI SENDIRI DI ZW GDM (${zw.length - zwSelf.length}) ---`);
  zw.filter(i => i.metode !== "Pembuatan Sendiri").forEach(i => {
    // Check if matching in TW by name or code
    const matchName = tw.find(t => t.nama.trim().toLowerCase() === i.nama.trim().toLowerCase());
    const matchCode = tw.find(t => t.code.trim().toLowerCase() === i.code.trim().toLowerCase());
    if (matchName) {
      console.log(`[DUPLIKAT/BERSAMA] ZW: "${i.nama}" (${i.code}) <==> TW: "${matchName.nama}" (${matchName.code})`);
    } else if (matchCode) {
      console.log(`[KODE SAMA BEDA NAMA] Kode "${i.code}" di ZW="${i.nama}" vs TW="${matchCode.nama}"`);
    } else {
      console.log(`[EKSLUSIF ZW] "${i.nama}" (${i.code}) - ${i.metode}`);
    }
  });

  console.log(`\n--- BAHAN FISIK / SUPLIYER / BELI SENDIRI DI TEH WARGA GDM (${tw.length - twSelf.length}) ---`);
  tw.filter(i => i.metode !== "Pembuatan Sendiri").forEach(i => {
    const matchName = zw.find(z => z.nama.trim().toLowerCase() === i.nama.trim().toLowerCase());
    if (!matchName) {
      console.log(`[EKSLUSIF TW] "${i.nama}" (${i.code}) - ${i.metode}`);
    }
  });

  process.exit(0);
}

scan();
