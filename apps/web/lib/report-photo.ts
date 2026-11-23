export async function prepareReportPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일을 선택해 주세요.");
  if (file.size > 12 * 1024 * 1024) throw new Error("원본 사진은 12MB 이하로 선택해 주세요.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 변환하지 못했습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.75);
    if (result.length > 4_000_000) throw new Error("사진이 너무 큽니다. 크기를 줄여 다시 선택해 주세요.");
    return result;
  } finally { bitmap.close(); }
}
