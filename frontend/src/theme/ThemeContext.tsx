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
const DARK_TOKENS = {
  colorBgBase: '#0F172A',
  colorBgContainer: '#1E293B',
  colorBgElevated: '#1E293B',
  colorBgLayout: '#0F172A',
  colorBgSpotlight: '#1E293B',
  colorText: '#F1F5F9',
  colorTextSecondary: '#94A3B8',
  colorTextTertiary: '#64748B',
  colorTextQuaternary: '#475569',
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
