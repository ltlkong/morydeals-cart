import {
  Controller,
  Get,
  Inject,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  UserTokenGuard,
} from "../../users/services/user-token.guard.ts";
import { ViewedService } from "../services/viewed.service.ts";
import { ViewedSchema } from "../schema/history.schema.ts";

@ApiTags("history")
@ApiBearerAuth()
@UseGuards(UserTokenGuard)
@Controller("history")
export class HistoryController {
  constructor(@Inject(ViewedService) private readonly viewed: ViewedService) {}
  @Get()
  @SerializeOptions({ schema: ViewedSchema })
  @ApiOperation({
    summary: "Product pages this device viewed, newest first (not the cart)",
  })
  list(@CurrentUser() userId: string) {
    return this.viewed.list(userId);
  }
}
