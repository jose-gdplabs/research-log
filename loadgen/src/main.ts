import './instrumentation'; // must stay first: patches http/express before Nest loads them
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { OtelLoggerService } from './logging/otel-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(OtelLoggerService));
  app.enableShutdownHooks(); // SIGTERM -> flush pending logs to the collector
  await app.listen(config.port, '0.0.0.0');
}
void bootstrap();
