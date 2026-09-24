export function notificationChat(link: string | null) {
  if (!link || !link.startsWith('/ca-nhan?')) return null;
  const url = new URL(link, 'https://vinh.invalid');
  const chat = url.searchParams.get('chat');
  if (url.pathname !== '/ca-nhan' || url.searchParams.get('tab') !== 'chat' || !chat ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chat)) return null;
  return { chat, context: url.searchParams.get('context') === 'moderation' ? 'moderation' : 'personal' };
}
