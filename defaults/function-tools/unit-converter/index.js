/**
 * defaults/function-tools/unit-converter/index.js
 * ---------------------------------------------------------------------------
 * EXAMPLE: OpenAI Function Calling — Unit Converter
 *
 * This function tool demonstrates a lookup-table implementation pattern:
 * no external libraries, no network calls, pure deterministic computation.
 *
 * ── Why a function tool instead of asking the LLM? ───────────────────────
 * LLMs are probabilistic. For exact unit conversions the model might:
 *   - Round incorrectly (1 mile ≠ 1.609 km, it is exactly 1.60934 km)
 *   - Mix up similar units (fluid ounces vs weight ounces)
 *   - Hallucinate obscure conversions
 *
 * A function tool guarantees deterministic, correct results every time.
 * This is the primary use case for function calling: tasks where accuracy
 * matters more than fluency.
 *
 * ── Conversion strategy ──────────────────────────────────────────────────
 * All conversions go through a "base unit" for each category:
 *   length      → metres
 *   mass        → kilograms
 *   temperature → special case (linear transform, not ratio)
 *   data        → bytes
 *
 * To convert A → B:
 *   1. Convert A → base unit using TO_BASE[A]
 *   2. Convert base unit → B using FROM_BASE[B]
 *
 * This O(1) lookup table approach is simpler and less error-prone than
 * maintaining a full N×N conversion matrix.
 */

'use strict';

// ── Length conversions (base: metre) ─────────────────────────────────────
const LENGTH_TO_M = {
  m: 1, metre: 1, metres: 1, meter: 1, meters: 1,
  km: 1000, kilometre: 1000, kilometres: 1000, kilometer: 1000, kilometers: 1000,
  cm: 0.01, centimetre: 0.01, centimeter: 0.01,
  mm: 0.001, millimetre: 0.001, millimeter: 0.001,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  yd: 0.9144, yard: 0.9144, yards: 0.9144,
};

// ── Mass conversions (base: kilogram) ────────────────────────────────────
const MASS_TO_KG = {
  kg: 1, kilogram: 1, kilograms: 1,
  g: 0.001, gram: 0.001, grams: 0.001,
  mg: 0.000001, milligram: 0.000001, milligrams: 0.000001,
  t: 1000, tonne: 1000, tonnes: 1000, 'metric ton': 1000,
  lb: 0.453592, pound: 0.453592, pounds: 0.453592, lbs: 0.453592,
  oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495,
};

// ── Data size conversions (base: byte) ───────────────────────────────────
const DATA_TO_BYTES = {
  b: 1, byte: 1, bytes: 1,
  kb: 1024, kilobyte: 1024, kilobytes: 1024,
  mb: 1048576, megabyte: 1048576, megabytes: 1048576,
  gb: 1073741824, gigabyte: 1073741824, gigabytes: 1073741824,
  tb: 1099511627776, terabyte: 1099511627776, terabytes: 1099511627776,
};

/**
 * Identify which category a unit belongs to.
 * Returns 'length' | 'mass' | 'temperature' | 'data' | null
 */
function getCategory(unit) {
  const u = unit.toLowerCase();
  if (u in LENGTH_TO_M) return 'length';
  if (u in MASS_TO_KG)  return 'mass';
  if (u in DATA_TO_BYTES) return 'data';
  if (['c', 'f', 'k', 'celsius', 'fahrenheit', 'kelvin'].includes(u)) return 'temperature';
  return null;
}

/**
 * Convert a value between two units in the same category.
 * Temperature is a special case because it uses an offset (not just a ratio).
 */
function convert(value, fromUnit, toUnit) {
  const from = fromUnit.toLowerCase();
  const to   = toUnit.toLowerCase();

  // ── Temperature (special case: not a simple ratio) ──────────────────
  if (getCategory(from) === 'temperature') {
    // Step 1: convert to Celsius as the intermediate base
    let celsius;
    if (['c', 'celsius'].includes(from)) {
      celsius = value;
    } else if (['f', 'fahrenheit'].includes(from)) {
      celsius = (value - 32) * 5 / 9;
    } else if (['k', 'kelvin'].includes(from)) {
      celsius = value - 273.15;
    } else {
      throw new Error(`Unknown temperature unit: "${fromUnit}"`);
    }

    // Step 2: convert from Celsius to target
    if (['c', 'celsius'].includes(to)) return celsius;
    if (['f', 'fahrenheit'].includes(to)) return celsius * 9 / 5 + 32;
    if (['k', 'kelvin'].includes(to)) return celsius + 273.15;
    throw new Error(`Unknown temperature unit: "${toUnit}"`);
  }

  // ── All other categories: use base-unit lookup tables ───────────────
  let table;
  if (getCategory(from) === 'length')  table = LENGTH_TO_M;
  else if (getCategory(from) === 'mass') table = MASS_TO_KG;
  else if (getCategory(from) === 'data') table = DATA_TO_BYTES;
  else throw new Error(`Unrecognised unit: "${fromUnit}"`);

  const fromFactor = table[from];
  const toFactor   = table[to];

  if (!fromFactor) throw new Error(`Unknown unit: "${fromUnit}"`);
  if (!toFactor)   throw new Error(`Unknown unit: "${toUnit}" (or it belongs to a different category than "${fromUnit}")`);

  // Convert: value × (from → base) ÷ (to → base)
  return value * fromFactor / toFactor;
}

module.exports = {
  /**
   * unit_converter({ value, from_unit, to_unit }) → conversion result
   */
  async unit_converter({ value, from_unit, to_unit }) {
    if (typeof value !== 'number') throw new Error('value must be a number');
    if (!from_unit || !to_unit) throw new Error('from_unit and to_unit are required');

    const fromCat = getCategory(from_unit.toLowerCase());
    const toCat   = getCategory(to_unit.toLowerCase());

    if (!fromCat) throw new Error(`Unrecognised unit: "${from_unit}". Supported: length (m/km/ft/in/mi/cm), mass (kg/g/lb/oz), temperature (C/F/K), data (B/KB/MB/GB/TB)`);
    if (!toCat)   throw new Error(`Unrecognised unit: "${to_unit}"`);
    if (fromCat !== toCat) throw new Error(`Cannot convert between different categories: "${from_unit}" (${fromCat}) and "${to_unit}" (${toCat})`);

    const result = convert(value, from_unit, to_unit);

    // Round to at most 10 significant figures to avoid floating-point noise
    const rounded = parseFloat(result.toPrecision(10));

    return {
      value,
      from_unit,
      to_unit,
      result: rounded,
      category: fromCat,
      summary: `${value} ${from_unit} = ${rounded} ${to_unit}`,
    };
  },
};
