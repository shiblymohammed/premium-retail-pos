function pdfSafe(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/₹/g, 'INR ').replace(/×/g, 'x').replace(/−/g, '-').replace(/[→➜]/g, '->').replace(/[•·]/g, '-').replace(/[^\x20-\x7E]/g, '?');
}

export function downloadPdf(title: string, description: string, headers: string[], rows: unknown[][], filename: string) {
  const wrap = (value: string, width: number) => {
    const words = pdfSafe(value).split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (word.length > width) {
        if (line) lines.push(line);
        for (let offset = 0; offset < word.length; offset += width) lines.push(word.slice(offset, offset + width));
        line = '';
      } else if (!line) line = word;
      else if (`${line} ${word}`.length <= width) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const lines = [`PREMIUM RETAIL - ${pdfSafe(title)}`, pdfSafe(description), `Period: ${filename.match(/\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}/)?.[0]?.replace('-to-', ' through ') ?? 'Selected filters'}`, `Rows: ${rows.length}`, ''];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}.`);
    row.forEach((value, column) => {
      const label = headers[column] ?? `Field ${column + 1}`;
      wrap(`${label}: ${String(value ?? '')}`, 115).forEach((line, lineIndex) => lines.push(`${lineIndex ? '   ' : '   '}${line}`));
    });
    lines.push('');
  });

  const pages: string[][] = [];
  for (let offset = 0; offset < lines.length; offset += 46) pages.push(lines.slice(offset, offset + 46));
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const addObject = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = pages.map((pageLines, pageIndex) => {
    const contentLines = [...pageLines, '', `Page ${pageIndex + 1} of ${pages.length}`];
    const text = `BT\n/F1 8 Tf\n36 555 Td\n11 TL\n${contentLines.map((line) => `(${pdfSafe(line).replace(/[\\()]/g, '\\$&')}) Tj\nT*`).join('\n')}\nET`;
    const stream = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
    const contentId = addObject(stream);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdfDocument = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdfDocument.length); pdfDocument += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdfDocument.length;
  pdfDocument += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdfDocument], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = filename.replace(/\.csv$/, '.pdf'); link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(headers: string[], rows: unknown[][], filename: string) {
  const csv = [headers, ...rows].map((row) => row.map((value) => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? "'" + text : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
