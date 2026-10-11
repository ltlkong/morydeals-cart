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
  ApiResponse,
  ApiTags,
  ApiParam,
} from "@nestjs/swagger";
import {
  CurrentUser,
  UserTokenGuard,
} from "../../users/services/user-token.guard.ts";
import { ProductsService } from "../services/products.service.ts";
import {
  AcceptedProductSchema,
  CreateProductSchema,
  ProductStatusSchema,
  RequestIdSchema,
  type CreateProduct,
} from "../schema/products.schema.ts";

@ApiTags("products")
@ApiBearerAuth()
@UseGuards(UserTokenGuard)
@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}
  @Post()
  @HttpCode(202)
  @SerializeOptions({ schema: AcceptedProductSchema })
  @ApiOperation({ summary: "Submit a product link for capture" })
  @ApiResponse({
    status: 202,
    standardSchema: AcceptedProductSchema,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid URL or unknown request fields",
  })
  @ApiResponse({ status: 503, description: "Queue unavailable" })
  create(@Body({ schema: CreateProductSchema }) body: CreateProduct) {
    return this.products.create(body);
  }
  @Post("snapshots")
  @HttpCode(202)
  @SerializeOptions({ schema: AcceptedProductSchema })
  @ApiOperation({
    summary:
      "Capture the already opened WebView page without fetching the store",
  })
  createSnapshot(@Body({ schema: PageSnapshotSchema }) body: PageSnapshot) {
    return this.products.createSnapshot(body);
  }
  @Get(":id")
  @SerializeOptions({ schema: ProductStatusSchema })
  @ApiOperation({ summary: "Get capture status and a confirmed product" })
  @ApiParam({
    name: "id",
    schema: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" },
  })
  @ApiResponse({
    status: 200,
    standardSchema: ProductStatusSchema,
  })
  @ApiResponse({ status: 404, description: "Request expired or unknown" })
  @ApiResponse({ status: 503, description: "Queue unavailable" })
  status(
    @CurrentUser() userId: string,
    @Param("id", { schema: RequestIdSchema }) id: string,
  ) {
    return this.products.status(id, userId);
  }
}
