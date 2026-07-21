import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DramaService } from '../modules/drama/drama.service';

@Injectable()
@Processor('drama-segment')
export class DramaSegmentProcessor {
  private readonly logger = new Logger(DramaSegmentProcessor.name);

  constructor(private readonly dramaService: DramaService) {}

  @Process('generate')
  async handleGenerate(job: Job<{ userId: number; segmentId: number }>) {
    const { userId, segmentId } = job.data;
    this.logger.log(`Processing segment generation job #${job.id} — segmentId=${segmentId}`);
    try {
      const result = await this.dramaService.executeSegmentGeneration(userId, segmentId);
      this.logger.log(`Segment ${segmentId} generated successfully: ${result.video_url}`);
      return result;
    } catch (err: any) {
      this.logger.error(`Segment ${segmentId} generation failed: ${err.message}`);
      throw err;
    }
  }
}
