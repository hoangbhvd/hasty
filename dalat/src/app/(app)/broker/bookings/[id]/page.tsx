import { requireUser } from "@/lib/session";
import { BookingDetail } from "@/components/booking-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  return <BookingDetail userId={user.id} bookingId={id} viewer="BROKER" />;
}
