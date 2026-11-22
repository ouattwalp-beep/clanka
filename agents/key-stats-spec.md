# API Key Usage Stats Specification

## Requirement
A page in the new UI to check API keys:
- Which key is active (currently selected/being used)
- How much usage each key had
- Track stats over time: count of 429s, request counts, errors, etc.
- Save stats persistently so they can be tracked historically

## Data Model Changes

### Extend `KeyPoolEntry` in `src/types.ts`
```typescript
export interface KeyPoolEntry {
    key: string;                      // masked for display
    model?: string;
    baseURL?: string;
    count: number;                    // current minute count (existing)
    minuteStart: number;              // current minute start (existing)
    
    // New usage stats fields
    totalRequests: number;            // lifetime request count
    total429s: number;                // lifetime 429 count
    totalErrors: number;              // lifetime error count (non-429)
    lastUsedAt: number | null;        // timestamp of last request
    last429At: number | null;         // timestamp of last 429
    lastErrorAt: number | null;       // timestamp of last error
    active: boolean;                  // true if this key was the last selected
}
```

### Persistence
- File: `.clanka/key-stats.json` (separate from `keys.json` for clean separation)
- Loaded on `httpClient.init()`, saved on each request update
- Stats are append-only counters (never reset except manually)

## HttpClient Changes

### On every `request()` call:
1. Before request: increment `totalRequests`, set `lastUsedAt`, mark `active: true` for selected key, `active: false` for others
2. On 429: increment `total429s`, set `last429At` for the rate-limited key
3. On other error (non-ok): increment `totalErrors`, set `lastErrorAt`
4. Save pool stats to disk (debounced or batched to avoid excessive writes)

### New accessors:
- `getKeyStats(): KeyPoolEntry[]` — read-only snapshot with all stats
- `getActiveKey(): KeyPoolEntry | undefined` — currently active key
- `resetKeyStats(key: string): void` — reset counters for a key (admin action)

## UI Page (Future — Dashboard)
Screen: **API Keys** (or section within Statistics)
- Table: Key (masked), Model, Base URL, Active (✓/✗), Total Requests, Total 429s, Last Used, Last 429
- Ability to view historical usage trends

## Notes
- Low priority for UI implementation, but data layer should be built now
- Stats survive restarts via `.clanka/key-stats.json`
- Thread-safe: all stats updates happen under the same lock as key selection
