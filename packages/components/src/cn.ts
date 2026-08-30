// The one class combiner, same recipe as the app's shared/utils/cn - here so
// the package depends on nothing of the app's.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
