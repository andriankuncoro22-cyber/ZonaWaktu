const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/lib/hpp.js'), 'utf8');
const transformed = source.replace(/export function/g, 'function');

const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(`${transformed}\nmodule.exports = { getTotalAvailableQty, getAverageCost, applyPurchase, applyPriceUpdate, applyUsage, calculateRecipeIngredientCost };`, context);
const { applyUsage, calculateRecipeIngredientCost } = context.module.exports;

test('applyUsage respects container conversion when calculating available stock', () => {
  const material = {
    qtyBesar: 2,
    qtyKontainerBesar: 1,
    qtyKontainerKecil: 0,
    qtyKecil: 10,
    stockValue: 300,
  };

  const result = applyUsage(material, 15);

  assert.equal(result.qty, 15);
  assert.equal(result.cost, 150);
  assert.equal(result.stockValue, 150);
  assert.equal(result.availableQty, 30);
  assert.equal(result.requiredQty, 15);
});

test('calculateRecipeIngredientCost converts big-unit price to small-unit cost', () => {
  const material = {
    currentPrice: 10000,
    qtyKecil: 10,
  };

  const cost = calculateRecipeIngredientCost({ jumlah: 2 }, material, 5);

  assert.equal(cost, 10000);
});
