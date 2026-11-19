import { requireUser } from "@/lib/session";
import { ChatConversationPage } from "@/components/chat-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  return <ChatConversationPage userId={user.id} id={id} viewer="HOST" />;
}
