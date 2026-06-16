import { Injectable } from "@nestjs/common";
import { PdfParserService } from "./pdf-parser.service";
import { MarkdownParserService } from "./markdown-parser.service";

@Injectable()
export class DocumentContentExtractorService {
  constructor(
    private readonly pdfParserService: PdfParserService,
    private readonly markdownParserService: MarkdownParserService,
  ) {}

  async extractFromPdfBuffer(buffer: Buffer): Promise<string> {
    const text = await this.pdfParserService.parse(buffer);
    return this.normalize(text);
  }

  extractFromMarkdown(markdown: string): string {
    const text = this.markdownParserService.parse(markdown);
    return this.normalize(text);
  }

  private normalize(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);
  }
}