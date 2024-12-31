import { PlayerState, PlayerStatus } from '@/types';
import { Context } from 'node:vm';
import type { Connection, Server } from 'partyserver';

export function getConnectionIdsByRole(server: Server, role: 'player' | 'caller'): string[] {
	return Array.from(server.getConnections(role)).map((conn) => conn.id);
}

export function getConnectionsById(server: Server, connectionId: string): Connection | undefined {
	return server.getConnection(connectionId);
}

export function getConnectionsByRole(server: Server, role: 'player' | 'caller'): Connection[] {
	return Array.from(server.getConnections(role));
}

export async function getJoinedPlayers(ctx: Context): Promise<PlayerState[]> {
	const playerList = await ctx.storage.list({ prefix: 'userState-' });
	const playerStates = Array.from(playerList.values()) as PlayerState[];
	const joinedPlayers = playerStates.filter((player) => player.status === PlayerStatus.JOINED);
	return joinedPlayers;
}

export async function getLeftPlayers(ctx: Context): Promise<PlayerState[]> {
	const playerList = await ctx.storage.list({ prefix: 'userState-' });
	const playerStates = Array.from(playerList.values()) as PlayerState[];
	const leftPlayers = playerStates.filter((player) => player.status === PlayerStatus.LEFT);
	return leftPlayers;
}

export async function getBlacklistedPlayers(ctx: Context): Promise<PlayerState[]> {
	const playerList = await ctx.storage.list({ prefix: 'userState-' });
	const playerStates = Array.from(playerList.values()) as PlayerState[];
	const blacklistedPlayers = playerStates.filter((player) => player.status === PlayerStatus.BLACKLISTED);
	return blacklistedPlayers;
}

export async function getRemovedPlayers(ctx: Context): Promise<PlayerState[]> {
	const playerList = await ctx.storage.list({ prefix: 'userState-' });
	const playerStates = Array.from(playerList.values()) as PlayerState[];
	const removedPlayers = playerStates.filter((player) => player.status === PlayerStatus.REMOVED);
	return removedPlayers;
}

export async function getAllPlayers(ctx: Context): Promise<PlayerState[]> {
	const playerList = await ctx.storage.list({ prefix: 'userState-' });
	const playerStates = Array.from(playerList.values()) as PlayerState[];
	return playerStates;
}
