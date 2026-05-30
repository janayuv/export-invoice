/**
 * Field length limits — keep in sync with src-tauri/src/validation.rs
 */
export const LIMITS = {
  SHORT_TEXT: 128,
  MEDIUM_TEXT: 512,
  LONG_TEXT: 4000,
  ADDRESS: 2000,
  NOTES: 4000,
  DESCRIPTION: 2000,
  PART_NUMBER: 128,
  SA_NUMBER: 64,
  UNIT: 32,
  INVOICE_NUMBER: 64,
  PO_NUMBER: 64,
  NAME: 128,
  MAX_LINE_ITEMS: 500,
  MAX_PACKING_ROWS: 500,
} as const;

export type LimitKey = keyof typeof LIMITS;
