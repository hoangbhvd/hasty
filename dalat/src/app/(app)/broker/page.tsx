import { redirect } from "next/navigation";

export default function BrokerHome() {
  redirect("/broker/search");
}
