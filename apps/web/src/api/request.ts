type ApiEnvelope<TData> = {
  data?: TData;
  error?: {
    message?: string;
  };
};

export const apiBaseUrl = (): string =>
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ??
  '/api';

export async function requestApi<TData>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<TData> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`${fallbackErrorMessage} 请确认后端服务已启动。`);
  }

  const responseText = await readResponseText(response);
  const envelope = parseApiEnvelope<TData>(responseText, response, fallbackErrorMessage);

  if (!response.ok) {
    throw new Error(envelope?.error?.message ?? formatHttpError(response, fallbackErrorMessage));
  }

  if (!envelope || !('data' in envelope)) {
    throw new Error(`${fallbackErrorMessage} 接口返回内容为空。`);
  }

  return envelope.data as TData;
}

function parseApiEnvelope<TData>(
  responseText: string,
  response: Response,
  fallbackErrorMessage: string,
): ApiEnvelope<TData> | null {
  const trimmedText = responseText.trim();

  if (!trimmedText) {
    return null;
  }

  try {
    return JSON.parse(trimmedText) as ApiEnvelope<TData>;
  } catch {
    if (!response.ok) {
      throw new Error(formatHttpError(response, fallbackErrorMessage));
    }

    throw new Error(`${fallbackErrorMessage} 接口返回内容不是有效 JSON。`);
  }
}

async function readResponseText(response: Response): Promise<string> {
  if (typeof response.text === 'function') {
    return response.text();
  }

  const responseWithJson = response as Response & { json?: () => Promise<unknown> };
  if (typeof responseWithJson.json === 'function') {
    return JSON.stringify(await responseWithJson.json());
  }

  return '';
}

function formatHttpError(response: Response, fallbackErrorMessage: string): string {
  return `${fallbackErrorMessage}（HTTP ${response.status}）。`;
}
