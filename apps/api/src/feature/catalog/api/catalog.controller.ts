import {
  Controller,
  Get,
  Inject,
  Query,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "../services/catalog.service.ts";
import {
  CatalogPageSchema,
  CatalogQuerySchema,
  type CatalogQuery,
} from "../schema/catalog.schema.ts";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get("products")
  @SerializeOptions({ schema: CatalogPageSchema })
  @ApiResponse({ status: 200, standardSchema: CatalogPageSchema })
  @ApiOperation({
    summary:
      "Products at the enabled stores, newest observed first, a page at a time (pass nextCursor back as cursor)",
  })
  products(@Query({ schema: CatalogQuerySchema }) query: CatalogQuery) {
    return this.catalog.page(query);
  }
}
