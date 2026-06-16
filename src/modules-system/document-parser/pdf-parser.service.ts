import { Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";

@Injectable()
export class PdfParserService {
  async parse(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText({
      lineEnforce: true,
      disableNormalization: false,
      includeMarkedContent: false,
      
    });
    return result.text;
  }
}