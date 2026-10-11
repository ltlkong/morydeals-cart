import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadApiConfig } from './src/core/config/schema/config.schema.ts';
config({path:fileURLToPath(new URL('../../.env',import.meta.url)),quiet:true});
export default defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},datasource:{url:loadApiConfig().databaseUrl}});
