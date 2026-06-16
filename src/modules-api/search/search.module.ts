import { Module } from '@nestjs/common';
import { DocumentParserModule } from 'src/modules-system/document-parser/document-parser.module';

@Module({
  imports: [
    DocumentParserModule
  ],
  controllers: [],
  providers: [],
})
export class AuthModule {}
