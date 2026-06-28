/**
 * instrumentation.ts
 * ---------------------------------------------------------------------------
 * Next.js server startup hook. Runs once when the server process initialises,
 * before any request is handled.
 *
 * Calls bootstrap() to ensure all required data-directory files and DB records
 * exist (agent folders, seed skill, seed MCP server).
 */

export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { bootstrap } = await import('./lib/bootstrap');
      bootstrap();
    } catch (err) {
      console.error('Server bootstrap failed:', err);
    }
  }
}
