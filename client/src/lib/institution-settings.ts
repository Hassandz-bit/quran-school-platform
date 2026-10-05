import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const SCHOOL_LOGO_BUCKET = "school-logos";
export const SCHOOL_LOGO_MAX_BYTES = 1_048_576;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type InstitutionSettingsInput = {
  schoolId: string;
  name: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  websiteUrl: string;
  currentLogoPath: string | null;
  logoFile: File | null;
  removeLogo: boolean;
};

export function getInstitutionLogoUrl(
  logoPath: string | null | undefined,
  client?: SupabaseClient
): string | null {
  if (!logoPath) return null;
  const { data } = (client ?? getSupabaseClient())
    .storage.from(SCHOOL_LOGO_BUCKET).getPublicUrl(logoPath);
  return data.publicUrl || null;
}

export async function hasInstitutionSettingsPermission(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: "school.update",
  });
  if (error) throw error;
  return data === true;
}

function normalizedOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function saveInstitutionSettings(
  input: InstitutionSettingsInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 150) {
    throw new Error("institution_name_invalid");
  }

  const phone = normalizedOptionalText(input.contactPhone);
  const email = normalizedOptionalText(input.contactEmail);
  const address = normalizedOptionalText(input.address);
  const websiteUrl = normalizedOptionalText(input.websiteUrl);
  if (phone && phone.length > 40) throw new Error("institution_phone_invalid");
  if (email && email.length > 254) throw new Error("institution_email_invalid");
  if (address && address.length > 500) throw new Error("institution_address_invalid");
  if (websiteUrl && websiteUrl.length > 500) throw new Error("institution_website_invalid");

  let uploadedLogoPath: string | null = null;
  let nextLogoPath = input.currentLogoPath;

  if (input.logoFile) {
    if (!ALLOWED_LOGO_TYPES.has(input.logoFile.type)) {
      throw new Error("institution_logo_type_invalid");
    }
    if (input.logoFile.size <= 0 || input.logoFile.size > SCHOOL_LOGO_MAX_BYTES) {
      throw new Error("institution_logo_size_invalid");
    }

    const extension = input.logoFile.type === "image/png"
      ? "png"
      : input.logoFile.type === "image/webp"
        ? "webp"
        : "jpg";
    uploadedLogoPath = `${input.schoolId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage
      .from(SCHOOL_LOGO_BUCKET)
      .upload(uploadedLogoPath, input.logoFile, {
        cacheControl: "86400",
        contentType: input.logoFile.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;
    nextLogoPath = uploadedLogoPath;
  } else if (input.removeLogo) {
    nextLogoPath = null;
  }

  const { data, error } = await client
    .from("schools")
    .update({
      name,
      contact_phone: phone,
      contact_email: email,
      address,
      website_url: websiteUrl,
      logo_path: nextLogoPath,
    })
    .eq("id", input.schoolId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (uploadedLogoPath) {
      await client.storage.from(SCHOOL_LOGO_BUCKET).remove([uploadedLogoPath]);
    }
    if (error) throw error;
    throw new Error("institution_settings_update_failed");
  }

  if (input.currentLogoPath && input.currentLogoPath !== nextLogoPath) {
    // A stale logo should not block the already-saved institution settings.
    await client.storage.from(SCHOOL_LOGO_BUCKET).remove([input.currentLogoPath]);
  }
}
