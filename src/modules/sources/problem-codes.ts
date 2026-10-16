// The codes a read of a saved link can end in (spec s6.4). Its own file so the public entry can name them without reaching the desk's record shapes.
export const PROBLEM_CODES = ["not_found", "not_embeddable", "not_page", "too_big_image", "refused", "timeout", "unavailable", "purged"] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];
