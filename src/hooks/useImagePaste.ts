import { useEffect, useRef } from "react";

export function useImagePaste(onFile: (file: File) => void) {
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) onFileRef.current(file);
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);
}
