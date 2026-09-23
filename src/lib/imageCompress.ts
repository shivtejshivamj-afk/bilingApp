/**
 * Resizes and compresses an image in the browser before it's stored.
 *
 * Menu photos are saved as data: URLs directly inside the database (no
 * separate file storage) — see MenuManager.tsx. That means the size of
 * what gets stored here directly eats into Supabase's database quota. An
 * unresized phone photo is typically 1–3MB; running it through this first
 * brings it down to roughly 20–60KB, a 30–50x reduction, without a
 * noticeable quality loss for a small menu thumbnail.
 */
export function compressImage(file: File, maxDimension = 800, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read the selected image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process this image on your device.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // JPEG, not PNG: menu photos don't need transparency, and JPEG
        // compresses photographic images far smaller at this quality level.
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
