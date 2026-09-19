/**
 * Purpose: i18n barrel export — re-exports locale type and dictionaries
 */

export type Locale = 'en' | 'zh';

export { default as en } from './en';
export { default as zh } from './zh';
