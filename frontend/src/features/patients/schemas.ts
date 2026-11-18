import { z } from "zod";

export const phoneRegex = /^\+?[0-9]{7,15}$/;

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

/**
 * Validates that a date string is a valid date strictly in the past.
 */
function isValidPastDate(val: string): boolean {
  if (!val) return false;
  const date = new Date(val);
  if (isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

export const MAX_TESTS_PER_RECEIPT = 50;
const MAX_TEST_NAME_LENGTH = 100;

const priceRegex = /^\d+(\.\d{1,2})?$/;

const testItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Test name is required")
    .max(MAX_TEST_NAME_LENGTH, "Test name cannot exceed 100 characters"),
  price: z.string().trim().regex(priceRegex, "Enter a valid price"),
});

/**
 * Patient creation Zod schema matching API_CONTRACT.md validation:
 * - name: 2 to 80 characters
 * - phone: 7 to 15 digits (optional leading plus)
 * - gender: MALE, FEMALE, OTHER
 * - dateOfBirth: past ISO date
 * - address: optional, up to 200 characters
 */
export const createPatientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name cannot exceed 80 characters"),
  phone: z
    .string()
    .trim()
    .regex(
      phoneRegex,
      "Phone must be between 7 and 15 digits with optional leading plus"
    ),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine(isValidPastDate, {
      message: "Date of birth must be a past date",
    }),
  address: z
    .string()
    .trim()
    .max(200, "Address cannot exceed 200 characters")
    .optional()
    .or(z.literal("")),
  tests: z
    .array(testItemSchema)
    .max(
      MAX_TESTS_PER_RECEIPT,
      `You can add up to ${MAX_TESTS_PER_RECEIPT} tests`
    ),
});

export type CreatePatientFormValues = z.infer<typeof createPatientSchema>;

/**
 * Patient update Zod schema matching API_CONTRACT.md validation.
 */
export const updatePatientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name cannot exceed 80 characters"),
  phone: z
    .string()
    .trim()
    .regex(
      phoneRegex,
      "Phone must be between 7 and 15 digits with optional leading plus"
    ),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine(isValidPastDate, {
      message: "Date of birth must be a past date",
    }),
  address: z
    .string()
    .trim()
    .max(200, "Address cannot exceed 200 characters")
    .optional()
    .or(z.literal("")),
});

export type UpdatePatientFormValues = z.infer<typeof updatePatientSchema>;
