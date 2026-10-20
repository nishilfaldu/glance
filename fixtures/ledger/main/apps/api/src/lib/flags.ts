export function isEnabled(flag: string) {
  return process.env[`FLAG_${flag}`] === "1";
}
