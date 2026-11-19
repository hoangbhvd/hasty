import { requireUser } from "@/lib/session";
import { ChatListPage } from "@/components/chat-pages";

export default async function Page() {
  const user = await requireUser();
  return <ChatListPage userId={user.id} viewer="HOST" />;
}
