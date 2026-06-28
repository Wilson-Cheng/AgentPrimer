/**
 * defaults/function-tools/random-data/index.js
 * ---------------------------------------------------------------------------
 * EXAMPLE: OpenAI Function Calling — Random Data Generator
 *
 * This function tool demonstrates the "count + options" pattern — a common
 * design for generator functions that can return one or many items.
 *
 * ── Why determinism matters here ─────────────────────────────────────────
 * An LLM generating "random" UUIDs or hex colours will produce plausible-
 * looking but NOT cryptographically random values. They may:
 *   - Re-use the same UUID across multiple calls (training data bias)
 *   - Generate hex values that cluster around common colour names
 *   - Produce predictable "random" sequences
 *
 * This function tool uses Node's crypto module for true randomness — a
 * perfect example of when a function tool beats asking the model directly.
 *
 * ── Design patterns shown ────────────────────────────────────────────────
 *   1. Input validation with clear error messages
 *   2. Default values for optional parameters
 *   3. Count-based generation (loop + collect)
 *   4. Returning both the raw array and a formatted summary
 *   5. Using Node built-ins (crypto, Math.random) — no external deps
 */

'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
// This file runs as a CommonJS module inside the function-tool-worker
// subprocess, not inside Next.js/ESM. require() is the correct loader here.

const { randomUUID, randomBytes } = require('crypto');

// ── Word bank for Lorem Ipsum generation ────────────────────────────────
const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam',
  'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
  'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'reprehenderit',
  'voluptate', 'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur',
  'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt',
  'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est',
];

// ── First and last name banks ────────────────────────────────────────────
const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Elena', 'Frank', 'Grace', 'Henry',
  'Isabella', 'James', 'Katherine', 'Liam', 'Maya', 'Noah', 'Olivia',
  'Patrick', 'Quinn', 'Rachel', 'Samuel', 'Tara', 'Ursula', 'Victor',
  'Wendy', 'Xavier', 'Yuki', 'Zara',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Young', 'Lee', 'Walker', 'Hall',
  'Allen', 'King', 'Wright', 'Scott', 'Green',
];

/** Pick a random element from an array using crypto randomness */
function pick(arr) {
  const idx = randomBytes(4).readUInt32BE(0) % arr.length;
  return arr[idx];
}

/** Generate a random integer in [min, max] using crypto randomness */
function randInt(min, max) {
  const range = max - min + 1;
  // Use rejection sampling to avoid modulo bias
  const bytes = Math.ceil(Math.log2(range) / 8) + 1;
  let n;
  do {
    n = randomBytes(bytes).readUIntBE(0, bytes);
  } while (n >= Math.floor(Number.MAX_SAFE_INTEGER / range) * range);
  return min + (n % range);
}

// ── Generator functions (one per type) ──────────────────────────────────

function generateUUID() {
  return randomUUID();
}

function generateName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function generateEmail() {
  const first = pick(FIRST_NAMES).toLowerCase();
  const last  = pick(LAST_NAMES).toLowerCase();
  const domains = ['example.com', 'test.org', 'sample.net', 'demo.io'];
  const separators = ['.', '_', ''];
  const sep = separators[randInt(0, separators.length - 1)];
  return `${first}${sep}${last}@${pick(domains)}`;
}

function generateColor() {
  const r = randomBytes(1)[0].toString(16).padStart(2, '0');
  const g = randomBytes(1)[0].toString(16).padStart(2, '0');
  const b = randomBytes(1)[0].toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function generateInteger(min = 0, max = 1000) {
  if (min > max) throw new Error(`min (${min}) must be ≤ max (${max})`);
  return randInt(min, max);
}

function generateLorem(wordCount = 20) {
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(pick(LOREM_WORDS));
  }
  // Capitalise first word, add period at end
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}

module.exports = {
  /**
   * random_data({ type, count, options }) → { type, count, items, summary }
   */
  async random_data({ type, count = 1, options = {} }) {
    const validTypes = ['uuid', 'name', 'email', 'color', 'integer', 'lorem'];
    if (!validTypes.includes(type)) {
      throw new Error(`Unknown type: "${type}". Supported types: ${validTypes.join(', ')}`);
    }

    const n = Math.min(Math.max(1, Math.floor(count)), 20); // clamp 1–20

    const items = [];
    for (let i = 0; i < n; i++) {
      switch (type) {
        case 'uuid':    items.push(generateUUID()); break;
        case 'name':    items.push(generateName()); break;
        case 'email':   items.push(generateEmail()); break;
        case 'color':   items.push(generateColor()); break;
        case 'integer': items.push(generateInteger(options.min, options.max)); break;
        case 'lorem':   items.push(generateLorem(options.words)); break;
      }
    }

    return {
      type,
      count: n,
      items,
      // Convenience: single string when only one item was requested
      value: n === 1 ? items[0] : undefined,
      summary: n === 1
        ? `Generated ${type}: ${items[0]}`
        : `Generated ${n} ${type} values`,
    };
  },
};
