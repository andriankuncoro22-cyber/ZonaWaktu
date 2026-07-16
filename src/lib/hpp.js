export function getTotalAvailableQty(material) {
  if (!material) return 0;

  const qtyBesar = Number(material.qtyBesar || 0);
  const qtyGudangKecil = Number(material.qtyGudangKecil || 0);
  const qtyKontainerBesar = Number(material.qtyKontainerBesar || 0);
  const qtyKontainerKecil = Number(material.qtyKontainerKecil || 0);
  const conversionRate = Number(material.qtyKecil || 1);

  return (qtyBesar + qtyKontainerBesar) * conversionRate + qtyGudangKecil + qtyKontainerKecil;
}

export function getAverageCost(material) {
  if (!material) return 0;
  const stockValue = Number(material.stockValue || 0);
  const totalQty = getTotalAvailableQty(material);
  if (totalQty > 0) {
    return stockValue / totalQty;
  }
  return Number(material.avgPrice || material.hargaRataRata || 0);
}

export function calculateRecipeIngredientCost(ingredient, material, soldQty = 1) {
  const qtyNeeded = Number(ingredient?.jumlah || 0);
  const conversionRate = Number(material?.qtyKecil || 1);
  const unitPrice = Number(material?.currentPrice ?? material?.avgPrice ?? material?.hargaBeliSatuanBesar ?? 0);
  const soldUnits = Number(soldQty || 0);
  const explicitPriceKecil = Number(material?.hargaSatuanKecil || 0);

  if (qtyNeeded <= 0 || soldUnits <= 0) {
    return 0;
  }

  const pricePerSmallUnit = explicitPriceKecil > 0
    ? explicitPriceKecil
    : (conversionRate > 0 ? unitPrice / conversionRate : 0);

  return qtyNeeded * soldUnits * pricePerSmallUnit;
}

export function applyPurchase(material, qty, price) {
  const purchaseQty = Number(qty || 0);
  const purchasePrice = Number(price || 0);

  if (purchaseQty <= 0 || purchasePrice < 0) {
    return {
      qty: getTotalAvailableQty(material),
      avgPrice: getAverageCost(material),
      stockValue: Number(material?.stockValue || 0),
      cost: 0,
    };
  }

  const currentQty = getTotalAvailableQty(material);
  const currentValue = Number(material?.stockValue || 0);
  const newQty = currentQty + purchaseQty;
  const newValue = currentValue + purchaseQty * purchasePrice;

  return {
    qty: newQty,
    avgPrice: newQty > 0 ? newValue / newQty : 0,
    stockValue: newValue,
    cost: purchaseQty * purchasePrice,
  };
}

export function applyPriceUpdate(material, price, priceKecilInput = null) {
  const newPrice = Number(price || 0);
  const conversionRate = Number(material?.qtyKecil || 1);
  const priceKecil = priceKecilInput !== null && priceKecilInput !== undefined
    ? Number(priceKecilInput || 0)
    : (conversionRate > 0 ? newPrice / conversionRate : 0);

  const history = Array.isArray(material?.priceHistory) ? material.priceHistory : [];
  const nextHistory = [...history, {
    price: newPrice,
    priceKecil: priceKecil,
    recordedAt: new Date().toISOString(),
    note: "Update harga bahan"
  }].slice(-10);

  return {
    currentPrice: newPrice,
    hargaSatuanKecil: priceKecil,
    avgPrice: newPrice > 0 ? newPrice : getAverageCost(material),
    avgPriceKecil: priceKecil > 0 ? priceKecil : (getAverageCost(material) / (conversionRate || 1)),
    priceHistory: nextHistory,
  };
}

export function applyUsage(material, qty) {
  const usageQty = Number(qty || 0);
  const currentQty = getTotalAvailableQty(material);

  if (usageQty <= 0) {
    return {
      qty: currentQty,
      avgPrice: getAverageCost(material),
      stockValue: Number(material?.stockValue || 0),
      cost: 0,
      insufficientStock: false,
      availableQty: currentQty,
      requiredQty: usageQty,
    };
  }

  if (currentQty < usageQty) {
    return {
      qty: 0,
      avgPrice: getAverageCost(material),
      stockValue: Number(material?.stockValue || 0),
      cost: 0,
      insufficientStock: true,
      availableQty: currentQty,
      requiredQty: usageQty,
    };
  }

  const currentAvg = getAverageCost(material);
  const currentValue = Number(material?.stockValue || 0);
  const cost = usageQty * currentAvg;
  const newQty = currentQty - usageQty;
  const newValue = currentValue - cost;

  return {
    qty: newQty,
    avgPrice: newQty > 0 ? newValue / newQty : 0,
    stockValue: newValue,
    cost,
    insufficientStock: false,
    availableQty: currentQty,
    requiredQty: usageQty,
  };
}
