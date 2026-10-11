import { Module, type DynamicModule, type ModuleMetadata, type Type } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { workerConfig, type Configuration } from '../config/worker.config.ts';
import {
  DOMAIN_LIMITER,
  LocalDomainLimiter,
  type DomainLimiter,
} from './network/domain-limiter.ts';
import { UrlPolicy } from './network/url-policy.ts';
import { ShopifyDriver } from './shopify/shopify.driver.ts';
import { HttpDriver } from './http/http.driver.ts';
import { BrowserDriver } from './browser/browser.driver.ts';
import { AcquisitionRunner } from './acquisition.runner.ts';
import { NetworkSessions } from './network/network-sessions.ts';

export interface AcquisitionModuleOptions {
  imports?: ModuleMetadata['imports'];
  domainLimiter?: Type<DomainLimiter>;
}

@Module({})
export class AcquisitionModule {
  static register(options: AcquisitionModuleOptions = {}): DynamicModule {
    return {
      module: AcquisitionModule,
      imports: [WorkerConfigModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: NetworkSessions,
          inject: [workerConfig.KEY],
          useFactory: (config: Configuration) => new NetworkSessions(config.proxyProfiles),
        },
        options.domainLimiter
          ? { provide: DOMAIN_LIMITER, useClass: options.domainLimiter }
          : {
              provide: DOMAIN_LIMITER,
              inject: [workerConfig.KEY],
              useFactory: (config: Configuration) =>
                new LocalDomainLimiter(config.domainIntervalMs),
            },
        {
          provide: BrowserDriver,
          inject: [workerConfig.KEY, DOMAIN_LIMITER, NetworkSessions],
          useFactory: (config: Configuration, limiter: DomainLimiter, network: NetworkSessions) =>
            new BrowserDriver(new UrlPolicy(), limiter, config.maxBytes, {
              deployment: config.browserDeployment,
              network,
            }),
        },
        {
          provide: AcquisitionRunner,
          inject: [workerConfig.KEY, DOMAIN_LIMITER, BrowserDriver, NetworkSessions],
          useFactory: (
            config: Configuration,
            limiter: DomainLimiter,
            browser: BrowserDriver,
            network: NetworkSessions,
          ) => {
            const http = new HttpDriver(new UrlPolicy(), limiter, config.maxBytes, network);
            return new AcquisitionRunner(
              {
                http,
                browser,
                interactive: browser,
                api: new ShopifyDriver(new UrlPolicy(), limiter, config.maxBytes, network),
              },
              config.maxBytes,
              config.maxBudgetMs,
            );
          },
        },
      ],
      exports: [AcquisitionRunner],
    };
  }
}
