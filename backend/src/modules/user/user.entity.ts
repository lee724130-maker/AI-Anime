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

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ default: 100 })
  credits: number;

  @Column({ default: 1 })
  status: number;

  @Column({ default: 'user' })
  role: string;

  // 生产新代码字段（未推送到 git），保留数据用
  @Column({ type: 'boolean', default: false })
  is_super_admin: boolean;

  @Column({ type: 'text', nullable: true })
  admin_permissions: string | null;

  @Column({ type: 'boolean', default: false })
  test_notice_dismissed: boolean;

  @CreateDateColumn()
  created_at: Date;
}
