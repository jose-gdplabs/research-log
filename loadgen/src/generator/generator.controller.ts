import { BadRequestException, ConflictException, Controller, Get, Post, Query } from '@nestjs/common';
import { GeneratorService } from './generator.service';

const optInt = (name: string, raw?: string): number | undefined => {
  if (raw === undefined || raw === '') return undefined;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0) throw new BadRequestException(`${name} must be a non-negative integer`);
  return v;
};

@Controller('generator')
export class GeneratorController {
  constructor(private readonly generator: GeneratorService) {}

  @Get()
  status() {
    return this.generator.status();
  }

  // POST /generator/start?rate=1000&duration=60   (or &total=100000, &pad=300)
  @Post('start')
  start(
    @Query('rate') rate?: string,
    @Query('total') total?: string,
    @Query('duration') duration?: string,
    @Query('pad') pad?: string,
  ) {
    const r = optInt('rate', rate);
    if (!r) throw new BadRequestException('rate (logs/second) is required and must be > 0');
    if (this.generator.isRunning()) throw new ConflictException('generator already running, POST /generator/stop first');
    return this.generator.start({
      rate: r,
      total: optInt('total', total),
      durationSec: optInt('duration', duration),
      padBytes: optInt('pad', pad),
    });
  }

  @Post('stop')
  stop() {
    return this.generator.stop();
  }
}
