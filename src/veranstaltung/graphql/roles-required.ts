import { GraphQLError } from 'graphql';
import { OrganizerRoleRequired, type AccessTokenVerifier } from '../../auth.js';

export const rolesRequired = async (request: Request, verify?: AccessTokenVerifier) => {
  if (!verify) {
    throw new GraphQLError('Schreibzugriffe sind nicht konfiguriert.', {
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
  }
  try {
    return await verify(request.headers.get('Authorization'));
  } catch (error) {
    if (error instanceof OrganizerRoleRequired) {
      throw new GraphQLError('Rolle veranstalter erforderlich.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }
    throw new GraphQLError('Gültiges Access-Token erforderlich.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
};
