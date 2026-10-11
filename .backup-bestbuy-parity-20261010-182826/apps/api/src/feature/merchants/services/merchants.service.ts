import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";
import {
  apiConfig,
  type ApiConfig,
} from "../../../core/config/schema/config.schema.ts";
import {
  StorageService,
  type UploadPolicy,
} from "../../../core/storage/services/storage.service.ts";
import type {
  CompleteMerchantLogo,
  MerchantLogoUpload,
} from "../schema/merchants.schema.ts";

export const merchantLogoOwner = (merchantId: string) =>
  `merchant-logo:${merchantId}`;
export const MERCHANT_LOGO_POLICY = {
  purpose: "merchant_logo",
  contentTypes: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: 2 * 1024 * 1024,
  visibility: "public",
} as const satisfies UploadPolicy;
@Injectable()
export class MerchantsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(apiConfig.KEY) private readonly config: ApiConfig,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}
  async list() {
    const rows = await this.db.merchant.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const logoIds = rows.flatMap((merchant) =>
      merchant.logoObjectId ? [merchant.logoObjectId] : [],
    );
    const logoUrls = logoIds.length
      ? await this.storage.urlsFor(logoIds)
      : new Map<string, string>();
    return {
      merchants: rows.map(({ logoObjectId, ...merchant }) => ({
        ...merchant,
        logoUrl: logoObjectId ? (logoUrls.get(logoObjectId) ?? null) : null,
      })),
      allowOthers: this.config.allowOtherMerchants,
    };
  }

  private assertAdmin(token: string | undefined) {
    if (!this.config.merchantAdminToken)
      throw new ServiceUnavailableException(
        "Merchant logo management is not configured.",
      );
    if (token !== this.config.merchantAdminToken)
      throw new UnauthorizedException("Invalid merchant admin token.");
  }

  private async merchant(id: string) {
    const merchant = await this.db.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException("merchant_not_found");
    return merchant;
  }

  async createLogoUpload(
    id: string,
    token: string | undefined,
    input: MerchantLogoUpload,
  ) {
    this.assertAdmin(token);
    await this.merchant(id);
    const result = await this.storage.createUpload(MERCHANT_LOGO_POLICY, {
      ...input,
      ownerId: merchantLogoOwner(id),
    });
    return {
      merchantId: id,
      object: {
        id: result.object.id,
        contentType: result.object.contentType,
        sizeBytes: result.object.sizeBytes,
      },
      upload: {
        ...result.upload,
        expiresAt: result.upload.expiresAt.toISOString(),
      },
    };
  }

  async completeLogoUpload(
    id: string,
    token: string | undefined,
    input: CompleteMerchantLogo,
  ) {
    this.assertAdmin(token);
    const merchant = await this.merchant(id);
    const object = await this.storage.complete(
      input.objectId,
      merchantLogoOwner(merchant.id),
    );
    if (object.purpose !== MERCHANT_LOGO_POLICY.purpose)
      throw new ForbiddenException("invalid_merchant_logo");
    const logoUrl = await this.storage.urlFor(object);
    const saved = await this.db.merchant.update({
      where: { id: merchant.id },
      data: { logoObjectId: object.id },
    });
    if (merchant.logoObjectId && merchant.logoObjectId !== object.id) {
      await this.storage
        .delete(merchant.logoObjectId, {
          userId: merchantLogoOwner(merchant.id),
          admin: true,
        })
        .catch(() => undefined);
    }
    return {
      merchantId: saved.id,
      logoObjectId: object.id,
      logoUrl,
    };
  }

  async assertAllowed(url: string) {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    const matches = (await this.db.merchant.findMany()).flatMap((merchant) =>
      merchant.domains
        .filter(
          (domain) =>
            host === domain.toLowerCase() ||
            host.endsWith("." + domain.toLowerCase()),
        )
        .map((domain) => ({ merchant, length: domain.length })),
    );
    // Most specific storefront wins; unknown stores follow the global Others policy.
    matches.sort(
      (a, b) =>
        b.length - a.length ||
        Number(a.merchant.enabled) - Number(b.merchant.enabled),
    );
    const match = matches[0];
    if (match ? !match.merchant.enabled : !this.config.allowOtherMerchants)
      throw new ForbiddenException("Capture is not available for this store.");
  }
}
