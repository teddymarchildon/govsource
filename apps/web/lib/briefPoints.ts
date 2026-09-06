import { z } from 'zod';

export const BriefPointSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  id: z.string().min(1).max(80).optional(),
  text: z.string().trim().max(900),
  source_refs: z.array(z.string().min(1).max(80)).default([]),
});

export function normalizeBriefPoints(points: z.infer<typeof BriefPointSchema>[]) {
  return points.map((point, index) => ({
    id: point.id || `point_${index + 1}`,
    text: point.text.trim(),
    label: point.label?.trim() || null,
    source_refs: [...new Set(point.source_refs)],
  })).filter((point) => point.text.length > 0);
}
