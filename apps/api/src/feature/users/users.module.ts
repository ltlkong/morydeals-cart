import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/database/database.module.ts";
import { AnonymousUsersController } from "./api/anonymous-users.controller.ts";
import { AnonymousUsersService } from "./services/anonymous-users.service.ts";
import { UserTokenGuard } from "./services/user-token.guard.ts";
@Module({
  imports: [DatabaseModule],
  controllers: [AnonymousUsersController],
  providers: [AnonymousUsersService, UserTokenGuard],
  exports: [AnonymousUsersService, UserTokenGuard],
})
export class UsersModule {}
