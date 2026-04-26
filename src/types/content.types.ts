import { Status } from '@prisma/client';

export interface CreateContentDTO {
    title: string;
    subject: string;
    description?: string;
    file_path: string;
    file_type: string;
    file_size: number;
    startTime: Date;
    endTime: Date;
    rotationDuration?: number;
}

export interface ContentFilters {
    status?: Status;
    subject?: string;
    limit?: number;
    offset?: number;
}
