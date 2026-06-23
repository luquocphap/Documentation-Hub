import { Module } from '@nestjs/common';
import { DocumentModule } from 'src/modules-api/document/document.module';
import { JobService } from './job.service';

@Module({
  imports: [DocumentModule],
  providers: [JobService],
})
export class JobModule {}
