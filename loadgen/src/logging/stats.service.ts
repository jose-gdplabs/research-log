import { Injectable } from '@nestjs/common';
import type { Level } from '../config';

@Injectable()
export class StatsService {
  private since = new Date();
  private total = 0;
  private byLevel: Record<string, number> = {};

  record(level: Level): void {
    this.total += 1;
    this.byLevel[level] = (this.byLevel[level] ?? 0) + 1;
  }

  reset(): void {
    this.since = new Date();
    this.total = 0;
    this.byLevel = {};
  }

  snapshot() {
    return { since: this.since.toISOString(), total: this.total, byLevel: { ...this.byLevel } };
  }
}
