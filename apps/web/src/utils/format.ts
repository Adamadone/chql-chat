/**
 * Extracts up to two initials from a display name.
 *
 * @example
 * getInitials("John Doe")   // "JD"
 * getInitials("Alice")      // "A"
 * getInitials(undefined)    // "?"
 */
export function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
