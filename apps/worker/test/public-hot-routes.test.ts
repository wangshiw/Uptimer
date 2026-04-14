import { afterEach, describe, expect, it, vi } from 'vitest';

const { computePublicStatusPayload } = vi.hoisted(() => ({
  computePublicStatusPayload: vi.fn(),
}));

vi.mock('../src/public/status', () => ({
  computePublicStatusPayload,
}));

import type { Env } from '../src/env';
import worker from '../src/index';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

type WaitUntil = (promise: Promise<unknown>) => void;

function sampleStatusPayload(now = 1_728_000_000) {
  return {
    generated_at: now,
    site_title: 'Uptimer',
    site_description: '',
    site_locale: 'auto',
    site_timezone: 'UTC',
    uptime_rating_level: 3,
    overall_status: 'up',
    banner: {
      source: 'monitors',
      status: 'operational',
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: {
      up: 1,
      down: 0,
      maintenance: 0,
      paused: 0,
      unknown: 0,
    },
    monitors: [],
    active_incidents: [],
    maintenance_windows: {
      active: [],
      upcoming: [],
    },
  };
}

async function requestStatusViaWorker(opts: {
  handlers: FakeD1QueryHandler[];
  origin?: string;
  waitUntil?: WaitUntil;
}) {
  const env = {
    DB: createFakeD1Database(opts.handlers),
    ADMIN_TOKEN: 'test-admin-token',
  } as unknown as Env;

  const waitUntil = opts.waitUntil ?? vi.fn();

  const res = await worker.fetch(
    new Request('https://status.example.com/api/v1/public/status', {
      headers: opts.origin ? { Origin: opts.origin } : undefined,
    }),
    env,
    { waitUntil } as unknown as ExecutionContext,
  );

  return { res, waitUntil };
}

describe('public hot routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    computePublicStatusPayload.mockReset();
  });

  it('serves the fresh public status snapshot via the hot router', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200_000);
    const payload = sampleStatusPayload(190);

    const { res } = await requestStatusViaWorker({
      origin: 'https://status-web.example.com',
      handlers: [
        {
          match: 'from public_snapshots',
          first: (args) =>
            args[0] === 'status'
              ? {
                  generated_at: payload.generated_at,
                  body_json: JSON.stringify(payload),
                }
              : null,
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://status-web.example.com');
    expect(res.headers.get('Vary')).toContain('Origin');
    expect(await res.json()).toEqual(payload);
  });

  it('computes status on snapshot miss and schedules a snapshot write', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200_000);
    const payload = sampleStatusPayload(200);
    computePublicStatusPayload.mockResolvedValue(payload);

    const pending: Promise<unknown>[] = [];
    let writes = 0;

    const { res, waitUntil } = await requestStatusViaWorker({
      waitUntil: (promise) => pending.push(promise),
      handlers: [
        {
          match: 'from public_snapshots',
          first: () => null,
        },
        {
          match: 'insert into public_snapshots',
          run: () => {
            writes += 1;
            return 1;
          },
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(computePublicStatusPayload).toHaveBeenCalledOnce();
    expect(waitUntil).toBeTypeOf('function');
    expect(pending.length).toBe(1);

    await Promise.allSettled(pending);
    expect(writes).toBe(1);
  });

  it('falls back to a bounded stale status snapshot when live compute fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200_000);
    const stale = sampleStatusPayload(100);
    computePublicStatusPayload.mockRejectedValue(new Error('boom'));

    const pending: Promise<unknown>[] = [];

    const { res } = await requestStatusViaWorker({
      waitUntil: (promise) => pending.push(promise),
      handlers: [
        {
          match: 'from public_snapshots',
          first: (args) =>
            args[0] === 'status'
              ? {
                  generated_at: stale.generated_at,
                  body_json: JSON.stringify(stale),
                }
              : null,
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(stale);
    expect(computePublicStatusPayload).toHaveBeenCalledOnce();
    expect(pending.length).toBe(0);
  });
});

