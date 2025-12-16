import { HTMLAttributes, PropsWithChildren } from 'react';

export type HintProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>;

const Hint = ({ className = '', children, ...rest }: HintProps) => {
  const classes = ['hint', className].filter(Boolean).join(' ');
  return (
    <p className={classes} {...rest}>
      {children}
    </p>
  );
};

export default Hint;
