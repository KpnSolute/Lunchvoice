export function studentPublicId(id?: string | null): string {
  if (!id) return "Student";
  return `Student #${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
