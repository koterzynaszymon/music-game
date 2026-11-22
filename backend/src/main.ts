import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { existsSync } from 'fs';
async function bootstrap() {
   if (existsSync('.env')) {
     process.loadEnvFile();
   }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // any property not declared in the DTO is stripped out
      forbidNonWhitelisted: true, // any property not declared in the DTO is rejected and throws a 400 error.
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
