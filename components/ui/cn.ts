import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names; later Tailwind utilities override conflicting earlier ones (e.g. w-full → w-48). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
