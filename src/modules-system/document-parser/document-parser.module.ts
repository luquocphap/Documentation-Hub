import { Module } from "@nestjs/common";
import { PdfParserService } from "./pdf-parser.service";
import { MarkdownParserService } from "./markdown-parser.service";
import { DocumentContentExtractorService } from "./document-content-extractor.service";

@Module({
  providers: [
    PdfParserService,
    MarkdownParserService,
    DocumentContentExtractorService,
  ],
  exports: [
    DocumentContentExtractorService,
  ],
})
export class DocumentParserModule {}