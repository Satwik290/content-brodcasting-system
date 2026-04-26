import { Content } from '@prisma/client';

export interface RotationResult {
    content: Content | null;
    message?: string;
    activeUntil?: Date;
    nextContent?: Content | null;
    rotationInfo?: {
        totalContents: number;
        currentIndex: number;
        rotationOrder: number;
        remainingSeconds: number;
    };
}
