import type { PASSWORD_SIGNUP_COPY } from './copy-password-signup';

export const PASSWORD_SIGNUP_COPY_EN = {
  open: 'Create an account',
  title: 'Create an account',
  confirmPassword: 'Confirm password',
  confirmPlaceholder: 'Enter the password again',
  submit: 'Register and log in',
  busy: 'Registering…',
  cancel: 'Back to login',
  note: 'Password registration is enabled on this server. Existing accounts can log in directly. Registration logs you in automatically; your browser only saves the session token.',
  usernameInvalid: 'Username must be 1–32 characters after trimming, with no spaces or control characters.',
  passwordInvalid: 'Password must be 6–64 characters.',
  passwordMismatch: 'Passwords do not match.',
  usernameTaken: 'That username already exists. Log in or choose another name.',
  rateLimited: 'Too many attempts. Please try again later.',
  closed: 'Password registration is not enabled on this server. Use an existing account or a third-party login.',
} satisfies typeof PASSWORD_SIGNUP_COPY;
