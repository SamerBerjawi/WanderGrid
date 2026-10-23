import { useCallback, useEffect, useRef, useState } from 'react';
import { runBatch, type BatchFailure, type BatchOptions, type BatchResult } from '../utils/batchRunner';

export interface BatchRunState<T> {
    status: 'idle' | 'running' | 'done';
    total: number;
    completed: number;
    failed: BatchFailure<T>[];
    cancelled: boolean;
    /** Chunks that were applied, in the order they were given. */
    doneChunks: T[];
    durationMs: number;
}

const idle = <T,>(): BatchRunState<T> => ({ status: 'idle', total: 0, completed: 0, failed: [], cancelled: false, doneChunks: [], durationMs: 0 });

/**
 * React side of `runBatch`: progress state for a drawer or sheet, Cancel, and Retry of the chunks that failed.
 * Chunks are applied by `apply`, which the caller keeps stable between start and retry.
 */
export function useBatchRun<T>() {
    const [state, setState] = useState<BatchRunState<T>>(idle);
    const ctl = useRef<AbortController | null>(null);
    const alive = useRef(true);
    const stateRef = useRef(state);
    stateRef.current = state;
    useEffect(() => {
        alive.current = true; // StrictMode runs the cleanup once before the real mount
        return () => { alive.current = false; ctl.current?.abort(); };
    }, []);

    const set = (next: BatchRunState<T>) => { if (alive.current) setState(next); };

    const run = useCallback(async (
        chunks: T[], apply: (chunk: T, index: number) => Promise<void>, options: Omit<BatchOptions, 'signal' | 'onProgress'> = {}, carry?: BatchRunState<T>
    ): Promise<BatchResult<T>> => {
        const t0 = performance.now();
        const controller = new AbortController();
        ctl.current = controller;
        const baseDone = carry?.doneChunks || [];
        set({ status: 'running', total: (carry?.total ?? 0) || chunks.length, completed: baseDone.length, failed: [], cancelled: false, doneChunks: baseDone, durationMs: 0 });
        const result = await runBatch(chunks, apply, {
            ...options,
            signal: controller.signal,
            onProgress: p => set({ status: 'running', total: (carry?.total ?? 0) || chunks.length, completed: baseDone.length + p.completed - p.failed, failed: [], cancelled: false, doneChunks: baseDone, durationMs: performance.now() - t0 }),
        });
        const doneChunks = [...baseDone, ...result.done.map(i => chunks[i])];
        set({ status: 'done', total: (carry?.total ?? 0) || chunks.length, completed: doneChunks.length, failed: result.failed, cancelled: result.cancelled, doneChunks, durationMs: performance.now() - t0 });
        return result;
    }, []);

    const start = useCallback((chunks: T[], apply: (chunk: T, index: number) => Promise<void>, options?: Omit<BatchOptions, 'signal' | 'onProgress'>) => run(chunks, apply, options), [run]);

    /** Applies only the chunks that failed (or were cancelled before they started), keeping what already went through. */
    const retry = useCallback((all: T[], apply: (chunk: T, index: number) => Promise<void>, options?: Omit<BatchOptions, 'signal' | 'onProgress'>) => {
        const prev = stateRef.current;
        const left = all.filter(c => !prev.doneChunks.includes(c));
        return run(left, apply, options, { ...prev, total: all.length });
    }, [run]);

    const cancel = useCallback(() => ctl.current?.abort(), []);
    const reset = useCallback(() => { ctl.current?.abort(); set(idle<T>()); }, []);

    return { state, start, retry, cancel, reset };
}
