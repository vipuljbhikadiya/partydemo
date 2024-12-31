import { verifyToken } from '@/utils/auth';
import { createResponse } from '@/utils/responseUtils';
import type { TokenPayload } from '@/types';
import { BingoServer } from '..';

const PUBLIC_ROUTES = ['/robots.txt', '/favicon.ico', '/'];

export interface Env {
	JWT_SECRET: string;
	BingoServer: DurableObjectNamespace<BingoServer>;
}
// Extend the Request type to include user
declare global {
	interface Request {
		user?: TokenPayload;
	}
}

export async function authenticateRequest(request: Request, env: Env): Promise<Response | Request> {
	const url = new URL(request.url);

	// Skip authentication for public routes
	if (PUBLIC_ROUTES.includes(url.pathname)) {
		return request;
	}

	const authHeader = request.headers.get('Authorization');
	const queryToken = url.searchParams.get('token');

	const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;

	if (!token) {
		return createResponse(null, 'No token provided');
	}

	const payload = (await verifyToken(token, env.JWT_SECRET)) as TokenPayload | null;

	if (!payload) {
		return createResponse(null, 'Invalid token');
	}

	// Create a new request with the user data in headers
	const authenticatedRequest = new Request(request, {
		headers: new Headers(request.headers),
	});
	// Add user data as a header
	authenticatedRequest.headers.set('X-User-Data', JSON.stringify(payload));

	return authenticatedRequest;
}

export function getUserFromRequest(request: Request): TokenPayload | null {
	const userData = request.headers.get('X-User-Data');
	if (!userData) return null;
	try {
		return JSON.parse(userData) as TokenPayload;
	} catch (error) {
		console.error('Error parsing user data:', error);
		return null;
	}
}
