import { z } from "zod";

/**
 * User information schema for checkout
 */
export const userInfoSchema = z.object({
  guest_identifier: z.string().optional(),
  user_name: z.string().min(1, "名前を入力してください"),
  user_email: z.string().email("有効なメールアドレスを入力してください"),
});

export type UserInfo = z.infer<typeof userInfoSchema>;

/**
 * Dynamic form field schema generator
 */
export function createGuestInfoSchema(fields: Array<{
  key: string;
  type: string;
  required?: boolean;
}>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  
  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny;
    
    switch (field.type) {
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "number":
        fieldSchema = z.number();
        break;
      case "email":
        fieldSchema = z.string().email();
        break;
      case "tel":
        fieldSchema = z.string().regex(/^[\d\-+\s()]+$/, "有効な電話番号を入力してください");
        break;
      default:
        fieldSchema = z.string();
    }
    
    if (!field.required) {
      fieldSchema = fieldSchema.optional();
    }
    
    shape[field.key] = fieldSchema;
  }
  
  return z.object(shape);
}

/**
 * Check-in request schema
 */
export const checkInSchema = z.object({
  ticket_uuid: z.string().uuid("有効なチケットIDを入力してください"),
  device_id: z.string().optional(),
  operator: z.string().optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
