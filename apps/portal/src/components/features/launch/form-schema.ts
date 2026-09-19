/**
 * Validation for the launch form.
 *
 * Nothing here touches the chain, so the same rules run on every keystroke and
 * once more before we ask for a signature. The tracker validates again on
 * `POST /api/launch/metadata`; these limits match its.
 */

import { z } from 'zod';
import type { LaunchFormValues } from './types';
import { projectLinkProblem, type ProjectLinkPlatform } from '@/lib/launchlab/project-links';

export const MAX_NAME_LENGTH = 32;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_DEV_BUY_PERCENT = 50;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** A project link: empty, or something the field can settle into one canonical URL. */
const projectLink = (platform: ProjectLinkPlatform) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = projectLinkProblem(platform, value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    });

export const launchFormSchema = z.object({
  name: z.string().trim().min(1, 'Give your agent a name').max(MAX_NAME_LENGTH, `Keep the name to ${MAX_NAME_LENGTH} characters`),
  symbol: z
    .string()
    .trim()
    .min(1, 'Give your agent a symbol')
    .max(MAX_SYMBOL_LENGTH, `Keep the symbol to ${MAX_SYMBOL_LENGTH} characters`)
    .regex(/^[A-Za-z0-9$]+$/, 'Letters, numbers and $ only'),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH, `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters`),
  imageDataUrl: z
    .string()
    .nullable()
    .refine((value): value is string => value !== null && value.length > 0, 'Add an image for your agent'),
  website: projectLink('website'),
  twitter: projectLink('x'),
  telegram: projectLink('telegram'),
  devBuyPercent: z
    .number()
    .min(0, 'A dev buy cannot be negative')
    .max(MAX_DEV_BUY_PERCENT, `A dev buy tops out at ${MAX_DEV_BUY_PERCENT}% of supply`),
  devBuyQuoteAmount: z.number().min(0, 'A dev buy cannot be negative'),
});

export type FieldErrors = Partial<Record<keyof LaunchFormValues, string>>;

export type ValidationResult = { success: true } | { success: false; fieldErrors: FieldErrors };

/** Check the whole form. Returns the first error per field, in field order. */
export function validateLaunchForm(values: LaunchFormValues): ValidationResult {
  const result = launchFormSchema.safeParse(values);
  if (result.success) return { success: true };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in fieldErrors)) {
      fieldErrors[field as keyof LaunchFormValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

/** A file the browser will accept as token artwork. Returns the reason it will not. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    // Animated GIFs would be flattened to one frame anyway; say so rather than silently keep the first frame.
    if (file.type === 'image/gif') return 'GIFs are not supported: animation is dropped on chain. Export a PNG, JPEG or WebP';
    return 'Use a PNG, JPEG or WebP file';
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Keep the image under 2 MB';
  return null;
}

/** A symbol already on the Network. Case-insensitive, warning only. */
export function symbolCollision(symbol: string, existing: string[] = []): boolean {
  const candidate = symbol.trim().toUpperCase();
  if (!candidate) return false;
  return existing.some(s => s.trim().toUpperCase() === candidate);
}
