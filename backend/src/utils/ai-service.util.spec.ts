// @nestjs/schedule 是纯 ESM 包，ts-jest 不转译 node_modules 会报 SyntaxError。
// 本测试只用 pickAgnesImageSize 纯函数，用 mock 顶掉这个依赖即可（jest.mock 会 hoist 到 import 前）。
jest.mock('@nestjs/schedule', () => ({
  Interval: () => () => undefined,
  Timeout: () => () => undefined,
  ScheduleModule: { forRoot: () => ({}) },
}));

import { AIServiceUtil, AGNES_IMAGE_MODELS, AGNES_IMAGE_RATIOS } from './ai-service.util';

/**
 * AIServiceUtil 纯逻辑单元测试 —— 不连网络、不连 DB、不花积分。
 * pickAgnesImageSize 是纯函数（只依赖入参做数学计算），用 Object.create 绕过构造注入。
 */
describe('AIServiceUtil 纯逻辑', () => {
  // 绕过构造函数（它要注入 AdminService/ModelConfigService/Lock），只借原型上的方法
  const util = Object.create(AIServiceUtil.prototype) as AIServiceUtil;
  const pick = (w?: number, h?: number, forced?: string) =>
    (util as any).pickAgnesImageSize(w, h, forced) as { size: string; ratio: string };

  describe('模型常量契约', () => {
    it('AGNES_IMAGE_MODELS 含 2.1 / 2.5 Flash', () => {
      expect(AGNES_IMAGE_MODELS).toContain('agnes-image-2.5-flash');
      expect(AGNES_IMAGE_MODELS).toContain('agnes-image-2.1-flash');
    });

    it('AGNES_IMAGE_RATIOS 含常用比例', () => {
      for (const r of ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9']) {
        expect(AGNES_IMAGE_RATIOS).toContain(r);
      }
    });
  });

  describe('pickAgnesImageSize - 档位自动判断（按像素数）', () => {
    it('低像素 → 1K', () => {
      expect(pick(800, 600).size).toBe('1K');
    });
    it('中像素 → 2K', () => {
      expect(pick(1600, 1200).size).toBe('2K');
    });
    it('高像素 → 3K', () => {
      expect(pick(2400, 1800).size).toBe('3K');
    });
    it('超高像素 → 4K', () => {
      expect(pick(4000, 3000).size).toBe('4K');
    });
  });

  describe('pickAgnesImageSize - 强制档位优先', () => {
    it('forcedSize 合法时覆盖自动判断', () => {
      expect(pick(800, 600, '4K').size).toBe('4K');
      expect(pick(4000, 3000, '1K').size).toBe('1K');
    });
    it('forcedSize 非法时回退自动判断', () => {
      expect(pick(800, 600, '8K').size).toBe('1K');
    });
  });

  describe('pickAgnesImageSize - 比例自动匹配（取最接近）', () => {
    it('正方形 → 1:1', () => {
      expect(pick(1000, 1000).ratio).toBe('1:1');
    });
    it('横屏 16:9 → 16:9', () => {
      expect(pick(1600, 900).ratio).toBe('16:9');
    });
    it('竖屏 9:16 → 9:16', () => {
      expect(pick(900, 1600).ratio).toBe('9:16');
    });
    it('2:3 竖版 → 2:3', () => {
      expect(pick(1000, 1500).ratio).toBe('2:3');
    });
    it('4:3 → 4:3', () => {
      expect(pick(1200, 900).ratio).toBe('4:3');
    });
  });

  describe('pickAgnesImageSize - 默认值', () => {
    it('不传宽高时按 1280x720（16:9 + 1K/2K 边界）', () => {
      const r = pick();
      expect(r.ratio).toBe('16:9');
      expect(r.size).toBe('1K'); // 1280*720=0.92MP <= 1.3 → 1K
    });
  });
});
