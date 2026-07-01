import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

function request(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('proxy preview asset auth bypass', () => {
  it('allows same-origin workspace preview asset requests before auth enforcement', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js',
        {
          headers: {
            referer:
              'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/page2.html',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
  });

  it('allows sandboxed iframe script asset requests before auth enforcement', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/react-todo-demo/react.production.min.js',
        {
          headers: {
            'sec-fetch-dest': 'script',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'cross-site',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
  });

  it('allows sandboxed iframe source map requests before auth enforcement', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/projects/react-todo-demo/babel.min.js.map',
        {
          headers: {
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
          },
        },
      ),
    );

    expect(response.status).toBe(200);
  });

  it('keeps unauthenticated API requests protected when they are not preview assets', async () => {
    const response = await proxy(
      request(
        'http://localhost:15432/api/workspace/workspaces/AgentPrimer/data/app/react.production.min.js',
      ),
    );

    expect(response.status).toBe(401);
  });
});
