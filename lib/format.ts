export function formatDateTime(d: Date): string {
  return d.toLocaleString("uk-UA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
