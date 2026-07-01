import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

function request(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('proxy preview route auth', () => {
  it('allows unauthenticated GET requests to /api/preview/', async () => {
    const response = await proxy(request('http://localhost:15432/api/preview/myapp/index.html'));
    expect(response.status).toBe(200);
  });

  it('allows unauthenticated GET requests with spoofed sec-fetch-dest to /api/preview/', async () => {
    const response = await proxy(
      request('http://localhost:15432/api/preview/myapp/game.js', {
        headers: { 'sec-fetch-dest': 'script' },
      }),
    );
    expect(response.status).toBe(200);
  });

  it('protects /api/workspace/ even with spoofed sec-fetch-dest header', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/myapp/index.html',
        {
          headers: { 'sec-fetch-dest': 'empty' },
        },
      ),
    );
    expect(response.status).toBe(401);
  });

  it('protects /api/workspace/ even with same-origin referer', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/myapp/index.html',
        {
          headers: {
            referer:
              'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/myapp/index.html',
          },
        },
      ),
    );
    expect(response.status).toBe(401);
  });

  it('keeps unauthenticated non-preview API requests protected', async () => {
    const response = await proxy(request('http://localhost:15432/api/settings'));
    expect(response.status).toBe(401);
  });
});
