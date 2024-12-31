import type { DurableObjectState } from '@cloudflare/workers-types';
import type { GameState, BingoRequests, BingoCard, CallItems, Player, Caller, PlayerState, WinnerList } from '@/types';
import { createResponse } from '@/utils/responseUtils';
import { getUserFromRequest } from '@/middleware/authMiddleware';
import { getJoinedPlayers } from '@/utils/connections';

export async function handleRequest(request: Request, ctx: DurableObjectState): Promise<Response> {
	const url = new URL(request.url);
	const action = url.searchParams.get('action');

	const user = getUserFromRequest(request);
	const userId = user?.id;

	if (!userId) {
		return createResponse(null, 'User ID not found in token');
	}

	switch (action) {
		case 'getScores':
			return handleGetScores(ctx);
		case 'getPlayers':
			return handleGetPlayers(ctx);
		case 'getGameState':
			return handleGetGameState(ctx, userId);
		default:
			return createResponse(null, 'Invalid action specified');
	}
}

async function handleGetScores(ctx: DurableObjectState): Promise<Response> {
	const scores = await ctx.storage.list();
	return createResponse(scores);
}

async function handleGetPlayers(ctx: DurableObjectState): Promise<Response> {
	const players = await ctx.storage.get('players');
	return createResponse(players);
}

async function handleGetGameState(ctx: DurableObjectState, userId: string | null): Promise<Response> {
	const data = await ctx.storage.get([
		'gameStatus',
		'bingoCard',
		'callItems',
		'calledItems',
		'playerList',
		'blackListedPlayers',
		'winnerList',
		'bingoRequests',
		`userState-${userId}`,
		'roomId',
		'caller',
		'gameSettings',
		'playerCapacity',
		'isRoomFull',
		'gameOptions',
		'rejoinRequestsList',
	]);

	const joinedPlayers = await getJoinedPlayers(ctx);

	const gameState: GameState = {
		gameStatus: (data.get('gameStatus') as number) ?? 0,
		bingoCard: (data.get('bingoCard') ?? {}) as BingoCard,
		callItems: (data.get('callItems') ?? []) as CallItems,
		playerList: joinedPlayers,
		blackListedPlayers: (data.get('blackListedPlayers') ?? []) as string[],
		winnerList: (data.get('winnerList') ?? []) as WinnerList,
		bingoRequests: (data.get('bingoRequests') ?? []) as BingoRequests[],
		roomId: (data.get('roomId') as string) ?? '',
		caller: (data.get('caller') ?? null) as Caller | null,
		gameSettings: (data.get('gameSettings') ?? {}) as { [key: string]: any },
		playerCapacity: (data.get('playerCapacity') as number) ?? 0,
		isRoomFull: (data.get('isRoomFull') as boolean) ?? false,
		calledItems: (data.get('calledItems') ?? []) as CallItems,
		gameOptions: (data.get('gameOptions') ?? {}) as { [key: string]: any },
	};

	return createResponse({
		...gameState,
		playerState: (data.get(`userState-${userId}`) ?? {}) as PlayerState | {},
		rejoinRequestsList: (data.get('rejoinRequestsList') ?? []) as Player[],
	});
}
