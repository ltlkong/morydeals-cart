import { Inject, Injectable } from "@nestjs/common";
import { hash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../../../core/database/services/prisma.service.ts";

/** Bearer tokens are 256-bit random secrets; only their SHA-256 is stored, so a database copy holds no usable token. */
export const tokenHash = (token: string) => hash("sha256", token);

@Injectable()
export class AnonymousUsersService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async create() {
    const token = randomBytes(32).toString("base64url");
    await this.db.anonymousUser.create({
      data: { id: randomUUID(), tokenHash: tokenHash(token) },
    });
    return { token };
  }
  async userIdFor(token: string): Promise<string | undefined> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const user = await this.db.anonymousUser.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: { id: true },
    });
    return user?.id;
  }
}
