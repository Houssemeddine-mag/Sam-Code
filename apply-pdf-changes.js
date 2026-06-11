const fs = require('fs');
const path = './src/renderer/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');
const CRLF = '\r\n';

// 1. Add PdfViewer import
code = code.replace(
  "import TerminalDock from './TerminalDock'" + CRLF + "import { inferProviderFromConnection",
  "import TerminalDock from './TerminalDock'" + CRLF + "import PdfViewer from './PdfViewer'" + CRLF + "import { inferProviderFromConnection"
);

// 2. Add mainRef
code = code.replace(
  'const messagesScrollRef = useRef(null)' + CRLF + CRLF + '  // Diff view state',
  'const messagesScrollRef = useRef(null)' + CRLF + '  const mainRef = useRef(null)' + CRLF + CRLF + '  // Diff view state'
);

// 3. Fix terminal resize handler
code = code.replace(
  "if (kind === 'terminal') {" + CRLF + "        const nextHeight = clamp(" + CRLF + "          window.innerHeight - event.clientY," + CRLF + "          180," + CRLF + "          Math.round(window.innerHeight * 0.65)" + CRLF + "        )",
  "if (kind === 'terminal') {" + CRLF + "        const mainEl = mainRef.current" + CRLF + "        if (!mainEl) return" + CRLF + "        const mainBottom = mainEl.getBoundingClientRect().bottom" + CRLF + "        const nextHeight = clamp(" + CRLF + "          Math.round(mainBottom - event.clientY)," + CRLF + "          180," + CRLF + "          Math.round(mainEl.clientHeight * 0.65)" + CRLF + "        )"
);

// 4. Add PDF state variables
code = code.replace(
  'const notebookToolbarVisible = activeIsNotebook && notebookExtensionAvailable' + CRLF + '  const notebookCells',
  "const notebookToolbarVisible = activeIsNotebook && notebookExtensionAvailable" + CRLF + "  const pdfViewerAvailable = packageInstallationSet.has('pdf-viewer')" + CRLF + "  const activeIsPdf = activePath ? activePath.toLowerCase().endsWith('.pdf') : false" + CRLF + '  const notebookCells'
);

// 5. Add mainRef to main element
code = code.replace(
  '<main' + CRLF + '            className={`relative flex min-w-0 flex-1 flex-col',
  '<main' + CRLF + '            ref={mainRef}' + CRLF + '            className={`relative flex min-w-0 flex-1 flex-col'
);

// 6. Add PDF viewer using separate && conditionals instead of nested ternary
// Replace the notebook toolbar closing + samcode-scrollbar div opening
code = code.replace(
  '                  )}' + CRLF + CRLF + '                  <div className="samcode-scrollbar relative min-h-0 flex-1 overflow-auto p-4">',
  '                  )}' + CRLF + CRLF +
  '                  {activeIsPdf && pdfViewerAvailable && (' + CRLF +
  '                    <PdfViewer filePath={activePath} pushActivity={pushActivity} />' + CRLF +
  '                  )}' + CRLF + CRLF +
  '                  {activeIsPdf && !pdfViewerAvailable && (' + CRLF +
  '                    <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">' + CRLF +
  '                      <Store size={48} className="mb-4 text-gray-500" />' + CRLF +
  '                      <h3 className="mb-2 text-lg font-semibold text-white">' + CRLF +
  '                        PDF Viewer not installed' + CRLF +
  '                      </h3>' + CRLF +
  '                      <p className="mb-4 max-w-sm text-sm text-gray-400">' + CRLF +
  "                        Install the {' '}" + CRLF +
  '                        <strong className="text-white">PDF Viewer</strong>{\' \'}' + CRLF +
  '                        extension from the Marketplace to open PDF files in the' + CRLF +
  '                        editor.' + CRLF +
  '                      </p>' + CRLF +
  '                      <button' + CRLF +
  '                        type="button"' + CRLF +
  '                        onClick={() => setMarketplaceOpen(true)}' + CRLF +
  '                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"' + CRLF +
  '                      >' + CRLF +
  '                        Open Marketplace' + CRLF +
  '                      </button>' + CRLF +
  '                    </div>' + CRLF +
  '                  )}' + CRLF + CRLF +
  '                  {!activeIsPdf && (' + CRLF +
  '                  <div className="samcode-scrollbar relative min-h-0 flex-1 overflow-auto p-4">'
);

// 7. Close the {!activeIsPdf && (...)} wrapper before the parent div closes
// The samcode-scrollbar div closes with </div>, then parent </div>, then ) : (
// We need to add )} after the samcode-scrollbar </div> but before the parent </div>
code = code.replace(
  '                  </div>' + CRLF + '                </div>' + CRLF + '              ) : (' + CRLF + '                <div className="flex h-full flex-col items-center pt-24 text-center text-gray-400 bg-transparent">',
  '                  </div>' + CRLF + '                  )}' + CRLF + '                </div>' + CRLF + '              ) : (' + CRLF + '                <div className="flex h-full flex-col items-center pt-24 text-center text-gray-400 bg-transparent">'
);

fs.writeFileSync(path, code);
console.log('All changes applied successfully');
