import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import {
  Injectable,
  NestInterceptor,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import { AuthController } from './auth.controller.ts';
import { AiReviewModule } from './ai-review/ai-review.module.ts';
import { AssignmentsModule } from './assignments/assignments.module.ts';
import { AuditService } from './audit/audit.service.ts';
import { DatasetsModule } from './datasets/datasets.module.ts';
import { DebugController } from './debug/debug.controller.ts';
import { DebugService } from './debug/debug.service.ts';
import { DraftsModule } from './drafts/drafts.module.ts';
import { ExportsModule } from './exports/exports.module.ts';
import { HealthController } from './health.controller.ts';
import { LlmController } from './llm/llm.controller.ts';
import { LlmService } from './llm/llm.service.ts';
import { MeController } from './me.controller.ts';
import { PrismaService } from './prisma/prisma.service.ts';
import { ReviewRulesModule } from './review-rules/review-rules.module.ts';
import { ReviewsModule } from './reviews/reviews.module.ts';
import { SchemaController } from './schema/schema.controller.ts';
import { SchemaService } from './schema/schema.service.ts';
import { StateMachineService } from './state-machine/state-machine.service.ts';
import { SubmissionsModule } from './submissions/submissions.module.ts';
import { TaskItemReportsModule } from './task-item-reports/task-item-reports.module.ts';
import { TaskFlowsModule } from './task-flows/task-flows.module.ts';
import { TemplatesModule } from './templates/templates.module.ts';
import { TasksModule } from './tasks/tasks.module.ts';
import {
  HttpErrorEnvelopeFilter,
  createRequestId,
  type RequestWithId,
} from './common/filters/http-error-envelope.filter.ts';
import { WriteBodyValidationPipe } from './common/pipes/write-body-validation.pipe.ts';

@Injectable()
class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    request.requestId = request.requestId ?? createRequestId();

    return next.handle().pipe(
      map((data) => ({
        data,
        requestId: request.requestId,
      })),
    );
  }
}

@Module({
  imports: [
    TemplatesModule,
    TasksModule,
    DatasetsModule,
    AssignmentsModule,
    DraftsModule,
    SubmissionsModule,
    ReviewRulesModule,
    AiReviewModule,
    ReviewsModule,
    ExportsModule,
    TaskItemReportsModule,
    TaskFlowsModule,
  ],
  controllers: [
    AuthController,
    HealthController,
    MeController,
    DebugController,
    LlmController,
    SchemaController,
  ],
  providers: [
    PrismaService,
    AuditService,
    StateMachineService,
    DebugService,
    LlmService,
    SchemaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpErrorEnvelopeFilter,
    },
    {
      provide: APP_PIPE,
      useClass: WriteBodyValidationPipe,
    },
  ],
})
export class AppModule {}
