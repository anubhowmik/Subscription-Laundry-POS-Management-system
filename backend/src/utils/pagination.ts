export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: Record<string, unknown>, maxLimit = 100): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query.limit ?? "25"), 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Resolves ?sortBy=&sortOrder= against a whitelist to prevent arbitrary
 * column injection into Prisma orderBy.
 */
export function parseSort(
  query: Record<string, unknown>,
  allowedFields: string[],
  defaultField: string,
): Record<string, "asc" | "desc"> {
  const requested = String(query.sortBy ?? defaultField);
  const field = allowedFields.includes(requested) ? requested : defaultField;
  const order = String(query.sortOrder ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return { [field]: order };
}
