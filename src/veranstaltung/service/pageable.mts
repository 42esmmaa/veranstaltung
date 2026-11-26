export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_NUMBER = 0;

export type Pageable = {
  /** Seitennummer mit Zählung ab 0. */
  readonly number: number;
  readonly size: number;
};

export type PageableProps = {
  readonly number?: string | number;
  readonly size?: string | number;
};

export const createPageable = ({ number, size }: PageableProps): Pageable => {
  const requestedSize = Number(size);
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize >= 1 && requestedSize <= MAX_PAGE_SIZE
      ? requestedSize
      : DEFAULT_PAGE_SIZE;
  const requestedNumber = Number(number);
  const pageNumber = requestedNumber - 1;
  // Auch der berechnete Offset muss in den PostgreSQL-Integerbereich passen.
  return {
    number:
      Number.isSafeInteger(requestedNumber) &&
      pageNumber >= 0 &&
      pageNumber * pageSize <= 2_147_483_647
        ? pageNumber
        : DEFAULT_PAGE_NUMBER,
    size: pageSize,
  };
};
