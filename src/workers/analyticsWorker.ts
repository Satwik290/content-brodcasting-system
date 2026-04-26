import redis from '../config/redis';
import prisma from '../config/prisma';

const STREAM_KEY = 'content_views_stream';
const CONSUMER_GROUP = 'analytics_workers';
const CONSUMER_NAME = `worker_${process.pid}`;

async function processAnalytics() {
    try {
        // Create consumer group if it doesn't exist
        try {
            await redis.xgroup('CREATE', STREAM_KEY, CONSUMER_GROUP, '0', 'MKSTREAM');
        } catch (e: any) {
            if (!e.message.includes('BUSYGROUP')) throw e;
        }

        console.log(`[Worker] Started analytics processing loop.`);

        while (true) {
            // Read next messages from the stream
            const response = await redis.xreadgroup(
                'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
                'COUNT', 50,
                'BLOCK', 5000,
                'STREAMS', STREAM_KEY, '>'
            ) as any;

            if (response) {
                const messages = response[0][1];
                // Bulk Upsert to DB
                // We aggregate views per contentId for the current date to minimize DB writes
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const aggregation: Record<string, { contentId: string, teacherId: string, subject: string, count: number }> = {};
                const messageIds: string[] = [];

                for (const [id, fields] of messages) {
                    messageIds.push(id);
                    // Fields are key-value pairs in the array: ['content_id', 'UUID', 'teacher_id', 'UUID', 'subject', 'maths', 'timestamp', '...']
                    // ioredis returns them as flat array [key, val, key, val...]
                    const data: Record<string, string> = {};
                    for (let i = 0; i < fields.length; i += 2) {
                        data[fields[i]] = fields[i+1];
                    }

                    const key = data.content_id;
                    if (!aggregation[key]) {
                        aggregation[key] = {
                            contentId: data.content_id,
                            teacherId: data.teacher_id,
                            subject: data.subject,
                            count: 0
                        };
                    }
                    aggregation[key].count++;
                }

                // Perform Upserts
                try {
                    await Promise.all(Object.values(aggregation).map(item => 
                        (prisma as any).analytics.upsert({
                            where: {
                                idx_content_date: {
                                    contentId: item.contentId,
                                    date: today
                                }
                            },
                            update: {
                                viewCount: { increment: item.count }
                            },
                            create: {
                                contentId: item.contentId,
                                teacherId: item.teacherId,
                                subject: item.subject,
                                viewCount: item.count,
                                date: today
                            }
                        })
                    ));

                    console.log(`[Worker] Successfully aggregated and saved ${messageIds.length} views.`);

                    // ONLY ACK messages AFTER successful DB write
                    if (messageIds.length > 0) {
                        await redis.xack(STREAM_KEY, CONSUMER_GROUP, ...messageIds);
                    }
                } catch (dbErr) {
                    console.error('[Worker] DB Upsert Error:', dbErr);
                    // Messages will remain in PEL (Pending Entry List) for retry
                }
            }
        }
    } catch (err) {
        console.error('[Worker] Fatal Error:', err);
        process.exit(1);
    }
}

// Start worker with recovery
async function runWithRecovery() {
    while (true) {
        try {
            await processAnalytics();
        } catch (err) {
            console.error('[Worker] Recovering from error:', err);
            // Wait 5 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

runWithRecovery();
