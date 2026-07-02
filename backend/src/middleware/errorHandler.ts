import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly title: string,
    public readonly detail: string
  ) {
    super(detail);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      type: 'https://httpstatuses.com/422',
      title: 'Validation Error',
      status: 422,
      detail: 'Request validation failed',
      errors: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      type: `https://httpstatuses.com/${err.statusCode}`,
      title: err.title,
      status: err.statusCode,
      detail: err.detail,
    });
    return;
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        type: 'https://httpstatuses.com/409',
        title: 'Conflict',
        status: 409,
        detail: 'A record with this value already exists',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        type: 'https://httpstatuses.com/404',
        title: 'Not Found',
        status: 404,
        detail: 'Record not found',
      });
      return;
    }
  }

  // Unknown errors
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });

  res.status(500).json({
    type: 'https://httpstatuses.com/500',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({
    type: 'https://httpstatuses.com/404',
    title: 'Not Found',
    status: 404,
    detail: 'The requested resource was not found',
  });
};
