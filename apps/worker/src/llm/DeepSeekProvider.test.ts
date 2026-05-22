import { describe, expect, it } from 'vitest';

import { DeepSeekProvider } from './DeepSeekProvider.ts';

describe('DeepSeekProvider', () => {
  it('缺少 DEEPSEEK_API_KEY 时返回明确配置错误且不泄露密钥', async () => {
    const provider = new DeepSeekProvider({ env: {}, fetchImpl: async () => new Response('{}') });

    await expect(
      provider.review({
        datasetKind: 'qa_quality',
        rawPrompt: 'prompt',
        rawData: {},
        answers: {},
        structuredOutputMode: 'json_schema',
      }),
    ).rejects.toThrow('缺少 DEEPSEEK_API_KEY');
  });
});
