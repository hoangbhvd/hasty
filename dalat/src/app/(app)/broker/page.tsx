import { redirect } from "next/navigation";

// Màn hình chính của CTV là Lịch trống
export default function BrokerHome() {
  redirect("/broker/availability");
}
