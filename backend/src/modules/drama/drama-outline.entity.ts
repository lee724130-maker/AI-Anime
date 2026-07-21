import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('drama_outlines')
export class DramaOutline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  project_id: number;

  @Column({ type: 'text' })
  outline: string;

  @Column({ type: 'text', nullable: true })
  raw_response: string;

  @Column({ type: 'text', nullable: true })
  structured_result: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
