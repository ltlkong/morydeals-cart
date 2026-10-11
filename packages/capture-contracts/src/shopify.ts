import { code as isoCurrency } from "currency-codes";
import { z } from "zod";

// Storefront 2026-10 LanguageCode: https://shopify.dev/docs/api/storefront/2026-10/enums/LanguageCode
const codes =
  "AF AK AM AR AS AZ BE BG BM BN BO BR BS CA CE CKB CS CU CY DA DE DZ EE EL EN EO ES ET EU FA FF FI FIL FO FR FY GA GD GL GU GV HA HE HI HR HU HY IA ID IG II IS IT JA JV KA KI KK KL KM KN KO KS KU KW KY LA LB LG LN LO LT LU LV MG MI MK ML MN MO MR MS MT MY NB ND NE NL NN NO OM OR OS PA PL PS PT PT_BR PT_PT QU RM RN RO RU RW SA SC SD SE SG SH SI SK SL SN SO SQ SR SU SV SW TA TE TG TH TI TK TO TR TT UG UK UR UZ VI VO WO XH YI YO ZH ZH_CN ZH_TW ZU".split(
    " ",
  );
const supported = new Set(codes);
export const ShopifyLanguageSchema = z
  .string()
  .refine((value) => supported.has(value), "Unsupported Shopify LanguageCode");

/** Locale is a language preference, independent of the storefront country/currency. */
export function shopifyLanguage(locale: string): string | undefined {
  try {
    const parsed = new Intl.Locale(locale.replaceAll("_", "-"));
    const language = parsed.language.toUpperCase();
    if (language === "ZH" && parsed.script) {
      if (parsed.script === "Hans") return "ZH_CN";
      if (parsed.script === "Hant") return "ZH_TW";
    }
    const regional = parsed.region ? `${language}_${parsed.region}` : undefined;
    if (regional && supported.has(regional)) return regional;
    return supported.has(language) ? language : undefined;
  } catch {
    return undefined;
  }
}

/** A Shopify storefront as a task names it: shop domain plus the market it is read in. */
export const ShopifyStoreSchema = z
  .object({
    shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    language: ShopifyLanguageSchema,
    currency: z
      .string()
      .refine(
        (v) => /^[A-Z]{3}$/.test(v) && !!isoCurrency(v),
        "Expected ISO currency code",
      ),
  })
  .strict();
export type ShopifyStore = z.infer<typeof ShopifyStoreSchema>;
