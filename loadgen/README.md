# loadgen

NestJS app that generates logs and ships them with the OpenTelemetry SDK (OTLP) to an OTel Collector.

```
loadgen (OTel SDK) --OTLP/HTTP--> OTel Collector --> Loki | OpenSearch | Sentry
```

The app never talks to a backend directly. To change the destination, change the Collector's config;
to point the app at a different Collector, change `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` in `.env`.

## Run

```bash
cp .env.example .env        # set OTEL_EXPORTER_OTLP_HEADERS to the collector's OTLP_TOKEN
docker compose up -d --build
```

Local (pnpm, Node >= 20.6): `pnpm install && pnpm build && pnpm start:local`

## API

| Request | What it does |
|---|---|
| `GET /health` | liveness |
| `GET /log/:level?msg=...` | one log at `trace/debug/info/warn/error/fatal` |
| `GET /error` | throws, Nest logs the exception with its stack trace |
| `POST /generator/start?rate=1000&duration=60` | emit 1000 logs/s for 60 s. Also `&total=N` (stop after N) and `&pad=300` (extra bytes of text per log) |
| `POST /generator/stop` | stop |
| `GET /generator` | state: `runId`, `sent`, `actualRatePerSec` |
| `GET /stats`, `POST /stats/reset` | logs emitted by this process, by level |

Each generated log carries `run.id` and `seq`. After a run, count records for that `run.id` in the backend
and compare with `sent` from `GET /generator` to measure loss.

Set `LOG_RATE_PER_SEC` in `.env` to start generating at boot, `LOG_LEVEL_MIX` for the level ratio.
To simulate several services, run more instances with different `OTEL_SERVICE_NAME` (`service.name` is per process).

## Notes

- Logs go through the OTel Logs API directly (`src/logging/otel-logger.service.ts`), no pino/winston.
- Only logs are exported. Spans exist locally so logs get `trace_id`/`span_id`, but they are not sent.
- Not yet compiled or run: dependency versions come from npm at write time. Run `pnpm install && pnpm build` first.
