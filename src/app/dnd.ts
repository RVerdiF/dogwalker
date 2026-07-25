/**
 * Shared drag-and-drop contract for File Tree entries (PRODUCT.md §8). A file
 * row is a native HTML5 drag carrying its absolute path; terminals inject it,
 * the canvas turns it into a preview node.
 */
export const DW_FILE_MIME = 'application/x-dogwalker-file';

/** Put a file path on a drag event (both our type and text/plain). */
export function setFileDrag(e: React.DragEvent, filePath: string): void {
  e.dataTransfer.setData(DW_FILE_MIME, filePath);
  e.dataTransfer.setData('text/plain', filePath);
  e.dataTransfer.effectAllowed = 'copy';
}

/** Read a dragged file path, or '' if this drag isn't one of ours. */
export function getFileDrag(e: React.DragEvent): string {
  return e.dataTransfer.getData(DW_FILE_MIME);
}
