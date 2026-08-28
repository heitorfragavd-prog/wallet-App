/**
 * Image Optimizer para Vision / OCR (Wallet IA)
 * 
 * Redimensiona imagens de celular/câmera muito pesadas para a resolução ideal de OCR (máx 2048px)
 * e comprime como JPEG de alta qualidade (0.90), evitando payloads gigantescos e garantindo
 * máxima nitidez para leitura de textos fiscais pelo Gemini Vision.
 */

export interface OptimizedImageResult {
  base64: string;
  dataUrl: string;
  blob: Blob;
  mimeType: string;
  size: number;
}

export async function optimizeImageForVision(file: File, maxDimension = 2048, quality = 0.90): Promise<OptimizedImageResult> {
  // Se for PDF, não altera
  if (file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve({
          base64,
          dataUrl,
          blob: file,
          mimeType: file.type,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;

      // Se a imagem já estiver dentro do limite de alta resolução (máx 2560px) e tamanho <= 5MB,
      // preservamos os bytes originais sem passar pelo Canvas/recompressão JPEG.
      if (width <= 2560 && height <= 2560 && file.size <= 5 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          resolve({
            base64,
            dataUrl,
            blob: file,
            mimeType: file.type || "image/jpeg",
            size: file.size,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      let targetWidth = width;
      let targetHeight = height;
      if (targetWidth > maxDimension || targetHeight > maxDimension) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
          targetHeight = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        // Fallback para leitura direta se canvas não estiver disponível
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          resolve({
            base64,
            dataUrl,
            blob: file,
            mimeType: file.type,
            size: file.size,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(",")[1];

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              base64,
              dataUrl,
              blob,
              mimeType,
              size: blob.size,
            });
          } else {
            resolve({
              base64,
              dataUrl,
              blob: file,
              mimeType,
              size: file.size,
            });
          }
        },
        mimeType,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve({
          base64,
          dataUrl,
          blob: file,
          mimeType: file.type,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    };

    img.src = url;
  });
}
