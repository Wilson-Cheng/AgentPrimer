'use strict';
/**
 * Sample MCP server: datetime
 *
 * Exposes two tools over stdio (MCP protocol):
 *   - get_current_time : returns the current date/time in a given timezone
 *   - get_date_info    : returns day-of-week, week number, etc. for a date
 *
 * Register in the UI with:
 *   Transport    : stdio
 *   Start command: node data/mcp-servers/datetime/index.js
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------
function handleGetCurrentTime({ timezone = 'UTC', format = 'iso' } = {}) {
  let date;
  try {
    // Validate timezone by attempting to format with it
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    date = new Date();
  } catch {
    return { error: `Unknown timezone: "${timezone}". Use an IANA name like "America/New_York".` };
  }

  if (format === 'human') {
    const human = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(date);
    return { timezone, datetime: human };
  }

  // ISO with offset
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  const iso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  return { timezone, datetime: iso };
}

function handleGetDateInfo({ date } = {}) {
  const d = date ? new Date(date + 'T00:00:00Z') : new Date();
  if (isNaN(d.getTime())) {
    return { error: `Invalid date: "${date}". Use YYYY-MM-DD format.` };
  }

  const year = d.getUTCFullYear();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[d.getUTCDay()];

  // ISO week number
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const weekNumber = Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;

  // Leap year
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  // Days remaining in year
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  const daysRemaining = Math.round((endOfYear - d) / 86400000);

  return {
    date: d.toISOString().slice(0, 10),
    dayOfWeek,
    isoWeekNumber: weekNumber,
    year,
    isLeapYear: isLeap,
    daysRemainingInYear: daysRemaining,
  };
}

// ---------------------------------------------------------------------------
// MCP server setup
// ---------------------------------------------------------------------------
async function main() {
  const server = new McpServer({ name: 'datetime', version: '1.0.0' });

  server.registerTool(
    'get_current_time',
    {
      description: 'Returns the current date and time, optionally in a specific IANA timezone.',
      inputSchema: {
        timezone: z.string().optional().describe('IANA timezone name, e.g. "America/New_York". Defaults to UTC.'),
        format: z.enum(['iso', 'human']).optional().describe('"iso" returns ISO-8601, "human" returns a readable string. Defaults to "iso".'),
      },
    },
    async ({ timezone, format }) => {
      const result = handleGetCurrentTime({ timezone, format });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'get_date_info',
    {
      description: 'Returns metadata about a specific date: day of week, ISO week number, whether it is a leap year, and days remaining in the year.',
      inputSchema: {
        date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today (UTC).'),
      },
    },
    async ({ date }) => {
      const result = handleGetDateInfo({ date });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`datetime MCP server error: ${err.message}\n`);
  process.exit(1);
});
