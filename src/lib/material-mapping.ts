import { BranchId } from './branch-helper';

export interface GenericMaterial {
  id: string;
  code?: string;
  nama?: string;
  metodePembelian?: string;
  satuanBesar?: string;
  satuanKecil?: string;
  qtyKecil?: number;
  qtyBesar?: number;
  qtyKontainerBesar?: number;
  qtyKontainerKecil?: number;
  [key: string]: unknown;
}

/**
 * Normalizes material names for fuzzy matching (case-insensitive, strips extra spaces and punctuation)
 */
export function normalizeMaterialName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[_\-–—/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Common Alias Table for Shared Physical Materials between stores
 */
export const SHARED_MATERIAL_ALIASES: Array<{
  canonicalName: string;
  aliases: string[];
  gdmCode?: string;
  twCode?: string;
}> = [
  {
    canonicalName: "Gula Pasir",
    aliases: ["gula pasir", "gula", "gula pasir 1kg", "sugar"],
    gdmCode: "BB007",
    twCode: "BB-036"
  },
  {
    canonicalName: "Susu UHT",
    aliases: ["susu uht", "uht milk", "uht", "susu cair uht"],
    gdmCode: "BB030",
    twCode: "BB-030"
  },
  {
    canonicalName: "Susu Evaporasi",
    aliases: ["susu evaporasi", "evaporasi", "evaporated milk"],
    gdmCode: "BB028",
    twCode: "BB-028"
  },
  {
    canonicalName: "Susu Kental Manis",
    aliases: ["susu skm", "skm", "susu kental manis", "kental manis"],
    gdmCode: "BB029",
    twCode: "BB-029"
  },
  {
    canonicalName: "Air Galon",
    aliases: ["air galon", "galon", "air mineral galon", "air isi ulang"],
    gdmCode: "BB041",
    twCode: "BB-044"
  },
  {
    canonicalName: "Es Batu",
    aliases: ["es batu", "ice cube", "es kristal", "es"],
    gdmCode: "BB063",
    twCode: "BB-043"
  },
  {
    canonicalName: "Ovalet",
    aliases: ["ovalet", "sp", "emulsifier"],
    gdmCode: "BB009",
    twCode: "BB-034"
  },
  {
    canonicalName: "Plastik UK 15",
    aliases: ["plastik uk 15", "plastik 15", "kantong plastik 15"],
    gdmCode: "BB038",
    twCode: "BB-039"
  },
  {
    canonicalName: "Plastik UK 24",
    aliases: ["plastik uk 24", "plastik 24", "kantong plastik 24"],
    gdmCode: "BB040",
    twCode: "BB-041"
  },
  {
    canonicalName: "Tisu",
    aliases: ["tisu", "tissue", "tisu meja"],
    gdmCode: "BB059",
    twCode: "BB-059"
  },
  {
    canonicalName: "Isolatif",
    aliases: ["isolatif", "lakban", "selotip"],
    gdmCode: "BB060",
    twCode: "BB-060"
  }
];

/**
 * Smart matcher to find the corresponding material in the destination branch.
 * Handles:
 * 1. Matching by ID (if same doc)
 * 2. Matching via Shared Material Alias Table (e.g. Gula Pasir BB007 <-> BB-036)
 * 3. Matching by Normalized Name (e.g. "Susu UHT" <-> "SUSU UHT")
 * 4. Matching by Code (ONLY IF name is also a substring match, preventing BB-001 Kopi vs BB-001 Teh conflict)
 */
export function findTargetMaterialInBranch(
  sourceMaterial: GenericMaterial,
  targetBranchMaterials: GenericMaterial[],
  targetBranch: BranchId
): GenericMaterial | null {
  if (!sourceMaterial || !targetBranchMaterials || targetBranchMaterials.length === 0) {
    return null;
  }

  const srcNorm = normalizeMaterialName(sourceMaterial.nama || '');
  const srcCode = (sourceMaterial.code || '').trim().toUpperCase();

  // 1. Direct ID match
  const directIdMatch = targetBranchMaterials.find(m => m.id === sourceMaterial.id);
  if (directIdMatch && normalizeMaterialName(directIdMatch.nama || '') === srcNorm) {
    return directIdMatch;
  }

  // 2. Shared Material Alias matching
  const aliasEntry = SHARED_MATERIAL_ALIASES.find(a => 
    normalizeMaterialName(a.canonicalName) === srcNorm ||
    a.aliases.some(alias => normalizeMaterialName(alias) === srcNorm) ||
    (targetBranch === 'gdm' && a.gdmCode === srcCode) ||
    (targetBranch === 'tehwarga' && a.twCode === srcCode)
  );

  if (aliasEntry) {
    // If target is Teh Warga, check if target has twCode or matches alias
    if (targetBranch === 'tehwarga') {
      const byTwCode = aliasEntry.twCode ? targetBranchMaterials.find(m => (m.code || '').trim().toUpperCase() === aliasEntry.twCode) : null;
      if (byTwCode) return byTwCode;
    }
    // If target is Zona Waktu GDM, check by gdmCode
    if (targetBranch === 'gdm') {
      const byGdmCode = aliasEntry.gdmCode ? targetBranchMaterials.find(m => (m.code || '').trim().toUpperCase() === aliasEntry.gdmCode) : null;
      if (byGdmCode) return byGdmCode;
    }
    // Check by alias names
    const byAliasName = targetBranchMaterials.find(m => {
      const targetNorm = normalizeMaterialName(m.nama || '');
      return aliasEntry.aliases.some(alias => normalizeMaterialName(alias) === targetNorm);
    });
    if (byAliasName) return byAliasName;
  }

  // 3. Exact Normalized Name match
  const exactNameMatch = targetBranchMaterials.find(m => normalizeMaterialName(m.nama || '') === srcNorm);
  if (exactNameMatch) {
    return exactNameMatch;
  }

  // 4. Substring / Includes Name match
  const substringMatch = targetBranchMaterials.find(m => {
    const targetNorm = normalizeMaterialName(m.nama || '');
    return targetNorm.includes(srcNorm) || srcNorm.includes(targetNorm);
  });
  if (substringMatch) {
    return substringMatch;
  }

  // 5. Code match ONLY IF name also loosely aligns (prevents cross-item collision like BB-001 Kopi vs BB-001 Teh)
  const codeMatch = targetBranchMaterials.find(m => (m.code || '').trim().toUpperCase() === srcCode);
  if (codeMatch) {
    const targetNorm = normalizeMaterialName(codeMatch.nama || '');
    // If names have any common word
    const srcWords = srcNorm.split(' ').filter(w => w.length > 2);
    const hasCommonWord = srcWords.some(w => targetNorm.includes(w));
    if (hasCommonWord) {
      return codeMatch;
    }
  }

  return null;
}
