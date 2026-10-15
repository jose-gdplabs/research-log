import { Module } from '@nestjs/common';
import { GeneratorController } from './generator/generator.controller';
import { GeneratorService } from './generator/generator.service';
import { LogController } from './log.controller';
import { LoggingModule } from './logging/logging.module';

@Module({
  imports: [LoggingModule],
  controllers: [LogController, GeneratorController],
  providers: [GeneratorService],
})
export class AppModule {}
