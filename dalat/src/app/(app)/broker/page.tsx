import { redirect } from "next/navigation";

// Màn hình chính của CTV là Lịch (theo ngày)
export default function BrokerHome() {
  redirect("/broker/calendar");
}
