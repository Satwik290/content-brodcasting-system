export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: {
        code?: string;
        message: string;
        details?: any;
    };
    cached?: boolean;
}
