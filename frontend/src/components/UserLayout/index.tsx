import type { ReactNode } from 'react';
import AppHeader from '../AppHeader';

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb' }}>
      <AppHeader />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
        {children}
      </div>
    </div>
  );
}
