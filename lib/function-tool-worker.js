/**
 * lib/function-tool-worker.js  (CommonJS – intentionally .js not .ts)
 * ---------------------------------------------------------------------------
 * This script runs in a SEPARATE Node.js process (via child_process.spawn).
 * It provides subprocess-level isolation for function tool execution.
 *
 * Communication protocol (JSON over stdio):
 *   Parent → Worker:  single JSON line on stdin: { toolPath, toolName, args }
 *   Worker → Parent:  single JSON line on stdout: { result } or { error }
 *
 * `toolPath` is the absolute path to the function tool's index.js. The
 * legacy field name `skillPath` is still accepted for backwards compatibility.
 *
 * Using spawn() + stdio instead of fork() + IPC avoids Turbopack's static
 * analysis of fork() arguments which would attempt to bundle this file.
 */

'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
// This is a plain CommonJS worker script spawned as a child process.
// It intentionally uses require() because it runs outside the Next.js/ESM context.

let inputBuffer = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
});

process.stdin.on('end', async () => {
  let msg;
  try {
    msg = JSON.parse(inputBuffer.trim());
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: 'Invalid JSON input: ' + e.message }) + '\n');
    process.exit(1);
    return;
  }

  // Accept both the new `toolPath` and the legacy `skillPath` field name.
  const { toolPath, skillPath, toolName, args } = msg;
  const resolvedPath = toolPath || skillPath;

  try {
    const toolModule = require(resolvedPath);

    if (typeof toolModule[toolName] !== 'function') {
      process.stdout.write(
        JSON.stringify({ error: `Function "${toolName}" not found in tool module` }) + '\n',
      );
      process.exit(1);
      return;
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tool execution timed out after 30s')), 30000),
    );

    const result = await Promise.race([toolModule[toolName](args), timeoutPromise]);

    process.stdout.write(JSON.stringify({ result }) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + '\n',
    );
    process.exit(1);
  }
});
