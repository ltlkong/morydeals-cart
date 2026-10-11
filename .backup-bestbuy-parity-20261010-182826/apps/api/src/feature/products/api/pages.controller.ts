import {
  PageSnapshotSchema,
  type PageSnapshot,
} from "@morydeals/capture-contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  CurrentUser,
  UserTokenGuard,
} from "../../users/services/user-token.guard.ts";
import { ProductsService } from "../services/products.service.ts";
import {
  AcceptedProductSchema,
  KnownPageRequestSchema,
  KnownPageSchema,
  RequestIdSchema,
  VisitStatusSchema,
} from "../schema/products.schema.ts";

/** Automatic page visits from the in-app browser; product pages are recorded in the device's history. */
@ApiTags("pages")
@ApiBearerAuth()
@UseGuards(UserTokenGuard)
@Controller("pages")
export class PagesController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}
  @Post()
  @HttpCode(202)
  @SerializeOptions({ schema: AcceptedProductSchema })
  @ApiOperation({
    summary: "Submit a browsed page for automatic product detection",
  })
  create(@Body({ schema: PageSnapshotSchema }) body: PageSnapshot) {
    return this.products.createVisit(body);
  }
  @Post("known")
  @HttpCode(200)
  @SerializeOptions({ schema: KnownPageSchema })
  @ApiOperation({
    summary:
      "The product recently captured from a page, so the app need not upload it again",
  })
  known(
    @CurrentUser() userId: string,
    @Body({ schema: KnownPageRequestSchema }) body: { url: string },
  ) {
    return this.products.knownPage(body.url, userId);
  }
  @Get(":id")
  @SerializeOptions({ schema: VisitStatusSchema })
  @ApiOperation({
    summary: "Whether the visited page was a product page, with the product",
  })
  @ApiParam({
    name: "id",
    schema: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" },
  })
  status(
    @CurrentUser() userId: string,
    @Param("id", { schema: RequestIdSchema }) id: string,
  ) {
    return this.products.visitStatus(id, userId);
  }
}
