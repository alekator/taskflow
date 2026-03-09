import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssistantModule } from './assistant/assistant.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { ObservabilityMiddleware } from './common/middleware/observability.middleware';
import { RequestContextModule } from './common/request-context.module';
import { WorkspaceAccessModule } from './common/workspace-access.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { NotificationsModule } from './notifications/notifications.module';
import { InvitationsModule } from './invitations/invitations.module';
import { BillingModule } from './billing/billing.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AsyncJobsModule } from './async-jobs/async-jobs.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    RequestContextModule,
    WorkspaceAccessModule,
    ObservabilityModule,
    AsyncJobsModule,
    StorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    PrismaModule,
    AssistantModule,
    AuditModule,
    IdempotencyModule,
    NotificationsModule,
    InvitationsModule,
    BillingModule,
    AttachmentsModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware, ObservabilityMiddleware)
      .forRoutes({
        path: '*path',
        method: RequestMethod.ALL,
      });
  }
}
