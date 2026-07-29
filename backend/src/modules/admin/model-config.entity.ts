import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('model_configs')
export class ModelConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  provider: string;

  @Column({ length: 20 })
  capability: string;

  @Column({ name: 'sub_capability', length: 20, nullable: true })
  sub_capability: string;

  @Column({ length: 50 })
  model_id: string;

  @Column({ length: 100 })
  model_name: string;

  @Column({ default: 1 })
  priority: number;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'max_width', nullable: true })
  max_width: number;

  @Column({ name: 'max_height', nullable: true })
  max_height: number;

  @Column({ name: 'min_duration', nullable: true })
  min_duration: number;

  @Column({ name: 'max_duration', nullable: true })
  max_duration: number;

  @Column({ name: 'supported_ratios', length: 200, nullable: true })
  supported_ratios: string;

  @Column({ name: 'supported_resolutions', length: 200, nullable: true })
  supported_resolutions: string;

  @Column({ name: 'price_per_unit', default: 0 })
  price_per_unit: number;

  @Column({ length: 20, default: 'task' })
  unit: string;

  @Column({ name: 'extra_params', type: 'text', nullable: true })
  extra_params: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
