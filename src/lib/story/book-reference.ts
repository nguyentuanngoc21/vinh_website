/** New links use the immutable book ID; legacy slug links remain readable. */
export function bookReferenceColumn(reference: string): "id" | "slug" {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference) ? "id" : "slug";
}
