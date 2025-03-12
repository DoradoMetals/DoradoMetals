import * as z from "zod";

export const userSchema = z.object({
  id: z.string().uuid().optional(), // UUID, optional since DB can generate it
  email: z.string().email().min(1, "Email is required"), // Required email
  name: z.string().min(1, "Name is required"), // Required name
  createdAt: z.date().optional(), // Timestamp, optional as DB defaults it
  updatedAt: z.date().optional(), // Timestamp, optional as DB defaults it
  emailVerified: z.boolean().optional(), // Optional boolean
  image: z.string().url().nullable().optional(),
  role: z.string().optional(), // Role as text, optional\
});

export type User = z.infer<typeof userSchema>;