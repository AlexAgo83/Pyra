import { HTMLAttributes, PropsWithChildren } from 'react';

export type PanelProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

const Panel = ({ className = '', children, ...rest }: PanelProps) => {
  const classes = ['panel', className].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
};

export default Panel;
