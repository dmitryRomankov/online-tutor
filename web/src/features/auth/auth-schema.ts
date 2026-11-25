import isEmail from 'validator/lib/isEmail';
import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email.')
  .max(254, 'Enter a valid email address.');
// Use the same parser as the API's IsEmail, with the account-storage restrictions.
const registrationEmail = email.refine(
  (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) &&
    !value.endsWith('@retired.invalid') &&
    isEmail(value),
  'Enter a valid email address.'
);
const password = z.string().min(1, 'Enter your password.');
const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .refine(
      (value) =>
        [...value].length <= 100 && /\p{L}/u.test(value) && /^[\p{L}\p{M} '’\p{Pd}]+$/u.test(value),
      'Use up to 100 characters: letters, spaces, hyphens or apostrophes.'
    );

export function authSchema(mode: 'login' | 'register') {
  const registering = mode === 'register';
  return z
    .object({
      name: registering ? name('name') : z.string(),
      lastname: registering ? name('last name') : z.string(),
      email: registering ? registrationEmail : email,
      password: registering
        ? password.refine((value) => [...value].length >= 5, 'Use at least 5 characters.')
        : password,
      confirmation: z.string(),
      role: z.enum(['TUTOR', 'STUDENT']),
    })
    .superRefine((values, context) => {
      if (registering && values.password !== values.confirmation)
        context.addIssue({
          code: 'custom',
          path: ['confirmation'],
          message: 'Passwords do not match.',
        });
    });
}

export type AuthFormValues = z.infer<ReturnType<typeof authSchema>>;
