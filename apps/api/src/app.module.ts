import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { map, type Observable } from 'rxjs';

import { AuthController } from './auth.controller.ts';
import { AuditService } from './audit/audit.service.ts';
import { DebugController } from './debug/debug.controller.ts';
import { DebugService } from './debug/debug.service.ts';
import { HealthController } from './health.controller.ts';
import { LlmController } from './llm/llm.controller.ts';
import { LlmService } from './llm/llm.service.ts';
import { MeController } from './me.controller.ts';
import { PrismaService } from './prisma/prisma.service.ts';
import { StateMachineService } from './state-machine/state-machine.service.ts';

type RequestWithId = {
  requestId?: string;
};

type ErrorResponseBody = {
  code?: string;
  message?: string;
};

type ErrorEnvelope = {
  code: string;
  message: string;
};

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

@Catch()
class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<{
      status: (statusCode: number) => { json: (body: unknown) => void };
    }>();
    const requestId = request.requestId ?? createRequestId();

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const statusCode = exception.getStatus();
      const envelope = resolveErrorEnvelope(exceptionResponse, statusCode);

      response.status(statusCode).json({
        error: envelope,
        requestId,
      });
      return;
    }

    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用，请稍后重试。',
      },
      requestId,
    });
  }
}

@Module({
  controllers: [AuthController, HealthController, MeController, DebugController, LlmController],
  providers: [
    PrismaService,
    AuditService,
    StateMachineService,
    DebugService,
    LlmService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ErrorEnvelopeFilter,
    },
  ],
})
export class AppModule {}

function createRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function isErrorResponseBody(value: unknown): value is ErrorResponseBody {
  return typeof value === 'object' && value !== null;
}

function resolveErrorEnvelope(exceptionResponse: unknown, statusCode: number): ErrorEnvelope {
  if (isErrorResponseBody(exceptionResponse) && exceptionResponse.code && exceptionResponse.message) {
    return {
      code: exceptionResponse.code,
      message: exceptionResponse.message,
    };
  }

  if (statusCode === 404) {
    return {
      code: 'NOT_FOUND',
      message: '请求的接口不存在。',
    };
  }

  if (statusCode === 401) {
    return {
      code: 'UNAUTHENTICATED',
      message: '请先登录后再继续操作。',
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      code: 'REQUEST_ERROR',
      message: '请求参数不正确，请检查后重试。',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用，请稍后重试。',
  };
}
