import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from './character.entity';

@Injectable()
export class CharacterService {
  constructor(
    @InjectRepository(Character)
    private readonly charRepo: Repository<Character>,
  ) {}

  async create(userId: number, dto: { name: string; description?: string; avatar_url?: string }) {
    const character = this.charRepo.create({ ...dto, user_id: userId });
    return this.charRepo.save(character);
  }

  async findByUser(userId: number) {
    return this.charRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number, userId: number) {
    const character = await this.charRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!character) throw new NotFoundException('角色不存在');
    return character;
  }

  async update(id: number, userId: number, dto: { name?: string; description?: string; avatar_url?: string; lora_model_id?: string }) {
    const character = await this.findOne(id, userId);
    Object.assign(character, dto);
    return this.charRepo.save(character);
  }

  async remove(id: number, userId: number) {
    const character = await this.findOne(id, userId);
    return this.charRepo.remove(character);
  }
}
