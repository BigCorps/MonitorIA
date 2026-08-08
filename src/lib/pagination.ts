export function paginationWindow(
  currentPage: number,
  totalPages: number,
  windowSize = 5,
) {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safeCurrent = Math.max(
    1,
    Math.min(safeTotal, Math.floor(currentPage)),
  );
  const safeWindow = Math.max(1, Math.floor(windowSize));
  const blockStart =
    Math.floor((safeCurrent - 1) / safeWindow) * safeWindow + 1;
  const blockEnd = Math.min(
    safeTotal,
    blockStart + safeWindow - 1,
  );

  return {
    pages: Array.from(
      { length: blockEnd - blockStart + 1 },
      (_, index) => blockStart + index,
    ),
    hasPreviousBlock: blockStart > 1,
    hasNextBlock: blockEnd < safeTotal,
    previousBlockPage: Math.max(1, blockStart - 1),
    nextBlockPage: Math.min(safeTotal, blockEnd + 1),
  };
}
