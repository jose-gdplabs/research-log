import { Injectable, LoggerService, OnApplicationShutdown } from '@nestjs/common';
import { logs, SeverityNumber, type AnyValueMap, type Logger as OtelLogger } from '@opentelemetry/api-logs';
import { config, type Level } from '../config';
import { shutdownTelemetry } from '../instrumentation';
import { StatsService } from './stats.service';

const SEVERITY: Record<Level, [SeverityNumber, string]> = {
  trace: [SeverityNumber.TRACE, 'TRACE'],
  debug: [SeverityNumber.DEBUG, 'DEBUG'],
  info: [SeverityNumber.INFO, 'INFO'],
  warn: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR'],
  fatal: [SeverityNumber.FATAL, 'FATAL'],
};

const looksLikeStack = (s: string): boolean => s.includes('\n    at ');

/**
 * Nest LoggerService that writes straight to the OpenTelemetry Logs API (no pino/winston).
 * Registered with app.useLogger(), so Nest's own logs and every `new Logger()` go through it.
 */
@Injectable()
export class OtelLoggerService implements LoggerService, OnApplicationShutdown {
  private readonly otel: OtelLogger = logs.getLogger('loadgen');

  constructor(private readonly stats: StatsService) {}

  /** Emit one log record. trace_id / span_id are attached automatically from the active span. */
  emit(level: Level, message: unknown, attributes: AnyValueMap = {}): void {
    const [severityNumber, severityText] = SEVERITY[level];
    const body = typeof message === 'string' ? message : JSON.stringify(message);
    this.otel.emit({ severityNumber, severityText, body, attributes });
    this.stats.record(level);
    if (config.toConsole) {
      process.stdout.write(
        JSON.stringify({ time: new Date().toISOString(), level: severityText, message: body, ...attributes }) + '\n',
      );
    }
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  async onApplicationShutdown(): Promise<void> {
    await shutdownTelemetry(); // flushes the batch processor
  }

  // Nest passes (message, ...optionalParams) where the last param is the context, and for
  // error() the stack comes before the context: error(message, stack?, context?)
  private write(level: Level, message: unknown, params: unknown[]): void {
    const attributes: AnyValueMap = {};
    const strings = params.filter((p): p is string => typeof p === 'string');
    const stack = strings.find(looksLikeStack);
    const context = [...strings].reverse().find((s) => !looksLikeStack(s));
    if (context) attributes['nest.context'] = context;
    if (stack) attributes['exception.stacktrace'] = stack;
    this.emit(level, message, attributes);
  }
}
