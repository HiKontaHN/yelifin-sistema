export const SOCIAL_PLATFORMS = ["facebook", "instagram", "whatsapp"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type OrganizationSocialLinks = Record<SocialPlatform, string | null>;

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

const PROFILE_HOSTS = {
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"],
  instagram: ["instagram.com", "www.instagram.com"],
};

const INTERNATIONAL_NUMBER = /^[1-9]\d{7,14}$/;
const MAX_LINK_LENGTH = 2048;

export function normalizeSocialLink(platform: SocialPlatform, value: string): string | null {
  const input = value.trim();
  if (!input || input.length > MAX_LINK_LENGTH) return null;

  if (platform === "whatsapp" && /^\+[\d\s().-]+$/.test(input)) {
    const number = input.replace(/\D/g, "");
    return INTERNATIONAL_NUMBER.test(number) ? `https://wa.me/${number}` : null;
  }

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname === "/") {
      return null;
    }
    if (url.href.length > MAX_LINK_LENGTH) return null;

    if (platform === "instagram" && url.hostname === "ig.me") {
      return /^\/m\/[a-z0-9._]{1,30}\/?$/i.test(url.pathname) ? url.href : null;
    }
    if (platform !== "whatsapp") {
      return PROFILE_HOSTS[platform].includes(url.hostname) ? url.href : null;
    }

    if (url.hostname === "wa.me") {
      const path = url.pathname.slice(1).replace(/\/$/, "");
      return INTERNATIONAL_NUMBER.test(path) || /^message\/[a-z\d]+$/i.test(path) ? url.href : null;
    }
    if (url.hostname === "api.whatsapp.com" && url.pathname === "/send") {
      const number = url.searchParams.get("phone") ?? "";
      return INTERNATIONAL_NUMBER.test(number) ? url.href : null;
    }
    return null;
  } catch {
    return null;
  }
}
