import { cn } from "@/lib/utils";

const TONE = {
  confirmed: "bg-status-confirmed-bg",
  holding: "bg-status-holding",
  checkedIn: "bg-status-checked-in",
  cancelled: "bg-status-cancelled",
  neutral: "bg-muted",
} as const;

export type BadgeTone = keyof typeof TONE;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={cn("inline-flex shrink-0 items-center rounded-full border border-black px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-black", TONE[tone], className)}
    />
  );
}

export const BOOKING_TONE: Record<string, BadgeTone> = {
  HOLDING: "holding", CONFIRMED: "confirmed", CHECKED_IN: "checkedIn", CHECKED_OUT: "neutral", CANCELLED: "cancelled",
};
export const LINK_TONE: Record<string, BadgeTone> = { PENDING: "holding", APPROVED: "confirmed", REJECTED: "cancelled", BLOCKED: "cancelled" };
