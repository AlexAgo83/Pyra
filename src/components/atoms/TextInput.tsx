import { InputHTMLAttributes, forwardRef } from 'react';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({ className = '', ...rest }, ref) => {
  const classes = ['text-input', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} {...rest} />;
});

TextInput.displayName = 'TextInput';

export default TextInput;
