import { Global, Module } from '@nestjs/common';
import { OtelLoggerService } from './otel-logger.service';
import { StatsService } from './stats.service';

@Global()
@Module({
  providers: [StatsService, OtelLoggerService],
  exports: [StatsService, OtelLoggerService],
})
export class LoggingModule {}
