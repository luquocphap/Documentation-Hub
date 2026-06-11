import { Injectable, OnModuleInit, OnModuleDestroy, InternalServerErrorException } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private browser!: Browser;

  async onModuleInit() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        // Các flag tối ưu hóa cho môi trường server/docker
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      console.log('[PDF Service] Puppeteer Browser initialized');
    } catch (error) {
      console.error('[PDF Service] Failed to initialize Puppeteer', error);
    }
  }

  // Chạy khi Server tắt (tránh kẹt process ngầm)
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      console.log('[PDF Service] Puppeteer Browser closed');
    }
  }

  /**
   * Nhận vào chuỗi HTML và trả về Buffer của file PDF
   */
  async generatePdfFromHtml(htmlContent: string): Promise<Buffer> {
    if (!this.browser) {
      throw new InternalServerErrorException('PDF Engine is not ready');
    }

    let page;
    try {
      page = await this.browser.newPage();
      
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfUint8Array = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
      });

      return Buffer.from(pdfUint8Array);
    } catch (error) {
      console.error('[PDF Service] Error generating PDF:', error);
      throw new InternalServerErrorException('Lỗi trong quá trình render file PDF');
    } finally {
      if (page) {
        await page.close(); 
      }
    }
  }
}