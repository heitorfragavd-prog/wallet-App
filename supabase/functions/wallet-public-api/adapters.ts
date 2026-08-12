export async function sendToTelegram(
  chatId: string,
  text: string,
  botToken: string
): Promise<boolean> {
  try {
    const MAX_LENGTH = 4096;
    const truncated = text.length > MAX_LENGTH ? text.substring(0, MAX_LENGTH - 3) + "..." : text;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncated,
        parse_mode: "Markdown",
      }),
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[Telegram send failed] Status: ${resp.status}, Body: ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sendToTelegram Error]", err);
    return false;
  }
}

export async function sendToWhatsApp(
  channelId: string, // WhatsApp number or Group JID
  text: string,
  instanceName: string,
  evolutionUrl: string,
  evolutionApiKey: string
): Promise<boolean> {
  try {
    const cleanUrl = evolutionUrl.endsWith("/") ? evolutionUrl.slice(0, -1) : evolutionUrl;
    const url = `${cleanUrl}/message/sendText/${instanceName}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionApiKey,
      },
      body: JSON.stringify({
        number: channelId,
        options: {
          delay: 1200,
          presence: "composing",
        },
        textMessage: {
          text: text,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[WhatsApp send failed] Status: ${resp.status}, Body: ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sendToWhatsApp Error]", err);
    return false;
  }
}
