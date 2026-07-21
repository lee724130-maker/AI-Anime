import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('prompt_templates')
export class PromptTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 50, nullable: true })
  provider: string;

  @Column({ length: 20, nullable: true })
  capability: string;

  @Column({ type: 'text' })
  template: string;

  @Column({ type: 'text', nullable: true })
  variables: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
