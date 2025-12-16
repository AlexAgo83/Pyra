import { ReactNode } from 'react';
import Eyebrow from '../atoms/Eyebrow';

export type MainLayoutProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

const MainLayout = ({ eyebrow, title, subtitle, children }: MainLayoutProps) => (
  <div className="app">
    <header className="hero">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1>{title}</h1>
      {subtitle ? <p className="lede">{subtitle}</p> : null}
    </header>

    <main className="layout-single">{children}</main>
  </div>
);

export default MainLayout;
