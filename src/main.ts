import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from "cookie-parser";
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { APP_URL } from './common/constants/app.constant';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({}));
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Team Documentation Hub')
    .setDescription('The Lumin API description')
    .setVersion('1.0')
    .addTag('Lumin')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  app.enableCors({
    origin: APP_URL,
    credentials: true
  })

  const PORT = 3069;
  await app.listen(PORT, () => {
    console.log(`[SUCCESS] BE started successfully at http://localhost:${PORT}`)
  });
}
bootstrap();
