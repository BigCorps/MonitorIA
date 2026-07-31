import { createSocialImage, socialImageSize } from "@/src/components/seo/social-image";

export const alt = "MonitorIA.cam — memória visual pesquisável para câmeras";
export const size = socialImageSize;
export const contentType = "image/png";

export default function TwitterImage() {
  return createSocialImage();
}
