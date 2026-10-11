import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.ts";
import {
  apiConfig,
  type ApiConfig,
} from "./core/config/schema/config.schema.ts";
import { configureHttp } from "./core/server/http/configure-app.ts";
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  bodyParser: false,
});
const config = app.get<ApiConfig>(apiConfig.KEY);
configureHttp(app, config);
if (config.docsEnabled) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("MoryDeals API")
      .setDescription("Product capture requests and their results.")
      .setVersion("1.0")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
}
await app.listen(config.port, config.host);
