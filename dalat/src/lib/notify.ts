/** Thông báo ngoài app. Phase 5 sẽ nối Telegram Bot + Web Push; hiện tại chỉ ghi log. */
export async function notifyUsers(userIds: (string | null | undefined)[], text: string, href?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  console.log(`[notify] -> ${ids.join(",")}: ${text}${href ? ` (${href})` : ""}`);
}
