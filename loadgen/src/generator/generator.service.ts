import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import type { AnyValueMap } from '@opentelemetry/api-logs';
import { config, type Level } from '../config';
import { OtelLoggerService } from '../logging/otel-logger.service';

const TICK_MS = 50;
const MAX_PER_TICK = 10_000; // bound work per tick so the event loop never starves

const MODULES = ['auth', 'payment', 'cart', 'catalog', 'search', 'notification', 'billing', 'inventory'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const ROUTES = ['/api/orders', '/api/orders/:id', '/api/users/:id', '/api/cart', '/api/payments', '/api/search', '/login'];
const EXCEPTIONS = ['TypeError', 'TimeoutError', 'ConnectionError', 'ValidationError', 'UpstreamError'];
const FAKE_STACK = [
  'Error: operation failed',
  '    at OrderService.create (/app/dist/order/order.service.js:88:19)',
  '    at OrderController.create (/app/dist/order/order.controller.js:41:30)',
  '    at /app/node_modules/express/lib/router/layer.js:95:5',
].join('\n');

const MESSAGES: Record<Level, string[]> = {
  trace: ['entering handler for request {n}', 'cache lookup key={n}'],
  debug: ['query executed in {n}ms', 'loaded {n} rows from replica', 'retry budget remaining {n}'],
  info: ['order {n} created', 'user {n} logged in', 'payment {n} captured', 'GET /api/orders completed', 'job {n} finished'],
  warn: ['slow query detected ({n}ms)', 'retrying upstream call, attempt {n}', 'cache miss ratio high'],
  error: ['payment {n} failed', 'upstream timeout after {n}ms', 'unhandled exception in worker', 'db connection reset'],
  fatal: ['lost connection to primary database', 'out of memory, shutting down'],
};

// Pseudo-text (compresses like real log text, unlike random bytes) used for LOG_PAD_BYTES.
const VOCAB = ['request', 'order', 'customer', 'payment', 'gateway', 'timeout', 'retry', 'cache', 'index', 'queue',
  'session', 'token', 'latency', 'upstream', 'handler', 'shard', 'replica', 'commit', 'rollback', 'batch'];
const pick = <T>(arr: T[]): T => arr[randomInt(arr.length)];
const TEXT_POOL = Array.from({ length: 6000 }, () => pick(VOCAB)).join(' ');
const textSlice = (n: number): string => {
  const len = Math.min(n, TEXT_POOL.length);
  const start = randomInt(TEXT_POOL.length - len + 1);
  return TEXT_POOL.slice(start, start + len);
};

const statusFor = (level: Level): number =>
  level === 'error' || level === 'fatal' ? pick([500, 502, 503, 504]) : level === 'warn' ? pick([400, 404, 429]) : pick([200, 200, 200, 201, 204]);

interface Job {
  runId: string;
  rate: number;
  total?: number; // stop after this many
  deadlineMs?: number; // or after this time
  padBytes: number;
  sent: number;
  startedMs: number;
  endedMs?: number;
}

export interface GeneratorOptions {
  rate: number;
  total?: number;
  durationSec?: number;
  padBytes?: number;
}

@Injectable()
export class GeneratorService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private job: Job | null = null;
  private readonly totalWeight = config.levelMix.reduce((s, m) => s + m.weight, 0);

  constructor(private readonly logger: OtelLoggerService) {}

  onApplicationBootstrap(): void {
    if (config.ratePerSec > 0) this.start({ rate: config.ratePerSec });
  }

  onModuleDestroy(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.timer !== undefined;
  }

  start(opts: GeneratorOptions) {
    if (this.isRunning()) throw new Error('generator already running');
    const now = Date.now();
    this.job = {
      runId: randomUUID(),
      rate: opts.rate,
      total: opts.total,
      deadlineMs: opts.durationSec !== undefined ? now + opts.durationSec * 1000 : undefined,
      padBytes: opts.padBytes ?? config.padBytes,
      sent: 0,
      startedMs: now,
    };
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.job && this.job.endedMs === undefined) this.job.endedMs = Date.now();
    return this.status();
  }

  status() {
    const j = this.job;
    if (!j) return { running: false };
    const end = j.endedMs ?? Date.now();
    return {
      running: this.isRunning(),
      runId: j.runId,
      ratePerSec: j.rate,
      target: j.total ?? null,
      sent: j.sent,
      padBytes: j.padBytes,
      startedAt: new Date(j.startedMs).toISOString(),
      endedAt: j.endedMs ? new Date(j.endedMs).toISOString() : null,
      actualRatePerSec: Math.round((j.sent / Math.max(end - j.startedMs, 1)) * 1000),
    };
  }

  private tick(): void {
    const j = this.job;
    if (!j) return;
    const now = Date.now();
    // time-based: emit however many are due, so timer drift does not lower the rate
    let due = Math.floor(((now - j.startedMs) / 1000) * j.rate) - j.sent;
    if (j.total !== undefined) due = Math.min(due, j.total - j.sent);
    due = Math.min(due, MAX_PER_TICK);
    for (let i = 0; i < due; i++) this.emitOne(j);
    const done =
      (j.total !== undefined && j.sent >= j.total) || (j.deadlineMs !== undefined && now >= j.deadlineMs);
    if (done) this.stop();
  }

  private pickLevel(): Level {
    let r = Math.random() * this.totalWeight;
    for (const m of config.levelMix) {
      r -= m.weight;
      if (r <= 0) return m.level;
    }
    return config.levelMix[0].level;
  }

  private emitOne(j: Job): void {
    const level = this.pickLevel();
    const attrs: AnyValueMap = {
      'run.id': j.runId, // count by run.id in the backend to compare with `sent`
      seq: j.sent,
      'app.module': pick(MODULES),
      'http.request.method': pick(METHODS),
      'http.route': pick(ROUTES),
      'http.response.status_code': statusFor(level),
      'user.id': `u-${randomInt(1, 100_000)}`,
      'request.id': randomUUID(),
      'duration.ms': randomInt(1, 2000),
    };
    if (level === 'error' || level === 'fatal') {
      attrs['exception.type'] = pick(EXCEPTIONS);
      attrs['exception.stacktrace'] = FAKE_STACK;
    }
    if (j.padBytes > 0) attrs['payload'] = textSlice(j.padBytes);
    const message = pick(MESSAGES[level]).replace('{n}', String(randomInt(1000, 99_999)));
    j.sent += 1;
    this.logger.emit(level, message, attrs);
  }
}
