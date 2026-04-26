import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middlewares/errorHandler';

export interface StorageProvider {
    save(file: Express.Multer.File, metadata: { title: string, subject: string }): Promise<{ path: string, type: string, size: number }>;
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'content');
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(console.error);

export class LocalStorageProvider implements StorageProvider {
    async save(file: Express.Multer.File, metadata: { title: string, subject: string }) {
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
        const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

        if (!allowedExtensions.includes(ext)) {
            throw new AppError('Invalid file type', 400);
        }

        if (file.size > 10 * 1024 * 1024) {
            throw new AppError('File too large (Max 10MB)', 400);
        }

        const magicBytesMap: Record<string, number[]> = {
            'jpg': [0xFF, 0xD8, 0xFF],
            'jpeg': [0xFF, 0xD8, 0xFF],
            'png': [0x89, 0x50, 0x4E, 0x47],
            'gif': [0x47, 0x49, 0x46]
        };

        const sig = magicBytesMap[ext];
        if (sig && !file.buffer.subarray(0, sig.length).equals(Buffer.from(sig))) {
            throw new AppError('File is corrupted or invalid format', 400);
        }

        const secureFilename = `${uuidv4()}.${ext}`;
        const filePath = path.join(UPLOAD_DIR, secureFilename);
        const relativePath = `/uploads/content/${secureFilename}`;

        await fs.writeFile(filePath, file.buffer);

        return {
            path: relativePath,
            type: ext,
            size: file.size
        };
    }
}

// Configured provider singleton
export const UploadService = process.env.STORAGE === 's3'
    ? new LocalStorageProvider() // Replace with S3StorageProvider when implemented
    : new LocalStorageProvider();
