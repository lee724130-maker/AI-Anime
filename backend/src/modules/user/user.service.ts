import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { VideoTask } from '../video/video.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
  ) {}

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async getDashboard(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [scriptCount, characterCount, totalVideos, todayCalls, recentTasks] = await Promise.all([
      this.scriptRepo.count({ where: { user_id: userId } }),
      this.characterRepo.count({ where: { user_id: userId } }),
      this.videoRepo.count({ where: { user_id: userId } }),
      this.videoRepo.count({ where: { user_id: userId, created_at: todayStart } }),
      this.videoRepo.find({
        where: { user_id: userId },
        order: { created_at: 'DESC' },
        take: 10,
      }),
    ]);

    return {
      credits: user.credits,
      scriptCount,
      characterCount,
      videoCount: totalVideos,
      todayCalls,
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        status: t.status,
        progress: t.progress,
        resolution: t.resolution,
        duration: t.duration,
        prompt: t.prompt,
        video_url: t.video_url,
        error_msg: t.error_msg,
        created_at: t.created_at,
      })),
    };
  }
}
