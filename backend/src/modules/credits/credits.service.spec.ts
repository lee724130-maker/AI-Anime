import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { CreditsService } from './credits.service';

/**
 * CreditsService 单元测试 —— 资金核心：预扣 / 退款 / 去重 / 各模块定价。
 * 全部用 mock EntityManager，不连真实数据库、不花积分。
 */
describe('CreditsService', () => {
  let service: CreditsService;
  let em: { query: jest.Mock };
  const originalSetTimeout = global.setTimeout;

  beforeEach(async () => {
    // 用假 timer，避免退款去重的 10 分钟 setTimeout 挂住测试进程
    jest.useFakeTimers();
    em = { query: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: getEntityManagerToken(), useValue: em },
      ],
    }).compile();
    service = module.get<CreditsService>(CreditsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    global.setTimeout = originalSetTimeout;
  });

  // ---------- getConfigInt ----------
  describe('getConfigInt', () => {
    it('返回配置里的合法正整数', async () => {
      em.query.mockResolvedValue([{ config_value: '42' }]);
      await expect(service.getConfigInt('k', 5)).resolves.toBe(42);
    });

    it('缺失配置时回退默认值', async () => {
      em.query.mockResolvedValue([]);
      await expect(service.getConfigInt('k', 7)).resolves.toBe(7);
    });

    it('非法值（0 / 负数 / 非数字）回退默认值', async () => {
      for (const bad of ['0', '-3', 'abc', '']) {
        em.query.mockResolvedValue([{ config_value: bad }]);
        await expect(service.getConfigInt('k', 9)).resolves.toBe(9);
      }
    });

    it('DB 查询抛错时回退默认值，不抛出', async () => {
      em.query.mockRejectedValue(new Error('db down'));
      await expect(service.getConfigInt('k', 11)).resolves.toBe(11);
    });
  });

  // ---------- charge ----------
  describe('charge', () => {
    it('cost<=0 直接成功，且不查库', async () => {
      await expect(service.charge(1, 0)).resolves.toBe(true);
      await expect(service.charge(1, -5)).resolves.toBe(true);
      expect(em.query).not.toHaveBeenCalled();
    });

    it('原子扣费 SQL 正确，affected>0 视为成功', async () => {
      em.query.mockResolvedValue({ affectedRows: 1 });
      await expect(service.charge(16, 5)).resolves.toBe(true);
      expect(em.query).toHaveBeenCalledWith(
        'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?',
        [5, 16, 5],
      );
    });

    it('affected=0（余额不足）返回 false，不扣', async () => {
      em.query.mockResolvedValue({ affectedRows: 0 });
      await expect(service.charge(16, 999)).resolves.toBe(false);
    });

    it('兼容数组形式的 affectedRows', async () => {
      em.query.mockResolvedValue([{ affectedRows: 1 }]);
      await expect(service.charge(16, 5)).resolves.toBe(true);
    });
  });

  // ---------- refund ----------
  describe('refund', () => {
    it('cost<=0 不退、不查库', async () => {
      await service.refund(16, 0, 'k');
      expect(em.query).not.toHaveBeenCalled();
    });

    it('正常退款：原子加分', async () => {
      await service.refund(16, 5, 'gen_t2i_1');
      expect(em.query).toHaveBeenCalledWith('UPDATE users SET credits = credits + ? WHERE id = ?', [5, 16]);
    });

    it('同一 refundKey 只退一次（去重）', async () => {
      await service.refund(16, 5, 'same-key');
      await service.refund(16, 5, 'same-key');
      expect(em.query).toHaveBeenCalledTimes(1);
    });

    it('无 refundKey 时不去重，每次都退', async () => {
      await service.refund(16, 5);
      await service.refund(16, 5);
      expect(em.query).toHaveBeenCalledTimes(2);
    });

    it('clearRefundKey 后允许再次退款（重试重扣场景）', async () => {
      await service.refund(16, 5, 'retry-key');
      service.clearRefundKey('retry-key');
      await service.refund(16, 5, 'retry-key');
      expect(em.query).toHaveBeenCalledTimes(2);
    });
  });

  // ---------- assertEnough / assertSufficient ----------
  describe('积分校验', () => {
    it('assertEnough：余额够则通过', async () => {
      em.query.mockResolvedValue({ affectedRows: 1 });
      await expect(service.assertEnough(16, 5, '生图')).resolves.toBeUndefined();
    });

    it('assertEnough：余额不足抛 400', async () => {
      em.query.mockResolvedValue({ affectedRows: 0 });
      await expect(service.assertEnough(16, 5, '生图')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('assertSufficient：只查不扣，余额不足抛 400', async () => {
      em.query.mockResolvedValue([{ credits: 3 }]);
      await expect(service.assertSufficient(16, 5, '生图')).rejects.toBeInstanceOf(BadRequestException);
      expect(em.query.mock.calls[0][0]).toContain('SELECT credits');
    });

    it('assertSufficient：余额够则通过且不扣费', async () => {
      em.query.mockResolvedValue([{ credits: 100 }]);
      await expect(service.assertSufficient(16, 5, '生图')).resolves.toBeUndefined();
      expect(em.query).toHaveBeenCalledTimes(1); // 只有 SELECT，没有 UPDATE
    });
  });

  // ---------- 定价公式 ----------
  describe('viral 定价', () => {
    it('viralGenerateCost：0/1/2/3 图 → 50/80/120/160', async () => {
      await expect(service.viralGenerateCost(0)).resolves.toBe(50);
      await expect(service.viralGenerateCost(1)).resolves.toBe(80);
      await expect(service.viralGenerateCost(2)).resolves.toBe(120);
      await expect(service.viralGenerateCost(3)).resolves.toBe(160);
    });

    it('viralGenerateCost：负数按 0 处理', async () => {
      await expect(service.viralGenerateCost(-5)).resolves.toBe(50);
    });
  });

  describe('drama 定价', () => {
    it('dramaSegmentCost：480p/720p/1080p → 120/240/360', async () => {
      await expect(service.dramaSegmentCost('480p')).resolves.toBe(120);
      await expect(service.dramaSegmentCost('720p')).resolves.toBe(240);
      await expect(service.dramaSegmentCost('1080p')).resolves.toBe(360);
    });

    it('dramaSegmentCost：未知分辨率回退 720p=240', async () => {
      await expect(service.dramaSegmentCost('4k')).resolves.toBe(240);
      await expect(service.dramaSegmentCost(undefined)).resolves.toBe(240);
    });
  });
});
