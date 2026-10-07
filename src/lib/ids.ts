import { z } from "zod";

const uuid = z.guid();

/** True when `value` is a well-formed UUID; callers treat anything else as "no such row". */
export const isUuid = (value: unknown): value is string => uuid.safeParse(value).success;
