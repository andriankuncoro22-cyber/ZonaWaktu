export async function uploadToCloudinary(file: File, config?: any) {
  const cloudName = config?.cloudinaryCloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "w64lomhk";
  const uploadPreset = config?.cloudinaryUploadPreset || process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "zona_waktu";
  const folder = config?.cloudinaryFolder || process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER || "logo";

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary belum dikonfigurasi. Isi cloud name dan upload preset di pengaturan absensi.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "Gagal mengunggah foto ke Cloudinary");
  }

  return result.secure_url as string;
}
