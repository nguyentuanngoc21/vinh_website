import { useState } from 'react';
import { fromIsoDate, toIsoDate } from '../services/profile';
import { Field } from './Form';
import type { DateFieldProps } from './DateField';

// The native date picker has no web implementation; the browser preview keeps a typed dd/mm/yyyy field.
export function DateField({ label, value, onChange, disabled, hint }: DateFieldProps) {
  const [text, setText] = useState(fromIsoDate(value));
  const iso = toIsoDate(text);
  return <Field label={label} value={text} editable={!disabled} placeholder="dd/mm/yyyy" maxLength={10} hint={hint}
    onChangeText={next => { setText(next); const parsed = toIsoDate(next); if (parsed !== null) onChange(parsed); }}
    error={text && iso === null ? 'Nhập ngày hợp lệ theo dạng dd/mm/yyyy.' : undefined} />;
}
