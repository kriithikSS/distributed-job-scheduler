import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, getOrgMember } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

// GET /api/organizations
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.orgMember.findMany({
      where: { userId: req.user!.userId },
      include: {
        org: {
          include: {
            _count: { select: { projects: true, members: true } },
          },
        },
      },
    });
    res.json(memberships.map((m) => ({ ...m.org, role: m.role })));
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createOrgSchema.parse(req.body);
    const userId = req.user!.userId;

    const org = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { ...body, ownerId: userId },
      });
      await tx.orgMember.create({
        data: { orgId: org.id, userId, role: 'OWNER' },
      });
      return org;
    });

    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

// GET /api/organizations/:orgId
router.get('/:orgId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member) throw new AppError(404, 'Not Found', 'Organization not found');

    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { projects: true } },
      },
    });

    res.json(org);
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations/:orgId/members
router.post('/:orgId/members', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new AppError(403, 'Forbidden', 'Insufficient permissions');
    }

    const body = addMemberSchema.parse(req.body);
    const targetUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (!targetUser) throw new AppError(404, 'Not Found', 'User not found');

    const newMember = await prisma.orgMember.create({
      data: { orgId: req.params.orgId, userId: targetUser.id, role: body.role },
    });

    res.status(201).json(newMember);
  } catch (err) {
    next(err);
  }
});

export default router;
