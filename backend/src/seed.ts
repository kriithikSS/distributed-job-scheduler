import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash,
      name: 'Demo User',
    },
  });

  // Create organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      ownerId: user.id,
    },
  });

  // Add user as member
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: {},
    create: {
      orgId: org.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  // Create project
  const project = await prisma.project.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'main-app' } },
    update: {},
    create: {
      orgId: org.id,
      name: 'Main App',
      slug: 'main-app',
    },
  });

  // Find or create retry policies (idempotent)
  let exponentialPolicy = await prisma.retryPolicy.findFirst({
    where: { name: 'Default Exponential' },
  });
  if (!exponentialPolicy) {
    exponentialPolicy = await prisma.retryPolicy.create({
      data: {
        name: 'Default Exponential',
        strategy: 'EXPONENTIAL',
        maxAttempts: 5,
        baseDelaySeconds: 30,
        maxDelaySeconds: 3600,
      },
    });
  }

  let fixedPolicy = await prisma.retryPolicy.findFirst({
    where: { name: 'Fixed 60s' },
  });
  if (!fixedPolicy) {
    fixedPolicy = await prisma.retryPolicy.create({
      data: {
        name: 'Fixed 60s',
        strategy: 'FIXED',
        maxAttempts: 3,
        baseDelaySeconds: 60,
        maxDelaySeconds: 60,
      },
    });
  }

  // Upsert queues (idempotent via unique projectId+name)
  const emailQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: project.id, name: 'email' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'email',
      priority: 10,
      concurrencyLimit: 10,
      retryPolicyId: exponentialPolicy.id,
    },
  });

  const reportQueue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: project.id, name: 'reports' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'reports',
      priority: 5,
      concurrencyLimit: 3,
      retryPolicyId: fixedPolicy.id,
    },
  });

  await prisma.queue.upsert({
    where: { projectId_name: { projectId: project.id, name: 'notifications' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'notifications',
      priority: 8,
      concurrencyLimit: 20,
    },
  });

  // Create sample jobs only if the queue is empty
  const existingJobs = await prisma.job.count({ where: { queueId: emailQueue.id } });
  if (existingJobs === 0) {
    const now = new Date();
    await prisma.job.createMany({
      data: [
        {
          queueId: emailQueue.id,
          type: 'IMMEDIATE',
          status: 'COMPLETED',
          name: 'send-welcome-email',
          payload: { to: 'user@example.com', template: 'welcome' },
          completedAt: new Date(now.getTime() - 5 * 60000),
          startedAt: new Date(now.getTime() - 5 * 60000 - 1200),
        },
        {
          queueId: emailQueue.id,
          type: 'IMMEDIATE',
          status: 'QUEUED',
          name: 'send-invoice-email',
          payload: { to: 'client@example.com', invoiceId: 'INV-001' },
          runAt: now,
        },
        {
          queueId: reportQueue.id,
          type: 'SCHEDULED',
          status: 'SCHEDULED',
          name: 'generate-monthly-report',
          payload: { month: 6, year: 2026, format: 'pdf' },
          runAt: new Date(now.getTime() + 60 * 60000),
        },
        {
          queueId: reportQueue.id,
          type: 'RECURRING',
          status: 'QUEUED',
          name: 'daily-analytics',
          payload: { type: 'analytics', scope: 'all' },
          cronExpression: '0 2 * * *',
          runAt: now,
        },
        {
          queueId: emailQueue.id,
          type: 'IMMEDIATE',
          status: 'FAILED',
          name: 'send-reset-email',
          payload: { to: 'broken@example.com' },
          retryCount: 3,
          maxRetries: 3,
          lastError: 'SMTP connection refused',
          failedAt: new Date(now.getTime() - 10 * 60000),
        },
      ],
    });
  }

  console.log('✅ Seed complete!');
  console.log(`   Demo user: demo@example.com / password123`);
  console.log(`   Organization: ${org.slug}`);
  console.log(`   Project: ${project.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
