export interface AgentInterface {
    readonly id: string;
    readonly name: string;
    readonly config: any;
    readonly runtime: any;
    history: any[];
    run(input: string, callbacks?: any): Promise<{ text: string; toolCalls: any[] }>;
    compactHistory(): void;
}
