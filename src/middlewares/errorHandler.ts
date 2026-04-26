import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                message: err.message,
                code: err.name !== 'Error' ? err.name : undefined
            }
        });
    }

    return res.status(500).json({
        success: false,
        error: {
            message: 'Internal server error'
        }
    });
};
