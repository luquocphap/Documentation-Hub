import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfParserService {
  async parse(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText({
        lineEnforce: true,
        disableNormalization: false,
        includeMarkedContent: false,
        pageJoiner: '\n\n',
      });

      return result.text;
    } finally {
      await parser.destroy();
    }
  }
}
