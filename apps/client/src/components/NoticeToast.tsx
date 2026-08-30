import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";

export function NoticeToast(): JSX.Element | null {
  const notice = useGameStore((state) => state.notice);
  const clear = useGameStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clear, 2200);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;
  return <div className={`notice-toast notice-${notice.kind}`}>{notice.text}</div>;
}

