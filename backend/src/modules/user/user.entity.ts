import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ select: false })
  password: string;

  @Column({ default: 100 })
  credits: number;

  @Column({ default: 1 })
  status: number;

  @Column({ default: 'user' })
  role: string;

  @CreateDateColumn()
  created_at: Date;
}
