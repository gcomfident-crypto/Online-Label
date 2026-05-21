import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';

@Injectable()
export class WriteBodyValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }

    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({
        code: 'REQUEST_BODY_INVALID',
        message: '请求体必须是 JSON 对象。',
      });
    }

    return value;
  }
}
