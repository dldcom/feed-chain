import { useEffect, useState } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(documentRef: FullscreenDocument): Element | null {
  return documentRef.fullscreenElement ?? documentRef.webkitFullscreenElement ?? null;
}

export function FullscreenButton(): JSX.Element | null {
  const [supported] = useState(() => {
    if (typeof document === "undefined") return false;
    return Boolean(document.fullscreenEnabled || "webkitRequestFullscreen" in document.documentElement);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!supported) return undefined;
    const documentRef = document as FullscreenDocument;
    const syncState = (): void => setIsFullscreen(Boolean(fullscreenElement(documentRef)));
    syncState();
    document.addEventListener("fullscreenchange", syncState);
    document.addEventListener("webkitfullscreenchange", syncState);
    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      document.removeEventListener("webkitfullscreenchange", syncState);
    };
  }, [supported]);

  if (!supported) return null;

  const toggleFullscreen = async (): Promise<void> => {
    const documentRef = document as FullscreenDocument;
    try {
      if (isFullscreen) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await documentRef.webkitExitFullscreen?.();
        return;
      }
      const root = document.documentElement as FullscreenElement;
      if (root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
    } catch {
      // Fullscreen can be rejected by the browser or an embedded frame.
    }
  };

  return (
    <button
      type="button"
      className="fullscreen-toggle"
      aria-label={isFullscreen ? "전체화면 종료" : "전체화면"}
      aria-pressed={isFullscreen}
      title={isFullscreen ? "전체화면 종료" : "전체화면"}
      onClick={() => void toggleFullscreen()}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {isFullscreen ? (
          <path d="M3 7h4V3M13 3v4h4M17 13h-4v4M7 17v-4H3" />
        ) : (
          <path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" />
        )}
      </svg>
    </button>
  );
}
