import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ProblemDetails = {
  type: 'about:blank';
  title: string;
  status: ContentfulStatusCode;
  detail?: string;
  errors?: { feld: string; nachricht: string }[];
};

export const createProblemDetails = (
  ctx: Context,
  statusCode: ContentfulStatusCode,
  detail?: string,
  errors?: ProblemDetails['errors'],
): Response => {
  let title: string;
  switch (statusCode) {
    case 400:
      title = 'Bad Request';
      break;
    case 401:
      title = 'Unauthorized';
      break;
    case 403:
      title = 'Forbidden';
      break;
    case 404:
      title = 'Not Found';
      break;
    case 409:
      title = 'Conflict';
      break;
    case 412:
      title = 'Precondition Failed';
      break;
    case 413:
      title = 'Content Too Large';
      break;
    case 415:
      title = 'Unsupported Media Type';
      break;
    case 422:
      title = 'Unprocessable Content';
      break;
    case 428:
      title = 'Precondition Required';
      break;
    case 500:
      title = 'Internal Server Error';
      break;
    case 503:
      title = 'Service Unavailable';
      break;
    default:
      title = 'HTTP Error';
  }
  const problemDetails: ProblemDetails = { type: 'about:blank', title, status: statusCode };
  if (detail !== undefined) {
    problemDetails.detail = detail;
  }
  if (errors !== undefined) {
    problemDetails.errors = errors;
  }
  const response = ctx.json(problemDetails, statusCode);
  response.headers.set('Content-Type', 'application/problem+json');
  return response;
};
