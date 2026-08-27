/**
 * Free/consumer email providers.
 *
 * Researching these is pointless — "gmail.com" tells you nothing about the
 * sender, and asking a model to profile the company behind a personal address
 * reliably produces confident nonsense. Person-level enrichment is explicitly
 * out of scope for this MVP: it needs a paid enrichment API to do honestly.
 */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.jp",
  "ymail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "gmx.com", "gmx.de", "mail.com", "zoho.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "naver.com",
  "hanmail.net", "daum.net", "singnet.com.sg", "pacific.net.sg",
  "fastmail.com", "hey.com", "tutanota.com", "duck.com", "hushmail.com",
]);

export function isPersonalDomain(domain: string | null): boolean {
  if (!domain) return true;
  return PERSONAL_DOMAINS.has(domain.toLowerCase().trim());
}
