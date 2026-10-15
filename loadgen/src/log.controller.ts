import { BadRequestException, Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { LEVELS, type Level } from './config';
import { GeneratorService } from './generator/generator.service';
import { OtelLoggerService } from './logging/otel-logger.service';
import { StatsService } from './logging/stats.service';

@Controller()
export class LogController {
  private readonly nestLogger = new Logger(LogController.name);

  constructor(
    private readonly logger: OtelLoggerService,
    private readonly stats: StatsService,
    private readonly generator: GeneratorService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  // GET /log/error?msg=something  -> one log record at that level
  @Get('log/:level')
  log(@Param('level') level: string, @Query('msg') msg?: string) {
    if (!LEVELS.includes(level as Level)) {
      throw new BadRequestException(`level must be one of: ${LEVELS.join(', ')}`);
    }
    this.logger.emit(level as Level, msg ?? `manual ${level} log`, { 'log.source': 'manual' });
    return { sent: 1, level };
  }

  // Unhandled exception: Nest logs it with the stack trace through the OTel logger.
  @Get('error')
  error(): never {
    this.nestLogger.warn('about to throw an intentional error');
    throw new Error('loadgen: intentional error');
  }

  @Get('stats')
  getStats() {
    return { logger: this.stats.snapshot(), generator: this.generator.status() };
  }

  @Post('stats/reset')
  resetStats() {
    this.stats.reset();
    return this.stats.snapshot();
  }
}
