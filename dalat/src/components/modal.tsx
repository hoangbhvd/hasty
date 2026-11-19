"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Modal dùng <dialog> gốc: có sẵn focus trap, Esc để đóng. Nội dung chỉ mount khi mở (form luôn sạch). */
export function Modal({
  trigger, title, children,
}: {
  trigger: string;
  title: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <Button className="h-11" onClick={() => setOpen(true)}>{trigger}</Button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded border border-black bg-white p-0 shadow-brutal-lg backdrop:bg-black/40"
      >
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" aria-label="Đóng" onClick={close} className="brutal-btn grid size-9 place-items-center bg-white">✕</button>
          </div>
          {open && children(close)}
        </div>
      </dialog>
    </>
  );
}
