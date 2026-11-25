import { type ComponentProps } from 'react';
import { Dialog } from './PageParts';

export function Sheet(props: Omit<ComponentProps<typeof Dialog>, 'className'>) {
  return <Dialog {...props} className="dc-sheet" />;
}
