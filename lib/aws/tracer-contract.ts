export const TRACER_POST_ID = 'issue-9-fixture';

export const TRACER_API_VERSION = 1 as const;

export type TracerPost = {
  id: string;
  title: string;
  migration: {
    source: string;
    status: string;
  };
};

export type TracerSuccessResponse = {
  version: typeof TRACER_API_VERSION;
  data: TracerPost;
  requestId: string;
};

export type TracerErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export type TracerErrorResponse = {
  version: typeof TRACER_API_VERSION;
  error: {
    code: TracerErrorCode;
    message: string;
  };
  requestId: string;
};

export type TracerApiResponse = TracerSuccessResponse | TracerErrorResponse;

export function isTracerSuccessResponse(
  value: TracerApiResponse
): value is TracerSuccessResponse {
  return 'data' in value;
}
