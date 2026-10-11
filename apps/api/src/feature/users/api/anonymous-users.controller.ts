import { Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AnonymousUsersService } from "../services/anonymous-users.service.ts";

@ApiTags("users")
@Controller("anonymous-users")
export class AnonymousUsersController {
  constructor(
    @Inject(AnonymousUsersService)
    private readonly users: AnonymousUsersService,
  ) {}
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      "Register this device; the token identifies its cart until an account is linked",
  })
  create() {
    return this.users.create();
  }
}
