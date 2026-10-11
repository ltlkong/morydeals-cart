import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  UserTokenGuard,
} from "../../users/services/user-token.guard.ts";
import { ListsService } from "../services/lists.service.ts";
import {
  CreateListSchema,
  CreatedListSchema,
  ListDetailSchema,
  ListItemInputSchema,
  ListNameSchema,
  ListsQuerySchema,
  ListsSchema,
  type CreateList,
  type ListName,
  type ListsQuery,
} from "../schema/lists.schema.ts";
import type { ProductUrlInput } from "../../catalog/schema/catalog.schema.ts";

const ListId = new ParseUUIDPipe({ version: "4" });

@ApiTags("lists")
@ApiBearerAuth()
@UseGuards(UserTokenGuard)
@Controller("lists")
export class ListsController {
  constructor(@Inject(ListsService) private readonly lists: ListsService) {}
  @Get()
  @SerializeOptions({ schema: ListsSchema })
  @ApiOperation({
    summary: "This device's lists with covers; `url` also marks which hold it",
  })
  overview(
    @CurrentUser() userId: string,
    @Query({ schema: ListsQuerySchema }) query: ListsQuery,
  ) {
    return this.lists.overview(userId, query.url);
  }
  @Post()
  @SerializeOptions({ schema: CreatedListSchema })
  @ApiOperation({ summary: "Create a list, optionally with its first product" })
  create(
    @CurrentUser() userId: string,
    @Body({ schema: CreateListSchema }) body: CreateList,
  ) {
    return this.lists.create(userId, body.name, body.url);
  }
  @Get(":id")
  @SerializeOptions({ schema: ListDetailSchema })
  @ApiOperation({ summary: "A list's products with their latest data" })
  detail(@CurrentUser() userId: string, @Param("id", ListId) id: string) {
    return this.lists.detail(userId, id);
  }
  @Patch(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Rename a list" })
  async rename(
    @CurrentUser() userId: string,
    @Param("id", ListId) id: string,
    @Body({ schema: ListNameSchema }) body: ListName,
  ) {
    await this.lists.rename(userId, id, body.name);
  }
  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a list and its saved products" })
  async remove(@CurrentUser() userId: string, @Param("id", ListId) id: string) {
    await this.lists.remove(userId, id);
  }
  @Put(":id/items")
  @HttpCode(204)
  @ApiOperation({ summary: "Save a product (by its product URL) to a list" })
  async add(
    @CurrentUser() userId: string,
    @Param("id", ListId) id: string,
    @Body({ schema: ListItemInputSchema }) body: ProductUrlInput,
  ) {
    await this.lists.addItem(userId, id, body.url);
  }
  @Delete(":id/items")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a product from a list" })
  async removeItem(
    @CurrentUser() userId: string,
    @Param("id", ListId) id: string,
    @Query({ schema: ListItemInputSchema }) query: ProductUrlInput,
  ) {
    await this.lists.removeItem(userId, id, query.url);
  }
}
