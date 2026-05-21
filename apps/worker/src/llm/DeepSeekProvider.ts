import { OpenAiLikeProvider } from './OpenAiLikeProvider.ts';

type DeepSeekProviderOptions = {
  env?: Partial<Pick<NodeJS.ProcessEnv, 'DEEPSEEK_API_KEY'>>;
  fetchImpl?: typeof fetch;
  model?: string;
};

export class DeepSeekProvider extends OpenAiLikeProvider {
  constructor(options: DeepSeekProviderOptions = {}) {
    const env = options.env ?? process.env;
    super({
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: env.DEEPSEEK_API_KEY,
      model: options.model ?? 'deepseek-chat',
      temperature: 0,
      fetchImpl: options.fetchImpl,
    });
  }

  protected override assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error('缺少 DEEPSEEK_API_KEY，无法调用 DeepSeek。');
    }
  }
}
