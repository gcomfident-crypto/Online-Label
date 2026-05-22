export type TransactionHost<TClient> = {
  $transaction: <TResult>(callback: (client: TClient) => Promise<TResult>) => Promise<TResult>;
};

export function runInTransaction<TClient, TResult>(
  host: TransactionHost<TClient>,
  callback: (client: TClient) => Promise<TResult>,
): Promise<TResult> {
  return host.$transaction(callback);
}
