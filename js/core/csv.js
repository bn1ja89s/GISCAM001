export function normalizeCsvToken(value = "") {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text) {
  const firstContentLine = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim());

  if (!firstContentLine) {
    return ",";
  }

  return countDelimiter(firstContentLine, ";") > countDelimiter(firstContentLine, ",") ? ";" : ",";
}

export function parseCsvText(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(input);
  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  rows.push(currentRow);

  const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell || "").trim() !== ""));
  if (!nonEmptyRows.length) {
    return {
      headers: [],
      normalizedHeaders: [],
      rows: [],
    };
  }

  const headers = nonEmptyRows[0].map((cell) => String(cell || "").trim());
  const normalizedHeaders = headers.map((header) => normalizeCsvToken(header));

  return {
    headers,
    normalizedHeaders,
    rows: nonEmptyRows.slice(1).map((cells, rowIndex) => {
      const values = {};

      normalizedHeaders.forEach((header, headerIndex) => {
        if (!header) {
          return;
        }

        values[header] = String(cells[headerIndex] ?? "").trim();
      });

      return {
        lineNumber: rowIndex + 2,
        values,
      };
    }),
  };
}