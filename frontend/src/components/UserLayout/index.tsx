import type { ReactNode } from 'react';
import AppHeader from '../AppHeader';

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <AppHeader />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px)' }}>
        {children}
      </div>
    </div>
  );
}
