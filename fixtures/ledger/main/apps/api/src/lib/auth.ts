export function requireUser(req: any) {
  if (!req.user) throw new Error("unauthorized");
  return req.user;
}
