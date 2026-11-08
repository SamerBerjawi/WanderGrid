import { linesFromPieces, type PdfPiece } from '../utils/pdfLines';

/**
 * The text of a PDF (an e-ticket, boarding pass or hotel voucher), read in the browser so the file never
 * leaves the device. The PDF reader is loaded only when a PDF is chosen. Scanned pages with no text give an
 * empty string.
 */

const MAX_PAGES = 12;

export const pdfToText = async (data: ArrayBuffer): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    const pages: string[] = [];
    try {
        for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
            const page = await doc.getPage(n);
            const content = await page.getTextContent();
            const pieces: PdfPiece[] = content.items.flatMap(item => ('str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : []));
            pages.push(linesFromPieces(pieces).join('\n'));
        }
    } finally {
        void doc.destroy();
    }
    return pages.join('\n\n');
};
