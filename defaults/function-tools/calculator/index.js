/**
 * defaults/function-tools/calculator/index.js
 * ---------------------------------------------------------------------------
 * EXAMPLE: OpenAI Function Calling — Calculator
 *
 * This file demonstrates the implementation side of an OpenAI function tool.
 *
 * ── How function calling works (the full lifecycle) ──────────────────────
 *
 *   1. DEFINE   You describe the function in function.json (JSON Schema).
 *               The model reads this schema to know WHEN and HOW to call it.
 *
 *   2. DETECT   During a chat completion, if the model decides the user's
 *               request matches this function, it returns:
 *               finish_reason = "tool_calls"
 *               with arguments already formatted as JSON.
 *
 *   3. EXECUTE  Your code (this file) runs the function with those arguments
 *               in a subprocess (see lib/function-tools-loader.ts).
 *
 *   4. FEED BACK The result is appended as a { role: "tool" } message and
 *                the model is called again to produce the final answer.
 *
 * ── Security note ────────────────────────────────────────────────────────
 * We NEVER use eval() or new Function() with arbitrary user input.
 * This implementation uses a whitelist regex to permit only digits,
 * arithmetic operators, and parentheses — nothing else can execute.
 *
 * ── Subprocess contract ─────────────────────────────────────────────────
 * This module is require()'d by lib/function-tool-worker.js inside a child process.
 * It must export an object where:
 *   - each key is a function name (matching the name in function.json)
 *   - each value is an async function(args) → result
 */

'use strict';

/**
 * Safely evaluate a mathematical expression.
 * Only allows: digits, decimal points, +, -, *, /, **, %, (, ), and whitespace.
 */
function safeMathEval(expression) {
  // Whitelist: only allow characters that appear in arithmetic expressions.
  // This prevents any code injection (no letters = no variable names = no calls).
  const sanitized = expression.trim();
  if (!/^[\d\s+\-*/.%()^]+$/.test(sanitized)) {
    throw new Error(
      `Invalid expression: "${sanitized}". ` +
        'Only numbers, arithmetic operators (+, -, *, /, **, %), and parentheses are allowed.',
    );
  }

  // Replace ^ with ** to support both notations
  const normalized = sanitized.replace(/\^/g, '**');

  // Use the Function constructor to evaluate the expression in a restricted scope.
  // This is safe because we've already whitelisted the allowed characters above.
  const result = new Function(`'use strict'; return (${normalized})`)();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(`Expression "${sanitized}" produced a non-finite result: ${result}`);
  }

  return result;
}

module.exports = {
  /**
   * calculator({ expression }) → { expression, result, formatted }
   *
   * @param {object} args
   * @param {string} args.expression  The arithmetic expression to evaluate
   * @returns {{ expression: string, result: number, formatted: string }}
   */
  async calculator({ expression }) {
    if (!expression || typeof expression !== 'string') {
      throw new Error('expression must be a non-empty string');
    }

    const result = safeMathEval(expression);

    // Format the result: use integer notation when the result is whole
    const formatted = Number.isInteger(result)
      ? result.toString()
      : result.toPrecision(10).replace(/\.?0+$/, ''); // trim trailing zeros

    return {
      expression: expression.trim(),
      result,
      formatted,
      summary: `${expression.trim()} = ${formatted}`,
    };
  },
};
