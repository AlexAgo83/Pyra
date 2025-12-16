import { LabelHTMLAttributes, PropsWithChildren } from 'react';

export type FieldLabelProps = PropsWithChildren<LabelHTMLAttributes<HTMLLabelElement>>;

const FieldLabel = ({ className = '', children, ...rest }: FieldLabelProps) => {
  const classes = ['field-label', className].filter(Boolean).join(' ');
  return (
    <label className={classes} {...rest}>
      {children}
    </label>
  );
};

export default FieldLabel;
