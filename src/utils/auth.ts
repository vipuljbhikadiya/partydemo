import * as jwt from 'jsonwebtoken';

export async function verifyToken(token: string, secret: string) {
	try {
		return jwt.verify(token, secret);
	} catch (error) {
		console.error('Token verification failed:', error);
		return null;
	}
}
