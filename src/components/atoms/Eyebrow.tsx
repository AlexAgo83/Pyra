import { HTMLAttributes, PropsWithChildren } from 'react';

export type EyebrowProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>>;

const Eyebrow = ({ className = '', children, ...rest }: EyebrowProps) => {
  const classes = ['eyebrow', className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
};

export default Eyebrow;
