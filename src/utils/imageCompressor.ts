/**
 * Compresses an image file client-side using Canvas to ensure it fits safely
 * under the Firestore 1MB document limit, while keeping good visual quality.
 */
export function compressImage(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file is not an image."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize proportional to maxDimension
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not obtain canvas 2D rendering context."));
          return;
        }

        // Draw and compress to JPEG format
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height); // Handing transparent PNGs cleanly
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (err) {
          reject(new Error("Local privacy policy prevented canvas serialization. Try another image."));
        }
      };
      img.onerror = () => reject(new Error("Could not parse image resource."));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read image file from disk."));
    reader.readAsDataURL(file);
  });
}
