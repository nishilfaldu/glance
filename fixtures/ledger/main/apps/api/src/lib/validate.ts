export function isEmail(text: string) {
  return /^[^@]+@[^@]+$/.test(text);
}
