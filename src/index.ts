import { routePartykitRequest, Server } from 'partyserver';
import type { Connection, Message, ConnectionContext, TokenPayload, GameEventType, Env } from '@/types';
import { handleRequest } from '@/handlers/requestHandler';
import { authenticateRequest, getUserFromRequest } from '@/middleware/authMiddleware';
import { verifyToken } from '@/utils/auth';
import { handleGameEvent } from '@/handlers/gameEventHandler';

export class BingoServer extends Server<Env> {
	static options = {
		hibernate: true,
	};

	async onConnect(connection: Connection, ctx: ConnectionContext) {
		//this.ctx.storage.deleteAll();

		const url = new URL(ctx.request.url);
		const token = url.searchParams.get('token');
		const isCaller = url.searchParams.get('caller');

		if (!token) {
			connection.close(4001, 'No token provided');
			return;
		}

		const payload = (await verifyToken(token, this.env.JWT_SECRET)) as TokenPayload | null;
		if (!payload) {
			connection.close(4001, 'Invalid token');
			return;
		}

		connection.setState({
			userId: payload.id,
			isCaller: isCaller === 'true',
			username: payload?.username ?? '',
			picture: payload?.picture ?? '',
		});
	}

	async onMessage(connection: Connection, message: Message) {
		try {
			const event = JSON.parse(message) as { type: GameEventType; payload: any };

			await handleGameEvent(event, connection, this.ctx, this.broadcast.bind(this), this.env, this);
		} catch (error) {
			console.error('Error processing message:', error);
			this.broadcast(
				JSON.stringify({
					type: 'ERROR',
					payload: { message: 'Invalid message format' },
				}),
				[connection.id],
			);
		}
	}

	async onRequest(request: Request): Promise<Response> {
		return Response("Request received", { status: 200 });
		return handleRequest(request, this.ctx);
	}

	async getConnectionTags(connection: Connection, ctx: ConnectionContext) {
		const url = new URL(ctx.request.url);
		const isCaller = url.searchParams.get('caller');
		const user = getUserFromRequest(ctx.request);
		const userId = `${user?.id || ''}`;

		if (isCaller === 'true') return ['caller', userId];
		return ['player', userId];
	}
}

export default {
	async fetch(request: Request, env: Env) {
		(await routePartykitRequest(request, env)) || new Response("Not Found", { status: 404 })
	},
};
