import { GraphQLError } from 'graphql';
import { ZodError } from 'zod';
import { NotFoundError } from '../service/errors.js';

export const handleError = (error: unknown): never => {
  if (error instanceof NotFoundError) {
    throw new GraphQLError(error.message, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  if (error instanceof ZodError) {
    throw new GraphQLError('Ungültige Eingaben.', {
      extensions: {
        code: 'BAD_USER_INPUT',
        details: error.issues.map((issue) => ({
          feld: issue.path.join('.') || 'input',
          nachricht: issue.message,
        })),
      },
    });
  }
  throw error;
};
