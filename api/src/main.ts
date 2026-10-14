import './env'; // phải là import đầu tiên: nạp .env trước khi các module đọc process.env
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.set('trust proxy', 1); // sau Caddy/nginx: lấy IP thật để rate limit
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(compression());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  // Production dùng chung một origin (proxy /api) nên không cần CORS; dev có thể đặt CORS_ORIGIN.
  const origins = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API ready on :${port}/api (${process.env.NODE_ENV ?? 'development'})`);
}
bootstrap();
