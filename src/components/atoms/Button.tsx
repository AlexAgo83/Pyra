import { ButtonHTMLAttributes } from 'react';

export type ButtonProps = {
  variant?: 'primary' | 'ghost';
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const Button = ({ variant = 'primary', fullWidth, className = '', children, ...rest }: ButtonProps) => {
  const classes = [
    'btn',
    variant === 'ghost' ? 'btn--ghost' : 'btn--primary',
    fullWidth ? 'btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
};

export default Button;
