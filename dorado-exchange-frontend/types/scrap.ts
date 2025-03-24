import * as z from "zod";

export const scrapSchema = z.object({
  id: z.string().uuid().optional(),
  metal_id: z.string().uuid(),
  gem_id: z.string().uuid().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  gross: z.number().optional(),
  purity: z.number().optional(),
  content: z.number().optional(),
});

export type Scrap = z.infer<typeof scrapSchema>;