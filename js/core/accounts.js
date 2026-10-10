// Account rules for sign-up and sign-in.
//
// The sign-up form uses these for live checks; the server applies the same
// rules in server/accounts.py and has the final say. Keep the messages in the
// two files identical: tests/account-cases.json is checked against both.
//
// Lengths count Unicode characters (code points), so an emoji counts as one
// character in the browser and on the server alike.

export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;
const EMAIL_LOCAL_MAX = 64;

const WHITESPACE = /\s/u;
const INVISIBLE = /\p{Cf}|\p{Cc}/u;
const CAPITAL = /\p{Lu}/u;
const SPECIAL = /[^\p{L}\p{N}\s]/u;

// name@example.com: letters, digits and the usual symbols before the @; a
// domain of dot-separated labels that don't start or end with a hyphen; and a
// final label of at least two letters.
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const EMAIL_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const RESERVED_DOMAIN_LABELS = new Set(['localhost', 'local']);

const characters = (text) => [...text].length;

function validEmailDomain(domain) {
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return false;
  if (labels.some((label) => RESERVED_DOMAIN_LABELS.has(label.toLowerCase()))) return false;
  const last = labels.at(-1);
  return /^[A-Za-z]{2,63}$/.test(last);
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Returns an error message for the username, or '' when it's valid. */
export function usernameError(username) {
  const value = String(username ?? '');
  if (value === '') return 'Enter a username.';
  if (WHITESPACE.test(value)) return "Usernames can't contain spaces.";
  if (INVISIBLE.test(value)) return "Usernames can't contain invisible characters.";
  if (value.includes('@')) return "Usernames can't contain @, so they can't be mistaken for an email address.";
  if (characters(value) > USERNAME_MAX) return `Keep your username to ${USERNAME_MAX} characters or fewer.`;
  return '';
}

/** Trims and lowercases an email address for storage and comparison. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function emailError(email) {
  const value = String(email ?? '').trim();
  if (value === '') return 'Enter your email address.';
  if (characters(value) > EMAIL_MAX) return 'That email address is too long.';
  if (value.includes(' ')) return 'Enter a valid email address, like name@example.com.';
  const at = value.lastIndexOf('@');
  if (at <= 0 || value.indexOf('@') !== at) return 'Enter a valid email address, like name@example.com.';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const valid = characters(local) <= EMAIL_LOCAL_MAX && EMAIL_LOCAL.test(local) && EMAIL_DOMAIN.test(domain) && validEmailDomain(domain);
  return valid ? '' : 'Enter a valid email address, like name@example.com.';
}

/**
 * The three password requirements, for the live checklist under the field.
 * @returns {Array<{id:string, label:string, met:boolean}>}
 */
export function passwordChecks(password) {
  const value = String(password ?? '');
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN} characters`, met: characters(value) >= PASSWORD_MIN },
    { id: 'capital', label: 'A capital letter (A–Z)', met: CAPITAL.test(value) },
    { id: 'special', label: 'A special character, like ! @ # or $', met: SPECIAL.test(value) },
  ];
}

export function passwordError(password) {
  const value = String(password ?? '');
  if (value === '') return 'Enter a password.';
  if (characters(value) > PASSWORD_MAX) return `Keep your password to ${PASSWORD_MAX} characters or fewer.`;
  const missing = [];
  if (characters(value) < PASSWORD_MIN) missing.push(`at least ${PASSWORD_MIN} characters`);
  if (!CAPITAL.test(value)) missing.push('a capital letter');
  if (!SPECIAL.test(value)) missing.push('a special character');
  return missing.length ? `Your password needs ${joinList(missing)}.` : '';
}

/**
 * Validates the sign-up form.
 * @returns {{ok:boolean, errors:Object<string,string>, value:{username:string, email:string, password:string}}}
 */
export function validateRegistration(input = {}) {
  const errors = {};
  const username = String(input.username ?? '');
  const password = String(input.password ?? '');
  const checks = { username: usernameError(username), email: emailError(input.email), password: passwordError(password) };
  for (const [field, message] of Object.entries(checks)) if (message) errors[field] = message;
  return { ok: Object.keys(errors).length === 0, errors, value: { username, email: normalizeEmail(input.email), password } };
}

/** Validates the sign-in form. The username or email is trimmed; the password never is. */
export function validateSignIn(input = {}) {
  const errors = {};
  const login = String(input.login ?? '').trim();
  const password = String(input.password ?? '');
  if (!login) errors.login = 'Enter your username or email.';
  if (!password) errors.password = 'Enter your password.';
  return { ok: Object.keys(errors).length === 0, errors, value: { login, password } };
}
