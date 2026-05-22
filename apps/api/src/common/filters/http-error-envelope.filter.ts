import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type RequestWithId = {
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

@Catch()
export class HttpErrorEnvelopeFilter implements ExceptionFilter {
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

export function createRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function resolveErrorEnvelope(exceptionResponse: unknown, statusCode: number): ErrorEnvelope {
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

function isErrorResponseBody(value: unknown): value is ErrorResponseBody {
  return typeof value === 'object' && value !== null;
}
