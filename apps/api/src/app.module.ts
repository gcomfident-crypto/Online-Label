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
import { HealthController } from './health.controller.ts';
import { MeController } from './me.controller.ts';

type RequestWithId = {
  requestId?: string;
};

type ErrorResponseBody = {
  code?: string;
  message?: string;
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
      const body = isErrorResponseBody(exceptionResponse) ? exceptionResponse : {};

      response.status(exception.getStatus()).json({
        error: {
          code: body.code ?? 'REQUEST_ERROR',
          message: body.message ?? '请求处理失败，请稍后重试。',
        },
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
  controllers: [AuthController, HealthController, MeController],
  providers: [
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
