import prisma from '../src/config/prisma';

async function main() {
    const now = new Date();
    console.log('Current Server Time:', now.toISOString());
    
    const users = await prisma.user.findMany();
    console.log('Users:', users.map(u => ({ id: u.id, email: u.email, role: u.role })));

    const content = await prisma.content.findMany({
        include: { schedule: true, slots: true } as any
    });
    console.log('Content Details:', JSON.stringify(content, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
