import { en } from './en';
import { sw } from './sw';

export type Lang = 'en' | 'sw';
export type Dict = typeof en;

export const dictionaries: Record<Lang, Dict> = { en, sw };

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'sw';
}
