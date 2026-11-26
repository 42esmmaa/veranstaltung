import type { Pageable } from '../service/pageable.mts';
import type { Slice } from '../service/slice.mts';

export type Page<T> = {
  readonly content: T[];
  readonly page: {
    readonly size: number;
    readonly number: number;
    readonly totalElements: number;
    readonly totalPages: number;
  };
};

export function createPage<T>(
  { content, totalElements }: Slice<T>,
  { number, size }: Pageable,
): Page<T> {
  return {
    content,
    page: { size, number, totalElements, totalPages: Math.ceil(totalElements / size) },
  };
}
