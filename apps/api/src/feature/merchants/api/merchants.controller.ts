import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  SerializeOptions,
} from "@nestjs/common";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { MerchantsService } from "../services/merchants.service.ts";
import {
  CompleteMerchantLogoSchema,
  MerchantLogoSchema,
  MerchantLogoUploadResponseSchema,
  MerchantLogoUploadSchema,
  MerchantsResponseSchema,
  type CompleteMerchantLogo,
  type MerchantLogoUpload,
} from "../schema/merchants.schema.ts";
@ApiTags("merchants")
@Controller("merchants")
export class MerchantsController {
  constructor(
    @Inject(MerchantsService) private readonly merchants: MerchantsService,
  ) {}
  @Get()
  @SerializeOptions({ schema: MerchantsResponseSchema })
  @ApiResponse({ status: 200, standardSchema: MerchantsResponseSchema })
  list() {
    return this.merchants.list();
  }

  @Post(":id/logo/upload")
  @SerializeOptions({ schema: MerchantLogoUploadResponseSchema })
  @ApiResponse({
    status: 201,
    standardSchema: MerchantLogoUploadResponseSchema,
  })
  createLogoUpload(
    @Param("id") id: string,
    @Headers("x-merchant-admin-token") token: string | undefined,
    @Body({ schema: MerchantLogoUploadSchema }) body: MerchantLogoUpload,
  ) {
    return this.merchants.createLogoUpload(id, token, body);
  }

  @Post(":id/logo/complete")
  @SerializeOptions({ schema: MerchantLogoSchema })
  @ApiResponse({ status: 201, standardSchema: MerchantLogoSchema })
  completeLogoUpload(
    @Param("id") id: string,
    @Headers("x-merchant-admin-token") token: string | undefined,
    @Body({ schema: CompleteMerchantLogoSchema }) body: CompleteMerchantLogo,
  ) {
    return this.merchants.completeLogoUpload(id, token, body);
  }
}
