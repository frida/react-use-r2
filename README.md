# @frida/react-use-r2

React Hook for Radare integrations.

1. Somewhere in your app, hook up the I/O plugin's source:

```ts
import { useR2 } from "@frida/react-use-r2";

…

const onR2ReadRequest = useCallback(async (address: bigint, size: number) => {
    const result = await request("memory:read", {
        address: "0x" + address.toString(16),
        size
    });
    return (result !== null) ? new Uint8Array(result) : null;
}, [request]);

useR2({
    source: (process !== null)
        ? {
            platform: process.platform,
            arch: process.arch,
            pointerSize: process.pointerSize,
            pageSize: process.pageSize,
            onReadRequest: onR2ReadRequest
        }
        : undefined,
});
```

2. Execute commands from any component:

```ts
import { useR2 } from "@frida/react-use-r2";

…

const { executeR2Command } = useR2();

useEffect(() => {
    let ignore = false;

    async function start() {
        const result = await executeR2Command(`s ${address}; pd`);
        if (!ignore) {
            setR2Output(result);
        }
    }

    start();

    return () => {
        ignore = true;
    };
}, [address]);
```
