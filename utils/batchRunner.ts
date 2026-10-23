/**
 * Runs a list of independent chunks one after another, with progress, cancellation and a retry of the
 * chunks that failed. Used for the Atlas merge and for "Find names": the work is split into chunks that each
 * make sense on their own, so a failed chunk never leaves the data half changed and the rest still goes through.
 */

export interface BatchFailure<T> {
    index: number;
    chunk: T;
    error: string;
}

export interface BatchResult<T> {
    total: number;
    /** Indexes of the chunks that were applied. */
    done: number[];
    failed: BatchFailure<T>[];
    /** Chunks never started because the run was cancelled. */
    skipped: number[];
    cancelled: boolean;
}

export interface BatchOptions {
    signal?: AbortSignal;
    onProgress?: (state: { completed: number; total: number; index: number; failed: number }) => void;
    /** Extra tries for a chunk that fails with a transient error (rate limit, 5xx, offline). Default 2. */
    retries?: number;
    retryDelayMs?: number;
    /** Pause between chunks, to stay under rate limits. Default 0. */
    pauseMs?: number;
    isTransient?: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong');

/** Rate limits, server errors and lost connections are worth another try; validation and permission errors are not. */
export const isTransientError = (e: unknown): boolean => {
    const status = (e as { status?: number } | null)?.status;
    if (typeof status === 'number') return status === 429 || status >= 500;
    const msg = errorMessage(e).toLowerCase();
    return msg.includes('too many requests') || msg.includes("can't reach") || msg.includes('took too long');
};

export async function runBatch<T>(chunks: T[], apply: (chunk: T, index: number) => Promise<void>, options: BatchOptions = {}): Promise<BatchResult<T>> {
    const { signal, onProgress, retries = 2, retryDelayMs = 800, pauseMs = 0, isTransient = isTransientError, sleep = defaultSleep } = options;
    const result: BatchResult<T> = { total: chunks.length, done: [], failed: [], skipped: [], cancelled: false };

    for (let index = 0; index < chunks.length; index++) {
        if (signal?.aborted) {
            result.cancelled = true;
            for (let rest = index; rest < chunks.length; rest++) result.skipped.push(rest);
            break;
        }
        let attempt = 0;
        for (;;) {
            try {
                await apply(chunks[index], index);
                result.done.push(index);
                break;
            } catch (e) {
                if (attempt < retries && isTransient(e) && !signal?.aborted) {
                    attempt++;
                    await sleep(retryDelayMs * 2 ** (attempt - 1));
                    continue;
                }
                result.failed.push({ index, chunk: chunks[index], error: errorMessage(e) });
                break;
            }
        }
        onProgress?.({ completed: result.done.length + result.failed.length, total: chunks.length, index, failed: result.failed.length });
        if (pauseMs > 0 && index < chunks.length - 1) await sleep(pauseMs);
    }
    return result;
}
