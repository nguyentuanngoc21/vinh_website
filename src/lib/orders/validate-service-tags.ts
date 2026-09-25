export type TagOption = { group_key: string; label: string; multi: boolean };
export function validateServiceTags(tags: unknown, options: TagOption[]): boolean {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return false;
  return Object.entries(tags).every(([key, value]) => {
    const group = options.filter(option => option.group_key === key);
    if (!group.length) return false;
    const allowed = new Set(group.map(option => option.label));
    return group[0].multi
      ? Array.isArray(value) && value.length <= allowed.size && new Set(value).size === value.length && value.every(label => typeof label === 'string' && allowed.has(label))
      : typeof value === 'string' && (value === '' || allowed.has(value));
  });
}
