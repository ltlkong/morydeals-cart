import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
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
import { CartService } from "../services/cart.service.ts";
import {
  CartItemInputSchema,
  CartSchema,
  type CartItemInput,
} from "../schema/cart.schema.ts";

@ApiTags("cart")
@ApiBearerAuth()
@UseGuards(UserTokenGuard)
@Controller("cart")
export class CartController {
  constructor(@Inject(CartService) private readonly cart: CartService) {}
  @Get()
  @SerializeOptions({ schema: CartSchema })
  @ApiOperation({ summary: "This device's cart with the latest product data" })
  list(@CurrentUser() userId: string) {
    return this.cart.list(userId);
  }
  @Put("items")
  @HttpCode(204)
  @ApiOperation({ summary: "Add a product (by its product URL) to the cart" })
  async add(
    @CurrentUser() userId: string,
    @Body({ schema: CartItemInputSchema }) body: CartItemInput,
  ) {
    await this.cart.add(userId, body.url);
  }
  @Delete("items")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a product from the cart" })
  async remove(
    @CurrentUser() userId: string,
    @Query({ schema: CartItemInputSchema }) query: CartItemInput,
  ) {
    await this.cart.remove(userId, query.url);
  }
}
