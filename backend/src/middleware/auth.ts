import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db/client';

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      type: 'https://httpstatuses.com/401',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    // Verify user still exists
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({
        type: 'https://httpstatuses.com/401',
        title: 'Unauthorized',
        status: 401,
        detail: 'User not found',
      });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      type: 'https://httpstatuses.com/401',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid or expired token',
    });
  }
};

/**
 * Verify the authenticated user has access to a given organization.
 * Returns the member record or null.
 */
export const getOrgMember = async (userId: string, orgId: string) => {
  return prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: { org: true },
  });
};
