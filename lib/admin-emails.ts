export function adminEmailList(): string[] {
  return (process.env.WORKSHOP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmailList().includes(email.trim().toLowerCase());
}
