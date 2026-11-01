/** Minimal, dependency-free CSV serialiser (RFC 4180 escaping). */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) {
    return columns?.join(",") ?? "";
  }

  const keys = columns ?? Object.keys(rows[0] as Record<string, unknown>);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text =
      typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const header = keys.map(escape).join(",");
  const body = rows.map((row) => keys.map((key) => escape(row[key])).join(","));

  return [header, ...body].join("\r\n");
}

export function sendCsv(
  res: { setHeader: (name: string, value: string) => void; send: (body: string) => void },
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[],
) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${toCsv(rows, columns)}`);
}
