const FONT_SIZE = 8;
const LEADING = 11;
const TEXT_WIDTH = 770;
const FIRST_BASELINE = 555;
const LINES_PER_PAGE = 46;

function pdfLiteral(value: string) {
  return value.replace(/[\\()]/g, '\\$&').replace(/[\xA0-\xFF]/g, (character) =>
    '\\' + character.charCodeAt(0).toString(8).padStart(3, '0'));
}

function utf16Hex(value: string) {
  let encoded = 'FEFF';
  for (let index = 0; index < value.length; index++) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return encoded;
}

export function downloadPdf(title: string, description: string, headers: string[], rows: unknown[][], filename: string) {
  const canvas = document.createElement('canvas');
  const scale = 3;
  canvas.width = TEXT_WIDTH * scale;
  canvas.height = LEADING * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF export needs browser canvas support.');
  context.font = `${FONT_SIZE * scale}px Arial, sans-serif`;

  const wrap = (value: string, indent = '') => {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r\n?|\n/)) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(indent + candidate).width <= canvas.width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (line && context.measureText(indent + line + character).width > canvas.width) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines.map((line) => indent + line);
  };

  const period = filename.match(/\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}/)?.[0]?.replace('-to-', ' through ') ?? 'Selected filters';
  const lines = [...wrap(`PREMIUM RETAIL - ${title}`), ...wrap(description), `Period: ${period}`, `Rows: ${rows.length}`, ''];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}.`);
    row.forEach((value, column) => {
      const label = headers[column] ?? `Field ${column + 1}`;
      lines.push(...wrap(`${label}: ${String(value ?? '')}`, '   '));
    });
    lines.push('');
  });

  const pages: string[][] = [];
  for (let offset = 0; offset < lines.length; offset += LINES_PER_PAGE) {
    pages.push(lines.slice(offset, offset + LINES_PER_PAGE));
  }

  const objects: string[] = [];
  const addObject = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = pages.map((pageLines, pageIndex) => {
    const images: string[] = [];
    const commands = [...pageLines, '', `Page ${pageIndex + 1} of ${pages.length}`].map((line, index) => {
      const baseline = FIRST_BASELINE - index * LEADING;
      if (/^[\x20-\x7E\xA0-\xFF]*$/.test(line)) {
        return `BT /F1 ${FONT_SIZE} Tf 36 ${baseline} Td (${pdfLiteral(line)}) Tj ET`;
      }

      // Let the browser shape scripts outside Helvetica's encoding with its
      // own font fallback. ActualText keeps the original line in the PDF.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000';
      context.fillText(line, 0, (LEADING - 2.5) * scale);
      const jpeg = atob(canvas.toDataURL('image/jpeg', 0.94).split(',')[1]);
      const hex = Array.from(jpeg, (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('') + '>';
      const imageId = addObject(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`);
      const name = `Line${index}`;
      images.push(`/${name} ${imageId} 0 R`);
      return [
        `/Span << /ActualText <${utf16Hex(line)}> >> BDC`,
        `q ${TEXT_WIDTH} 0 0 ${LEADING} 36 ${baseline - 2.5} cm /${name} Do Q`,
        `q BT /F1 ${FONT_SIZE} Tf 3 Tr 36 ${baseline} Td ( ) Tj ET Q`,
        'EMC',
      ].join('\n');
    });
    const text = commands.join('\n');
    const contentId = addObject(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << ${images.join(' ')} >> >> /Contents ${contentId} 0 R >>`);
  });

  objects[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
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
