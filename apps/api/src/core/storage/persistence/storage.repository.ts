import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/services/prisma.service.ts";
import type { StorageObject as Row } from "../../../generated/prisma/client.ts";
import type { Visibility } from "../providers/storage-provider.ts";
export type ObjectStatus = "pending" | "ready" | "deleted";
export type StorageObject = Omit<
  Row,
  "sizeBytes" | "provider" | "visibility" | "status" | "updatedAt"
> & {
  sizeBytes: number;
  provider: "local" | "r2";
  visibility: Visibility;
  status: ObjectStatus;
};
const toObject = (row: Row): StorageObject => ({
  ...row,
  sizeBytes: Number(row.sizeBytes),
  provider: row.provider as StorageObject["provider"],
  visibility: row.visibility as Visibility,
  status: row.status as ObjectStatus,
});
@Injectable()
export class StorageRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async insert(object: Omit<StorageObject, "createdAt">) {
    return toObject(await this.db.storageObject.create({ data: object }));
  }
  async find(ids: string[]) {
    return (
      await this.db.storageObject.findMany({ where: { id: { in: ids } } })
    ).map(toObject);
  }
  async transition(id: string, from: ObjectStatus, to: ObjectStatus) {
    const rows = await this.db.storageObject.updateManyAndReturn({
      where: { id, status: from },
      data: { status: to },
    });
    return rows[0] ? toObject(rows[0]) : undefined;
  }
  async expiredPending(now: Date, limit: number) {
    return (
      await this.db.storageObject.findMany({
        where: { status: "pending", uploadExpiresAt: { lt: now } },
        orderBy: { uploadExpiresAt: "asc" },
        take: limit,
      })
    ).map(toObject);
  }
}
