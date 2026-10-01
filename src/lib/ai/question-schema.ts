import { z } from 'zod'

export const generatedQuestionSchema = z.object({
  enunciado: z.string().trim().min(10).max(10000),

  alternativa_a: z.string().trim().min(1).max(5000),
  alternativa_b: z.string().trim().min(1).max(5000),
  alternativa_c: z.string().trim().min(1).max(5000),
  alternativa_d: z.string().trim().min(1).max(5000),
  alternativa_e: z.string().trim().min(1).max(5000),

  gabarito: z.enum(['A', 'B', 'C', 'D', 'E']),

  explicacao: z.string().trim().min(1).max(20000),
})

export const generatedQuestionsSchema = z.object({
  questoes: z
    .array(generatedQuestionSchema)
    .min(1)
    .max(50),
})

export const generatedQuestionWithDiversitySchema = generatedQuestionSchema.extend({
  conceito_central: z.string().trim().min(2).max(200),
  abordagem_cognitiva: z.string().trim().min(2).max(200),
})

export const generatedQuestionsWithDiversitySchema = z.object({
  assunto_estreito: z.boolean().default(false),
  questoes: z.array(generatedQuestionWithDiversitySchema).min(1).max(50),
})

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>
export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>
export type GeneratedQuestionWithDiversity = z.infer<typeof generatedQuestionWithDiversitySchema>
