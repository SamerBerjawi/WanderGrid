import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names, letting later Tailwind classes win (KokonutUI ports and the New pages). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
