"use client";

import { startTransition, useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import type { FormState } from "@/app/(auth)/actions";

/**
 * Thay cho `<form action>`: React 19 tự reset form sau mỗi action (kể cả khi lỗi → mất dữ liệu đã nhập).
 * Hook này giữ nguyên dữ liệu khi có lỗi; chỉ reset khi thành công và `resetOnSuccess` = true.
 */
export function useSafeForm(
  action: (state: FormState, fd: FormData) => Promise<FormState>,
  opts: { resetOnSuccess?: boolean } = {},
) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  // false khi SSR/đang hydrate: chưa gắn onSubmit nên không cho gửi (tránh form gửi GET kèm dữ liệu lên URL)
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  }

  useEffect(() => {
    if (opts.resetOnSuccess && state && !state.error) ref.current?.reset();
  }, [state, opts.resetOnSuccess]);

  return { state, pending, disabled: pending || !hydrated, ref, onSubmit };
}
