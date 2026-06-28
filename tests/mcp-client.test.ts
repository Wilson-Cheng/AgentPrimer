import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// We never want the real MCP SDK to spawn processes or open sockets in a unit
// test, so we stub the Client + transports. listTools / callTool are driven by
// per-test fixtures stored on a module-level object the mock closes over.

interface FakeTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const fixture: {
  tools: FakeTool[];
  callResult: unknown;
  callImpl?: (args: Record<string, unknown>) => Promise<{ content: unknown }>;
  connectShouldThrow: boolean;
  closed: number;
} = {
  tools: [],
  callResult: { content: [{ type: 'text', text: 'ok' }] },
  callImpl: undefined,
  connectShouldThrow: false,
  closed: 0,
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class Client {
    async connect() {
      if (fixture.connectShouldThrow) throw new Error('connect failed');
    }
    async listTools() {
      return { tools: fixture.tools };
    }
    async callTool({ arguments: args }: { name: string; arguments: Record<string, unknown> }) {
      if (fixture.callImpl) return fixture.callImpl(args);
      return fixture.callResult as { content: unknown };
    }
    async close() {
      fixture.closed += 1;
    }
  }
  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  class StdioClientTransport {
    onclose?: () => void;
    close() {}
  }
  return { StdioClientTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  class SSEClientTransport {
    close() {}
  }
  return { SSEClientTransport };
});

// Drive listMcpServers from a per-test array.
const mockServers: Array<Record<string, unknown>> = [];
vi.mock('../lib/db', () => ({
  listMcpServers: () => mockServers,
}));

// Pass schemas through as-is; we only care that loadMcpTools wires execute().
vi.mock('../lib/schema-utils', () => ({
  jsonSchemaToZod: (schema: unknown) => schema,
}));

// Capture the tool definitions the AI SDK `tool()` helper receives so we can
// invoke their execute() functions directly.
vi.mock('ai', () => ({
  tool: (def: unknown) => def,
}));

async function loadClient() {
  vi.resetModules();
  return import('../lib/mcp-client');
}

function defineServer(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'srv-1',
    name: 'datetime',
    transport: 'stdio',
    command: 'node',
    args_json: '[]',
    url: '',
    local_path: '',
    enabled: 1,
    ...over,
  };
}

beforeEach(() => {
  mockServers.length = 0;
  fixture.tools = [];
  fixture.callResult = { content: [{ type: 'text', text: 'ok' }] };
  fixture.callImpl = undefined;
  fixture.connectShouldThrow = false;
  fixture.closed = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadMcpTools', () => {
  it('returns no tools when there are no enabled servers', async () => {
    mockServers.push(defineServer({ enabled: 0 }));
    const { loadMcpTools } = await loadClient();
    expect(await loadMcpTools()).toEqual({});
  });

  it('prefixes tool keys with the server name to avoid collisions', async () => {
    mockServers.push(defineServer());
    fixture.tools = [{ name: 'now', description: 'current time' }];

    const { loadMcpTools } = await loadClient();
    const tools = await loadMcpTools();

    expect(Object.keys(tools)).toEqual(['datetime__now']);
    expect((tools['datetime__now'] as { description: string }).description).toContain('[datetime MCP]');
  });

  it('filters tools by tool name', async () => {
    mockServers.push(defineServer());
    fixture.tools = [
      { name: 'now' },
      { name: 'parse' },
    ];

    const { loadMcpTools } = await loadClient();
    const tools = await loadMcpTools(['now']);

    expect(Object.keys(tools)).toEqual(['datetime__now']);
  });

  it('includes all of a server\'s tools when filtering by server name', async () => {
    mockServers.push(defineServer());
    fixture.tools = [{ name: 'now' }, { name: 'parse' }];

    const { loadMcpTools } = await loadClient();
    const tools = await loadMcpTools(['datetime']);

    expect(Object.keys(tools).sort()).toEqual(['datetime__now', 'datetime__parse']);
  });

  it('execute() flattens text content blocks into a string', async () => {
    mockServers.push(defineServer());
    fixture.tools = [{ name: 'now' }];
    fixture.callResult = {
      content: [
        { type: 'text', text: 'line1' },
        { type: 'text', text: 'line2' },
        { type: 'image', data: 'ignored' },
      ],
    };

    const { loadMcpTools } = await loadClient();
    const tools = await loadMcpTools();
    const execute = (tools['datetime__now'] as { execute: (a: object) => Promise<unknown> }).execute;

    await expect(execute({})).resolves.toBe('line1\nline2');
  });

  it('does not crash the agent when a server fails to connect', async () => {
    mockServers.push(defineServer());
    fixture.connectShouldThrow = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { loadMcpTools } = await loadClient();
    const tools = await loadMcpTools();

    expect(tools).toEqual({});
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reuses a single connection across tool loads and closes it on disconnectAll', async () => {
    mockServers.push(defineServer());
    fixture.tools = [{ name: 'now' }];

    const { loadMcpTools, disconnectAll } = await loadClient();

    await loadMcpTools();
    await loadMcpTools(); // second load should reuse the cached client

    await disconnectAll();
    expect(fixture.closed).toBe(1);

    // After disconnect, a fresh load reconnects (no stale clients linger).
    await loadMcpTools();
    await disconnectAll();
    expect(fixture.closed).toBe(2);
  });
});
