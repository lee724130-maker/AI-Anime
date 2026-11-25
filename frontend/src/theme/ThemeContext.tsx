import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';

// 主题状态存储 key（与生产一致：localStorage['frontend-theme']）
const THEME_KEY = 'frontend-theme';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// 读取持久化主题，默认 light（与生产 Oj 一致）
function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {
    /* ignore */
  }
  return 'light';
}

// 暗色 token 覆盖（生产 bundle kj 逐字还原）
// ⚠️ 2026-11-25 批次G：文字四级已按 WCAG AA 重新定档，与 index.css 的 CSS 令牌同步，
//    属于**主动偏离生产原样**的决定（原 tertiary #64748B / quaternary #475569 在
//    colorBgContainer #1E293B 上只有 3.07 / 1.93 对比度，placeholder 基本看不清）。
const DARK_TOKENS = {
  colorBgBase: '#0F172A',
  colorBgContainer: '#1E293B',
  colorBgElevated: '#1E293B',
  colorBgLayout: '#0F172A',
  colorBgSpotlight: '#1E293B',
  colorText: '#F1F5F9',
  colorTextSecondary: '#A3B1C5',   // 6.72:1（原 #94A3B8 = 5.71）
  colorTextTertiary: '#8798AF',    // 4.97:1（原 #64748B = 3.07）＝ CSS 侧 --text-muted
  colorTextQuaternary: '#6E7F96',  // 3.58:1（原 #475569 = 1.93）placeholder 层，
                                   // 深色底上「更弱」必然「更低对比」，这里取可读下限
  colorBorder: '#334155',
  colorBorderSecondary: '#94A3B8',
  colorFill: '#334155',
  colorFillSecondary: '#1E293B',
  colorFillTertiary: '#1A2332',
  colorFillQuaternary: '#0F172A',
  colorPrimary: '#818CF8',
  colorPrimaryBg: 'rgba(129,140,248,0.08)',
  colorPrimaryBgHover: 'rgba(129,140,248,0.12)',
  colorPrimaryBorder: '#818CF8',
  colorPrimaryBorderHover: '#A5B4FC',
  colorPrimaryHover: '#A5B4FC',
  colorPrimaryActive: '#6C5CE7',
  colorError: '#F87171',
  colorErrorBg: 'rgba(248,113,113,0.08)',
  colorSuccess: '#34D399',
  colorSuccessBg: 'rgba(52,211,153,0.08)',
  colorWarning: '#FBBF24',
  colorWarningBg: 'rgba(251,191,36,0.08)',
  colorLink: '#818CF8',
  colorLinkHover: '#A5B4FC',
  colorTextBase: '#F1F5F9',
};

// 暗色组件级覆盖（生产 bundle 逐字还原）
const DARK_COMPONENTS = {
  Card: { colorBgContainer: '#1E293B', colorBorderSecondary: '#94A3B8', borderRadiusLG: 12 },
  Table: { colorBgContainer: '#1E293B', headerBg: '#1A2332', borderRadius: 8 },
  Input: { colorBgContainer: '#1E293B', borderRadius: 8 },
  Select: { colorBgContainer: '#1E293B', borderRadius: 8 },
  DatePicker: { colorBgContainer: '#1E293B', borderRadius: 8 },
  Drawer: { colorBgContainer: '#0F172A', colorBgElevated: '#0F172A' },
  Alert: { infoBg: 'rgba(129,140,248,0.08)', infoBorderColor: '#818CF8' },
  Dropdown: { colorBgContainer: '#1E293B' },
  Tag: { defaultBg: 'rgba(255,255,255,0.06)', borderRadiusSM: 4 },
  Progress: { trailColor: '#1E293B', defaultBg: '#1E293B' },
  Button: { borderRadius: 8, controlHeight: 40, primaryShadow: 'none', defaultShadow: 'none' },
  Modal: { borderRadiusLG: 12 },
  Menu: { darkItemBg: '#0F172A', darkSubMenuItemBg: '#0F172A', darkItemSelectedBg: 'rgba(129,140,248,0.08)' },
};

// 浅色文字四级覆盖（11-25 批次G 新增）
// 原先浅色分支完全不注入 token（if (isDark) 才注入），placeholder 走 antd 默认
// rgba(0,0,0,.25) = 1.84:1、三级文字 #9ca3af = 2.54:1，均不达 WCAG AA。
// 这里只覆盖文字层级，其余仍由 defaultAlgorithm 从 colorTextBase 推导，避免连带改动别的色。
const LIGHT_TOKENS = {
  colorTextSecondary: '#4F5765',   // 7.28:1（原 antd 默认 ≈ 4.6）
  colorTextTertiary: '#656E7C',    // 5.15:1 ＝ CSS 侧 --text-muted
  colorTextQuaternary: '#7D8695',  // 3.67:1（原 rgba(0,0,0,.25) = 1.84）placeholder 层
};

// ThemeProvider（生产 Aj 逐字还原）
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  // data-theme 属性同步 + 持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const setThemeCb = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  const isDark = theme === 'dark';
  const config: Record<string, unknown> = {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  };
  if (isDark) {
    config.token = DARK_TOKENS;
    config.components = DARK_COMPONENTS;
  } else {
    config.token = LIGHT_TOKENS;
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme: setThemeCb }}>
      <ConfigProvider theme={config}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}

// useTheme hook（生产 jj 逐字还原，带安全默认值）
export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) || {
      theme: 'light',
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    }
  );
}
