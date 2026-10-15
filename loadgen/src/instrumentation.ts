// Must be imported first in main.ts so http/express are patched before Nest loads them.
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

// Only logs are exported: the collector has a logs pipeline and nothing else.
process.env.OTEL_METRICS_EXPORTER ??= 'none';
process.env.OTEL_SERVICE_NAME ??= 'loadgen';

// Spans are never exported. A tracer provider is only created when at least one span
// processor exists, and without it logs would have no trace_id / span_id.
class LocalSpanProcessor implements tracing.SpanProcessor {
  onStart(): void {}
  onEnd(): void {}
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// OTLPLogExporter reads OTEL_EXPORTER_OTLP_ENDPOINT / _LOGS_ENDPOINT / _HEADERS from env,
// and BatchLogRecordProcessor reads OTEL_BLRP_* from env, so switching target = env only.
const sdk = new NodeSDK({
  spanProcessors: [new LocalSpanProcessor()],
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});
sdk.start();

export async function shutdownTelemetry(): Promise<void> {
  await sdk.shutdown();
}
