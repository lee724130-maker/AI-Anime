import { ForbiddenException } from '@nestjs/common';

export interface TemplateActor {
  id: number;
  role?: string;
}

/**
 * 模板写操作权限规则：
 * - is_system=true（系统模板）→ 仅管理员
 * - user_id 为空（历史遗留公共模板）→ 仅管理员
 * - 其余 → 仅创建者本人
 */
export function assertTemplateWritable(
  tpl: { is_system?: boolean | null; user_id?: number | null },
  user: TemplateActor,
  label = '模板',
) {
  const isAdmin = user?.role === 'admin';
  if (tpl.is_system) {
    if (!isAdmin) throw new ForbiddenException(`系统${label}仅管理员可修改`);
    return;
  }
  if (tpl.user_id == null) {
    if (!isAdmin) throw new ForbiddenException(`公共${label}仅管理员可修改`);
    return;
  }
  if (tpl.user_id !== user?.id) {
    throw new ForbiddenException('只能操作自己的' + label);
  }
}

export function assertCanSetSystemFlag(isSystemFlag: boolean, user: TemplateActor, label = '模板') {
  if (isSystemFlag && user?.role !== 'admin') {
    throw new ForbiddenException(`仅管理员可创建系统${label}`);
  }
}
