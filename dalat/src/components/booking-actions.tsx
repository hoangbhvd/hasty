"use client";

import { ActionButton } from "@/components/action-button";
import { transitionAction } from "@/app/(app)/bookings/actions";

export function BookingActions({ id, status }: { id: string; status: string }) {
  const run = (a: "CONFIRM" | "CHECK_IN" | "CHECK_OUT" | "CANCEL") => () => transitionAction(id, a);
  return (
    <div className="flex flex-wrap gap-2">
      {status === "HOLDING" && <ActionButton action={run("CONFIRM")}>Xác nhận</ActionButton>}
      {status === "CONFIRMED" && <ActionButton action={run("CHECK_IN")}>Check-in</ActionButton>}
      {status === "CHECKED_IN" && <ActionButton action={run("CHECK_OUT")}>Check-out</ActionButton>}
      {(status === "HOLDING" || status === "CONFIRMED") && (
        <ActionButton action={run("CANCEL")} confirm="Huỷ booking này?" className="bg-destructive">Huỷ</ActionButton>
      )}
    </div>
  );
}
