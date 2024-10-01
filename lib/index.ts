import loadR2Module, { type MainModule } from "./r2.mjs";
import { useCallback, useEffect, useRef } from "react";

export interface R2Props {
    source?: R2Source;
}

export interface R2Source {
    platform: Platform;
    arch: Architecture;
    pointerSize: number;
    pageSize: number;
    onReadRequest: ReadRequestHandler;
}

export type Platform = "windows" | "darwin" | "linux" | "freebsd" | "qnx";

export type Architecture = "ia32" | "x64" | "arm" | "arm64" | "mips";

export type ReadRequestHandler = (address: bigint, size: number) => Promise<Uint8Array | null>;

let state: "unloaded" | "loading" | "loaded" | "executing-command" = "unloaded";
let r2Module: MainModule | null = null;
const pendingCommands: CommandRequest[] = [];
const cachedPages = new Map<bigint, Uint8Array | null>([[0n, null]]);

interface CommandRequest {
    command: string;
    onComplete(result: string): void;
}

export function useR2({ source }: R2Props = {}) {
    const sourceRef = useRef<R2Source>();

    useEffect(() => {
        if (source === undefined) {
            return;
        }

        sourceRef.current = source;

        if (state === "unloaded") {
            state = "loading";
            loadR2(sourceRef as React.MutableRefObject<R2Source>);
        }
    });

    const executeR2Command = useCallback((command: string) => {
        return new Promise<string>(resolve => {
            pendingCommands.push({
                command,
                onComplete: resolve,
            });
            maybeProcessPendingCommands();
        });
    }, []);

    return {
        executeR2Command,
    };
}

async function loadR2(sourceRef: React.MutableRefObject<R2Source>) {
    const r2 = await loadR2Module({
        offset: "0",
        async onRead(offset: string, size: number): Promise<Uint8Array> {
            const address = BigInt(offset);

            const pageSize = BigInt(sourceRef.current.pageSize);
            const firstPage = pageStart(address);
            const lastPage = pageStart(address + BigInt(size) - 1n);
            const pageAfterLastPage = lastPage + pageSize;
            const numPages = (pageAfterLastPage - firstPage) / pageSize;

            let allInCache = true;
            for (let page = firstPage; page !== pageAfterLastPage; page += pageSize) {
                const entry = cachedPages.get(page);
                if (entry === null) {
                    throw new Error("read failed");
                }
                if (entry === undefined) {
                    allInCache = false;
                    break;
                }
            }

            if (!allInCache) {
                try {
                    const block = await read(firstPage, Number(numPages * pageSize));
                    for (let page = firstPage; page !== pageAfterLastPage; page += pageSize) {
                        const offset = page - firstPage;
                        cachedPages.set(page, block.slice(Number(offset), Number(offset + pageSize)));
                    }
                } catch (e) {
                    for (let page = firstPage; page !== pageAfterLastPage; page += pageSize) {
                        cachedPages.set(page, null);
                    }
                    throw e;
                }
            }

            const result = new Uint8Array(size);
            let resultOffset = 0;
            for (let page = firstPage; page !== pageAfterLastPage; page += pageSize) {
                const remaining = size - resultOffset;
                const chunkSize = (remaining > pageSize) ? Number(pageSize) : remaining;
                const fromOffset = Number((page === firstPage) ? address % pageSize : 0n);
                const toOffset = fromOffset + chunkSize;

                const pageData = cachedPages.get(page)!;
                result.set(pageData.slice(fromOffset, toOffset), resultOffset);

                resultOffset += chunkSize;
            }
            return result;

            function pageStart(address: bigint): bigint {
                const pageOffset = address % pageSize;
                return address - pageOffset;
            }
        },
    });

    function read(address: bigint, size: number): Promise<Uint8Array> {
        return sourceRef.current.onReadRequest(address, size);
    }

    const { platform, arch, pointerSize } = sourceRef.current;

    await r2.ccall("r2_open", "void", ["string", "string", "int"],
        [platform, archFromFrida(arch), pointerSize * 8], { async: true });

    state = "loaded";
    r2Module = r2;
    maybeProcessPendingCommands();
}

async function maybeProcessPendingCommands() {
    if (state !== "loaded") {
        return;
    }

    state = "executing-command";

    const r = r2Module!;
    const evaluate = r.cwrap("r2_execute", "number", ["string"], { async: true });

    let req: CommandRequest | undefined;
    while ((req = pendingCommands.shift()) !== undefined) {
        const rawResult = await evaluate(req.command);
        try {
            const result = r.UTF8ToString(rawResult);
            req.onComplete(result);
        } finally {
            r._free(rawResult)
        }
    }

    state = "loaded";
}

function archFromFrida(arch: Architecture): string {
    switch (arch) {
        case "ia32":
        case "x64":
            return "x86";
        case "arm64":
            return "arm";
        default:
            return arch;
    }
}
