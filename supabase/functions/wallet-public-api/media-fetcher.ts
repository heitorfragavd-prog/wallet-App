import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export async function fetchTelegramMedia(fileId: string, botToken: string): Promise<string> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    
    if (!fileData.ok || !fileData.result?.file_path) {
      throw new Error(`Erro ao buscar informações do arquivo no Telegram: ${JSON.stringify(fileData)}`);
    }

    const filePath = fileData.result.file_path;
    const mediaRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    const arrayBuffer = await mediaRes.arrayBuffer();
    
    return encodeBase64(new Uint8Array(arrayBuffer));
  } catch (err) {
    console.error("[fetchTelegramMedia Error]", err);
    throw err;
  }
}

export async function fetchWhatsAppMedia(messageObj: any, evolutionUrl: string, evolutionApiKey: string): Promise<string> {
  try {
    // 1. Se o base64 já estiver presente no payload da Evolution API
    if (messageObj.imageMessage?.base64) {
      return messageObj.imageMessage.base64;
    }
    if (messageObj.documentMessage?.base64) {
      return messageObj.documentMessage.base64;
    }

    // 2. Se tiver URL direto no payload (algumas versões/configurações da Evolution API enviam a URL)
    const mediaUrl = messageObj.imageMessage?.url || messageObj.documentMessage?.url || messageObj.mediaUrl;
    if (mediaUrl && mediaUrl.startsWith("http")) {
      const mediaRes = await fetch(mediaUrl);
      const arrayBuffer = await mediaRes.arrayBuffer();
      return encodeBase64(new Uint8Array(arrayBuffer));
    }

    throw new Error("Mídia não encontrada no payload do WhatsApp e nenhuma URL para download foi fornecida.");
  } catch (err) {
    console.error("[fetchWhatsAppMedia Error]", err);
    throw err;
  }
}
