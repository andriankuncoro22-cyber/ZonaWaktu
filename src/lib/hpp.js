export function getTotalAvailableQty(material) {
  if (!material) return 0;

  const qtyBesar = Number(material.qtyBesar || 0);
  const qtyKontainerBesar = Number(material.qtyKontainerBesar || 0);
  const qtyKontainerKecil = Number(material.qtyKontainerKecil || 0);
  const conversionRate = Number(material.qtyKecil || 1);

  return (qtyBesar + qtyKontainerBesar) * conversionRate + qtyKontainerKecil;
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

export function applyPriceUpdate(material, price) {
  const newPrice = Number(price || 0);
  const history = Array.isArray(material?.priceHistory) ? material.priceHistory : [];
  const nextHistory = [...history, {
    price: newPrice,
    recordedAt: new Date().toISOString(),
    note: "Update harga bahan"
  }].slice(-10);

  return {
    currentPrice: newPrice,
    avgPrice: newPrice > 0 ? newPrice : getAverageCost(material),
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
