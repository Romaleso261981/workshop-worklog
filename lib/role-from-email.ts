/** Client-safe role resolution (same lists as former server env). */

function list(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function roleFromEmail(email: string): "ADMIN" | "OWNER" | "EMPLOYEE" {
  const e = email.trim().toLowerCase();
  if (list(process.env.NEXT_PUBLIC_WORKSHOP_ADMIN_EMAILS).includes(e)) {
    return "ADMIN";
  }
  if (list(process.env.NEXT_PUBLIC_WORKSHOP_OWNER_EMAILS).includes(e)) {
    return "OWNER";
  }
  return "EMPLOYEE";
}
