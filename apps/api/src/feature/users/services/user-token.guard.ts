import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { AnonymousUsersService } from "./anonymous-users.service.ts";

type UserRequest = Request & { userId?: string };

/** Requires `Authorization: Bearer <token>` from POST /api/anonymous-users and exposes the user to handlers. */
@Injectable()
export class UserTokenGuard implements CanActivate {
  constructor(
    @Inject(AnonymousUsersService)
    private readonly users: AnonymousUsersService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    const userId =
      scheme === "Bearer" && token
        ? await this.users.userIdFor(token)
        : undefined;
    if (!userId)
      throw new UnauthorizedException(
        "This device is not registered with Mory. Please restart the app.",
      );
    request.userId = userId;
    return true;
  }
}

/** The authenticated user's id; only valid on routes behind UserTokenGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<UserRequest>().userId!,
);
