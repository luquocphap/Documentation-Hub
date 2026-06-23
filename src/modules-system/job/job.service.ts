import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DocumentPurgeService } from 'src/modules-api/document/document-purge.service';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly documentPurgeService: DocumentPurgeService,
  ) {}

  @Cron('0 0 0 * * *', {
    name: 'document-auto-purge',
    timeZone: 'Asia/Ho_Chi_Minh',
    waitForCompletion: true,
  })
  async handleDocumentAutoPurge(): Promise<void> {
    this.logger.log('Starting expired document purge.');

    try {
      const summary =
        await this.documentPurgeService.purgeExpiredDocuments();

      this.logger.log(
        `Expired document purge completed: scanned=${summary.scanned}, purged=${summary.purged}, failed=${summary.failed}, cutoff=${summary.cutoff.toISOString()}.`,
      );

      for (const failure of summary.failures) {
        this.logger.error(
          `Failed to purge document ${failure.documentId} at ${failure.stage}: ${failure.message}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Expired document purge failed: ${message}`, stack);
    }
  }
}
