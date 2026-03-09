/**
 * PDF Loader – Uses pdf.js to render PDF pages to canvas/images.
 */

/**
 * Load a PDF from a URL and return page rendering functions.
 * @param {string} url - URL to the PDF file
 * @returns {Promise<{numPages: number, renderPage: function}>}
 */
export async function loadPdf(url) {
    const loadingTask = pdfjsLib.getDocument({
        url: url,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
    });

    const pdf = await loadingTask.promise;

    return {
        numPages: pdf.numPages,

        /**
         * Render a specific page to a canvas or return as image data.
         * @param {number} pageNum - 1-indexed page number
         * @param {number} scale - Render scale (1.0 = 72dpi)
         * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
         */
        async renderPage(pageNum, scale = 2.0) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');

            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            return {
                canvas,
                width: viewport.width,
                height: viewport.height
            };
        },

        /**
         * Render a page thumbnail at lower resolution.
         */
        async renderThumbnail(pageNum, maxWidth = 300) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });

            const scale = maxWidth / viewport.width;
            const thumbViewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = thumbViewport.width;
            canvas.height = thumbViewport.height;

            const ctx = canvas.getContext('2d');

            await page.render({
                canvasContext: ctx,
                viewport: thumbViewport
            }).promise;

            return canvas;
        }
    };
}
