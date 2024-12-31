import type { StandardResponse } from '@/types';

export function createResponse<T>(data: T, error?: string): Response {
	const response: StandardResponse<T> = {
		status: !error,
		data: error ? undefined : data,
		error: error,
	};
	return Response.json(response, { status: error ? 400 : 200 });
}
