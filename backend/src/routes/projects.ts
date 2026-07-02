import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, getOrgMember } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router({ mergeParams: true });

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
});

// GET /api/organizations/:orgId/projects
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member) throw new AppError(403, 'Forbidden', 'Not a member of this organization');

    const projects = await prisma.project.findMany({
      where: { orgId: req.params.orgId },
      include: {
        _count: { select: { queues: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations/:orgId/projects
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new AppError(403, 'Forbidden', 'Insufficient permissions');
    }

    const body = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: { ...body, orgId: req.params.orgId },
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// GET /api/organizations/:orgId/projects/:projectId
router.get('/:projectId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member) throw new AppError(403, 'Forbidden', 'Not a member of this organization');

    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, orgId: req.params.orgId },
      include: {
        queues: {
          include: {
            _count: { select: { jobs: true } },
            retryPolicy: true,
          },
        },
      },
    });

    if (!project) throw new AppError(404, 'Not Found', 'Project not found');
    res.json(project);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/organizations/:orgId/projects/:projectId
router.delete('/:projectId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await getOrgMember(req.user!.userId, req.params.orgId);
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new AppError(403, 'Forbidden', 'Insufficient permissions');
    }

    await prisma.project.delete({
      where: { id: req.params.projectId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
