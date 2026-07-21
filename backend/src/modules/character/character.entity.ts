import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 500, nullable: true })
  avatar_url: string;

  @Column({ name: 'reference_image_anime', length: 500, nullable: true })
  reference_image_anime: string;

  @Column({ name: 'reference_image_realistic', length: 500, nullable: true })
  reference_image_realistic: string;

  @Column({ length: 100, nullable: true })
  lora_model_id: string;

  @CreateDateColumn()
  created_at: Date;
}
