import { getGameOptions } from '@/api/wordpress';
import { GameEventType, BroadcastEventType, GameStatus, PlayerStatus, ErrorType, PlayerErrorType } from '@/types';
import type {
	Connection,
	Message,
	GameEvent,
	ConnectionState,
	GameState,
	Env,
	Caller,
	CallItems,
	PlayerState,
	BingoCard,
	BingoRequests,
	Player,
	rejoinRequestsList,
	WinnerList,
	GameSettings,
	CardItems,
} from '@/types';
import {
	createCardItems,
	generateNumberArray,
	isCallerOnlyEvent,
	shuffleArray,
	traditionalRandomizationArrayWithHeaders,
} from '@/utils/helper';
import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Server } from 'partyserver';
import { DEFAULT_PLAYER_CAPACITY } from '@/utils/constants';
import { getAllPlayers, getConnectionsByRole, getJoinedPlayers } from '@/utils/connections';

export async function handleGameEvent(
	event: GameEvent,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	env: Env,
	server: Server,
): Promise<void> {
	const state = connection.state as ConnectionState;

	// Add caller-only events check
	if (isCallerOnlyEvent(event.type) && !state.isCaller) {
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Unauthorized: Only caller can perform this action' },
			}),
			[connection.id],
		);
		return;
	}

	try {
		switch (event.type) {
			case GameEventType.CREATE_GAME:
				await handleCreateGame(event.payload, connection, ctx, broadcast, env, server);
				break;

			case GameEventType.JOIN_GAME:
				await handleJoinGame(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.START_GAME:
				await handleStartGame(connection, ctx, broadcast);
				break;

			case GameEventType.RESTART_GAME:
				await handleRestartGame(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.FINISH_GAME:
				await handleFinishGame(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.SHUFFLE_CALL_ITEMS:
				await handleShuffleCallItems(event.payload, state, ctx, broadcast);
				break;

			case GameEventType.NEXT_CALL:
				await handleNextCall(event.payload, state, ctx, broadcast);
				break;

			case GameEventType.UPDATE_GAME_SETTINGS:
				await handleUpdateGameSettings(event.payload, state, ctx, broadcast);
				break;

			case GameEventType.DELETE_GAME:
				await handleDeleteGame(event.payload, state, ctx, broadcast);
				break;

			case GameEventType.CALL_REORDER:
				await handleCallReorder(event.payload, connection, ctx, broadcast);
				break;

			case GameEventType.PAUSE_GAME:
				await handlePauseGame(event.payload, connection, ctx, broadcast);
				break;

			case GameEventType.RESUME_GAME:
				await handleResumeGame(event.payload, connection, ctx, broadcast);
				break;

			case GameEventType.UPDATE_PLAYER_STATE:
				await handleUpdatePlayerState(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.BINGO_REVIEW_REQUEST:
				await handleBingoReviewRequest(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.UPDATE_REVIEW_REQUEST:
				await handleUpdateReviewRequest(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.REJECT_BINGO:
				await handleRejectBingo(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.REMOVE_PLAYER:
				await handleRemovePlayer(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.REJOIN_GAME:
				await handleRejoinGame(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.REJOIN_REQUEST_PROCESSED:
				await handleRejoinRequestProcessed(event.payload, connection, ctx, broadcast, server);
				break;

			case GameEventType.SYNC_GAME:
				await handleSyncGame(connection, ctx);
				break;

			default:
				console.warn(`Unhandled game event type: ${event.type}`);
		}
	} catch (error) {
		console.error('Error handling game event:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Error processing game event' },
			}),
			[connection.id],
		);
	}
}

async function handleCreateGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	env: Env,
	server: Server,
) {
	const state = connection.state as ConnectionState;

	// Add validation check for user ID
	if (state?.userId !== payload?.bingoCard?.userId) {
		connection.send(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Unauthorized: User ID mismatch' },
			}),
		);
		return;
	}

	try {
		const gameOptions = await getGameOptions(env);

		if (gameOptions.status === false) {
			connection.send(
				JSON.stringify({
					type: 'ERROR',
					payload: { message: gameOptions.message },
				}),
			);
			return;
		}

		const caller: Caller = {
			userId: state.userId ?? '',
			username: state.username ?? '',
			status: 'online',
			role: 'caller' as const,
		};

		let callItems: CallItems = [];

		const bingoCard = payload.bingoCard;
		const cardGrid = bingoCard.cardGrid;
		const cardType = bingoCard.cardType;
		const textItems = bingoCard.cardItems.textItems;
		const imageItems = bingoCard.cardItems.imageItems;
		const traditionalRandomization = bingoCard.cardSettings.traditionalRandomization;
		const headerText = bingoCard.cardSettings.headerText;
		let updatedBingoCard = bingoCard;

		if (cardType === 'traditional') {
			callItems = generateNumberArray(cardGrid, false, headerText);
		} else {
			if (traditionalRandomization && cardType === 'combo') {
				const { callItemsArrayWithHeaders, textItemsInLimit, imageItemsInLimit } = traditionalRandomizationArrayWithHeaders(
					cardGrid,
					textItems,
					imageItems,
					headerText,
				);

				callItems = callItemsArrayWithHeaders;
				// Update the bingoCard items with keys and called status
				updatedBingoCard = {
					...payload.bingoCard,
					cardItems: {
						textItems: textItemsInLimit,
						imageItems: imageItemsInLimit,
					},
				};
			} else {
				const mappedTextItems = payload.bingoCard.cardItems.textItems.map((item: any, index: number) => ({
					...item,
					key: index,
				}));

				const mappedImageItems = payload.bingoCard.cardItems.imageItems.map((item: any, index: number) => ({
					...item,
					key: payload.bingoCard.cardItems.textItems.length + index,
				}));

				callItems = [...mappedTextItems, ...mappedImageItems];

				// Update the bingoCard items with keys and called status
				updatedBingoCard = {
					...payload.bingoCard,
					cardItems: {
						textItems: mappedTextItems,
						imageItems: mappedImageItems,
					},
				};
			}
		}

		// Store each piece of game state separately
		await ctx.storage.put({
			roomId: payload.roomId,
			bingoCard: updatedBingoCard,
			caller: caller,
			playerList: [],
			gameStatus: GameStatus.NOT_STARTED,
			callItems: shuffleArray(callItems),
			calledItems: [],
			blackListedPlayers: [],
			winnerList: [],
			bingoRequests: [],
			gameSettings: updatedBingoCard.playingSettings as { [key: string]: any },
			playerCapacity: payload.playerCapacity,
			isRoomFull: false,
			gameOptions: gameOptions.data,
			orignalCallItems: callItems,
		});

		// Construct game state for broadcast
		const gameState: GameState = {
			roomId: payload.roomId,
			bingoCard: updatedBingoCard,
			caller: caller,
			playerList: [],
			calledItems: [],
			gameStatus: GameStatus.NOT_STARTED,
			callItems: callItems,
			blackListedPlayers: [],
			winnerList: [],
			bingoRequests: [],
			gameSettings: updatedBingoCard.playingSettings as { [key: string]: any },
			playerCapacity: payload.playerCapacity,
			isRoomFull: false,
			gameOptions: gameOptions.data,
		};

		// Broadcast game creation with proper game state
		broadcast(
			JSON.stringify({
				type: BroadcastEventType.GAME_CREATED,
				payload: gameState,
			}),
		);

		connection.setState({
			...state,
			isCaller: true,
		});
	} catch (error) {
		console.error('Error creating game:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Error creating game' },
			}),
			[connection.id],
		);
	}
}

async function handleJoinGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	try {
		const state = connection.state as ConnectionState;
		const playerId = state.userId;
		const playerStateKey = `userState-${playerId}`;

		const gameData = await ctx.storage.get([
			'playerList',
			'playerCapacity',
			'isRoomFull',
			playerStateKey,
			'bingoCard',
			'orignalCallItems',
			'gameStatus',
			'calledItems',
			'gameSettings',
			'gameOptions',
			'bingoRequests',
			'roomId',
			'winnerList',
		]);

		const playerState = gameData.get(playerStateKey) as PlayerState;
		const callerConnections = getConnectionsByRole(server, 'caller');
		const gameStatus = gameData.get('gameStatus') as GameStatus;
		const calledItems = gameData.get('calledItems') as CallItems;
		const gameSettings = gameData.get('gameSettings') as { [key: string]: any };
		const gameOptions = gameData.get('gameOptions') as { [key: string]: any };
		const bingoRequests = gameData.get('bingoRequests') as BingoRequests;
		const winnerList = gameData.get('winnerList') as WinnerList;
		const roomId = gameData.get('roomId') as string;

		if (!roomId) {
			connection.send(
				JSON.stringify({
					type: PlayerErrorType.ROOM_NOT_FOUND,
					payload: { message: 'Room not created' },
				}),
			);
			return;
		}

		if (playerState?.status) {
			switch (playerState.status) {
				case PlayerStatus.REMOVED:
					callerConnections.forEach((conn) => {
						conn.send(
							JSON.stringify({
								type: BroadcastEventType.PLAYER_REJOIN_REQUEST_RECEIVED,
								payload: { playerId, username: playerState?.username ?? '' },
							}),
						);
					});
					connection.send(
						JSON.stringify({
							type: BroadcastEventType.REJOIN_REQUEST_SENT_SUCCESSFULLY,
							payload: { playerId, username: playerState?.username ?? '' },
						}),
					);
					return;

				case PlayerStatus.JOINED:
					connection.send(
						JSON.stringify({
							type: PlayerErrorType.ALREADY_JOINED,
							payload: { playerState: playerState },
						}),
					);
					return;

				case PlayerStatus.BLACKLISTED:
					connection.send(
						JSON.stringify({
							type: PlayerErrorType.BLACKLISTED,
							payload: { message: 'you are blacklisted for this game' },
						}),
					);
					return;
			}
		}

		// Get all caller connections
		const playerCapacity = gameData.get('playerCapacity') as number;
		const isRoomFull = (gameData.get('isRoomFull') as boolean) || false;
		if (isRoomFull) {
			broadcast(
				JSON.stringify({
					type: BroadcastEventType.GAME_ROOM_FULL,
					payload: { isRoomFull: true },
				}),
			);

			// send diffrent event to this perticualr connection.
			return;
		}

		const joinedPlayers = await getJoinedPlayers(ctx);

		const mappedPlayerList = joinedPlayers.map((player: PlayerState) => ({
			userId: player.userId,
			username: player.username,
			picture: player.picture,
			status: player.status,
		}));

		const bingoCard = gameData.get('bingoCard') as any;
		const callItems = gameData.get('orignalCallItems') as CallItems;

		const playerCardItems = createCardItems(bingoCard as any, callItems as CallItems);

		const newPlayerState: PlayerState = {
			hasWon: false,
			markedKeys: [],
			cardItems: playerCardItems,
			userGameSettings: (playerState as PlayerState)?.userGameSettings || {},
			userId: playerId,
			status: PlayerStatus.JOINED,
			username: payload?.username ?? '',
			picture: state?.picture ?? '',
			wonAt: 0,
		};

		mappedPlayerList.push({
			userId: playerId,
			username: (playerState as PlayerState)?.username ?? state?.username ?? '',
			picture: (playerState as PlayerState)?.picture ?? state?.picture ?? '',
			status: PlayerStatus.JOINED,
		});

		const updatedGameData: {
			playerList: Player[];
			[key: string]: Player[] | PlayerState | boolean;
		} = {
			playerList: mappedPlayerList,
			[playerStateKey]: newPlayerState,
		};

		if (mappedPlayerList.length >= playerCapacity) {
			updatedGameData.isRoomFull = true;
		}

		await ctx.storage.put(updatedGameData);

		connection.send(
			JSON.stringify({
				type: BroadcastEventType.SUCCESSFULLY_JOINED,
				payload: {
					playerList: mappedPlayerList,
					isRoomFull: updatedGameData?.isRoomFull ? true : isRoomFull,
					playerState: newPlayerState,
					gameStatus: gameStatus,
					callItems: callItems,
					calledItems: calledItems,
					gameSettings: gameSettings,
					gameOptions: gameOptions,
					bingoRequests: bingoRequests,
					winnerList: winnerList,
				},
			}),
		);

		broadcast(
			JSON.stringify({
				type: BroadcastEventType.PLAYER_JOINED,
				payload: {
					playerList: mappedPlayerList,
					isRoomFull: updatedGameData?.isRoomFull ? true : isRoomFull,
					bingoRequests: bingoRequests,
					winnerList: winnerList,
				},
			}),
			[connection.id],
		);
	} catch (error) {
		console.error('Error joining game:', error);

		connection.send(
			JSON.stringify({
				type: PlayerErrorType.JOIN_ERROR,
				payload: { message: 'Error joining game', error: (error as Error)?.message || 'Unknown error' },
			}),
		);
	}
}

async function handleStartGame(
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const gameData = await ctx.storage.get(['callItems', 'calledItems', 'gameSettings', 'gameStatus', 'totalGamePlayed']);

	// Get current game status
	const gameStatus = gameData.get('gameStatus') as GameStatus;

	// Check if game is already in progress // change this error type
	if (gameStatus === GameStatus.IN_PROGRESS) {
		connection.send(
			JSON.stringify({
				type: ErrorType.CALLER_ERROR,
				payload: { message: 'Game is already in progress' },
			}),
		);
		return;
	}

	try {
		// Get callItems and calledItems from storage
		const callItems: CallItems = gameData.get('callItems') as CallItems;
		const calledItems: CallItems = gameData.get('calledItems') as CallItems;
		const gameSettings: { [key: string]: any } = gameData.get('gameSettings') as { [key: string]: any };
		const gameMode: string = gameSettings.gameMode as string;

		// Get first item and mark it as called, if nocall mode is there dont push first item to calledItems
		if (callItems.length > 0 && gameMode !== 'no-calls') {
			callItems[0] = { ...callItems[0], called: true };
			calledItems.push(callItems[0]);
		}

		// Increment total games played
		const totalGamePlayed = (gameData.get('totalGamePlayed') as number) || 0;

		await ctx.storage.put({
			gameStatus: GameStatus.IN_PROGRESS,
			calledItems: calledItems,
			callItems: callItems,
			winnerList: [],
			bingoRequests: [],
			totalGamePlayed: totalGamePlayed + 1,
			rejoinRequestsList: [],
		});

		// put game started only here.
		broadcast(
			JSON.stringify({
				type: BroadcastEventType.GAME_STARTED,
				payload: {
					gameStatus: GameStatus.IN_PROGRESS,
					callItems: callItems,
					calledItems: calledItems,
					winnerList: [],
					bingoRequests: [],
					rejoinRequestsList: [],
				},
			}),
		);
	} catch (error) {
		console.error('Error starting game:', error);
		connection.send(
			JSON.stringify({
				type: ErrorType.CALLER_ERROR,
				payload: { message: 'Error starting game', error: (error as Error)?.message || 'Unknown error' },
			}),
		);
	}
}

async function handleRestartGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	//update all card of user on restart game.
	// restart game what we need to do with wiiner list, need to clear it with client.
	// balacklisted to keep as it now letter we will decide.

	try {
		const gameData = await ctx.storage.get(['callItems', 'orignalCallItems', 'bingoCard']);
		const allPlayers = await getAllPlayers(ctx);

		// Get and reset callItems
		const callItems: CallItems = gameData.get('callItems') as CallItems;
		const resetCallItems = callItems.map((item) => ({ ...item, called: false }));

		// Shuffle the callItems
		const shuffledCallItems = shuffleArray(resetCallItems);

		const gameState = {
			gameStatus: GameStatus.IN_PROGRESS,
			calledItems: [],
			blackListedPlayers: [], // kee
			winnerList: [],
			bingoRequests: [],
			callItems: shuffledCallItems, // Store shuffled items
		};

		const orignalCallItems: CallItems = gameData.get('orignalCallItems') as CallItems;
		const bingoCard: BingoCard = gameData.get('bingoCard') as BingoCard;

		const allPlayersConnections = Array.from(server.getConnections('player'));

		const allPlayerStates = Object.fromEntries(
			allPlayersConnections
				.map((connection: Connection) => {
					const state = connection.state as ConnectionState;
					const playerStateKey = `userState-${state.userId}`;
					const playerStateOld = allPlayers.find((player) => player.userId === state.userId);
					const cardItems = createCardItems(bingoCard as any, orignalCallItems as CallItems);

					if (!playerStateOld) {
						return null; // Return null for players without existing state
					}

					const playerState: PlayerState = {
						hasWon: false,
						markedKeys: [],
						cardItems: cardItems,
						userGameSettings: playerStateOld?.userGameSettings ?? {},
						userId: state.userId,
						status: PlayerStatus.JOINED,
						username: playerStateOld?.username ?? state.username ?? '',
						picture: playerStateOld?.picture ?? state.picture ?? '',
						wonAt: 0,
					};
					return [playerStateKey, playerState];
				})
				.filter((entry): entry is [string, PlayerState] => entry !== null), // Remove null entries
		);

		// Update game state
		await ctx.storage.put({ ...gameState, ...allPlayerStates });
		//update player state

		allPlayersConnections.forEach((connection: Connection) => {
			const state = connection.state as ConnectionState;
			const playerStateKey = `userState-${state.userId}`;
			const playerState = allPlayerStates[playerStateKey];
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.GAME_RESTARTED,
					payload: { ...gameState, playerState: playerState },
				}),
			);
		});

		const callerConnections = Array.from(server.getConnections('caller'));
		callerConnections.forEach((connection: Connection) => {
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.GAME_RESTARTED,
					payload: gameState,
				}),
			);
		});
	} catch (error) {
		console.error('Error restarting game:', error);
		broadcast(
			JSON.stringify({
				type: ErrorType.CALLER_ERROR,
				payload: { message: 'Error restarting game', error: (error as Error)?.message || 'Unknown error' },
			}),
			[connection.id],
		);
	}
}

// if game is finished , start case is complicated, need to think about it.
async function handleFinishGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	try {
		const gameData = await ctx.storage.get(['callItems', 'orignalCallItems', 'bingoCard', 'winnerList']);
		const callItems: CallItems = gameData.get('callItems') as CallItems;
		const orignalCallItems: CallItems = gameData.get('orignalCallItems') as CallItems;
		const bingoCard: BingoCard = gameData.get('bingoCard') as BingoCard;
		const winnerList: WinnerList = gameData.get('winnerList') as WinnerList;

		const resetCallItems = callItems.map((item) => ({ ...item, called: false }));

		// Shuffle the callItems
		const shuffledCallItems = shuffleArray(resetCallItems);

		// Reset game state to initial waiting state
		const gameState = {
			playerList: [],
			gameStatus: GameStatus.NOT_STARTED,
			calledItems: [],
			blackListedPlayers: [],
			bingoRequests: [],
			isRoomFull: false,
			callItems: shuffledCallItems, // Include shuffled callItems
			winnerList: winnerList,
		};

		// player state need to be reset and send to all players here. keep card items as it is so card will be there.
		// need to delete data here, if we don't delete it will be in memory. so need to handle client side items, when we are not getting cardItems from server.

		const allPlayers = await getAllPlayers(ctx);
		const allPlayersConnections = Array.from(server.getConnections('player'));

		const allPlayerStates = Object.fromEntries(
			allPlayersConnections
				.map((connection: Connection) => {
					const state = connection.state as ConnectionState;
					const playerStateKey = `userState-${state.userId}`;
					const playerStateOld = allPlayers.find((player) => player.userId === state.userId);
					const cardItems = createCardItems(bingoCard as any, orignalCallItems as CallItems);

					if (!playerStateOld) {
						return null; // Return null for players without existing state
					}

					const playerState: PlayerState = {
						hasWon: false,
						markedKeys: [],
						cardItems: cardItems,
						userGameSettings: playerStateOld?.userGameSettings ?? {},
						userId: state.userId,
						status: PlayerStatus.NOT_JOINED,
						username: playerStateOld?.username ?? state.username ?? '',
						picture: playerStateOld?.picture ?? state.picture ?? '',
						wonAt: 0,
					};
					return [playerStateKey, playerState];
				})
				.filter((entry): entry is [string, PlayerState] => entry !== null), // Remove null entries
		);

		// Update game state
		await ctx.storage.put({ ...gameState, ...allPlayerStates });

		const callerConnections = Array.from(server.getConnections('caller'));
		callerConnections.forEach((connection: Connection) => {
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.GAME_FINISHED,
					payload: gameState,
				}),
			);
		});

		allPlayersConnections.forEach((connection: Connection) => {
			const state = connection.state as ConnectionState;
			const playerStateKey = `userState-${state.userId}`;
			const playerState = allPlayerStates[playerStateKey];
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.GAME_FINISHED,
					payload: { ...gameState, playerState: playerState ? playerState : {} },
				}),
			);
		});
		// send this event to only players that have joined status
	} catch (error) {
		console.error('Error finishing game:', error);
		broadcast(
			JSON.stringify({
				type: ErrorType.CALLER_ERROR,
				payload: { message: 'Error finishing game', error: (error as Error)?.message || 'Unknown error' },
			}),
			[connection.id],
		);
	}
}

async function handleNextCall(
	payload: any,
	state: ConnectionState,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const callItems: CallItems = (await ctx.storage.get('callItems')) || [];
	const calledItems: CallItems = (await ctx.storage.get('calledItems')) || [];

	// Find the first uncalled item
	const nextItemIndex = callItems.findIndex((item) => !item.called);
	if (nextItemIndex !== -1) {
		callItems[nextItemIndex] = { ...callItems[nextItemIndex], called: true };
		calledItems.unshift(callItems[nextItemIndex]);
	}

	// Check if this was the last call by comparing lengths
	const isLastCall = calledItems.length === callItems.length;

	await ctx.storage.put({
		callItems: callItems,
		calledItems: calledItems,
	});

	broadcast(
		JSON.stringify({
			type: BroadcastEventType.CALL_PLACED,
			payload: {
				callItems: callItems,
				calledItems: calledItems,
				isLastCall: isLastCall,
			},
		}),
	);
}

async function handleShuffleCallItems(
	payload: any,
	state: ConnectionState,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const callItems: CallItems = (await ctx.storage.get('callItems')) || [];

	// Separate called and uncalled items
	const calledItems = callItems.filter((item) => item.called);
	const uncalledItems = callItems.filter((item) => !item.called);

	// Shuffle only uncalled items
	const shuffledUncalledItems = shuffleArray(uncalledItems);

	// Combine called items with shuffled uncalled items
	const newCallItems = [...calledItems, ...shuffledUncalledItems];

	// Update storage and broadcast
	await ctx.storage.put({
		callItems: newCallItems,
	});

	broadcast(
		JSON.stringify({
			type: BroadcastEventType.CALL_SHUFFLED,
			payload: {
				callItems: newCallItems,
			},
		}),
	);
}

async function handleUpdateGameSettings(
	payload: any,
	state: ConnectionState,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	try {
		const currentSettings = (await ctx.storage.get('gameSettings')) || {};
		const updatedSettings = { ...currentSettings, ...payload.gameSettings };

		await ctx.storage.put('gameSettings', updatedSettings);

		broadcast(
			JSON.stringify({
				type: BroadcastEventType.GAME_SETTINGS_UPDATED,
				payload: { gameSettings: updatedSettings },
			}),
		);
	} catch (error) {
		console.error('Error updating game settings:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Failed to update game settings' },
			}),
		);
	}
}

async function handleDeleteGame(
	payload: any,
	state: ConnectionState,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	try {
		await ctx.storage.deleteAll();

		broadcast(
			JSON.stringify({
				type: BroadcastEventType.GAME_DELETED,
				payload: {
					playerList: [],
					calledItems: [],
					callItems: [],
					gameStatus: GameStatus.WAITING,
					blackListedPlayers: [],
					winnerList: [],
					bingoRequests: [],
					roomId: '',
					caller: null,
					gameSettings: {},
					playerCapacity: 5,
					isRoomFull: false,
					gameOptions: {},
					rejoinRequestsList: [],
				},
			}),
		);
	} catch (error) {
		console.error('Error deleting game:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Error deleting game' },
			}),
		);
	}
}

async function handleCallReorder(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const callItems: CallItems = (await ctx.storage.get('callItems')) || [];
	const { oldIndex, newIndex } = payload;

	try {
		// Remove the item from the old position and insert at new position
		const [movedItem] = callItems.splice(oldIndex, 1);
		callItems.splice(newIndex, 0, movedItem);

		// Update storage with reordered items
		await ctx.storage.put('callItems', callItems);

		connection.send(
			JSON.stringify({
				type: BroadcastEventType.CALL_REORDERED,
				payload: {
					callItems: callItems,
				},
			}),
		);
	} catch (error) {
		console.error('Error reordering call items:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Error reordering call items' },
			}),
		);
	}
}

async function handlePauseGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const gameStatus = await ctx.storage.get('gameStatus');

	if (gameStatus === GameStatus.IN_PROGRESS) {
		try {
			await ctx.storage.put('gameStatus', GameStatus.PAUSED);

			broadcast(
				JSON.stringify({
					type: BroadcastEventType.GAME_PAUSED,
					payload: { gameStatus: GameStatus.PAUSED },
				}),
			);
		} catch (error) {
			console.error('Error pausing game:', error);
			connection.send(
				JSON.stringify({
					type: 'ERROR',
					payload: { message: 'Error pausing game' },
				}),
			);
		}
	} else {
		connection.send(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Game is not in progress' },
			}),
		);
	}
}

async function handleResumeGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
) {
	const gameStatus = await ctx.storage.get('gameStatus');

	if (gameStatus === GameStatus.PAUSED) {
		try {
			await ctx.storage.put('gameStatus', GameStatus.IN_PROGRESS);

			broadcast(
				JSON.stringify({
					type: BroadcastEventType.GAME_RESUMED,
					payload: { gameStatus: GameStatus.IN_PROGRESS },
				}),
			);
		} catch (error) {
			console.error('Error resuming game:', error);
			connection.send(
				JSON.stringify({
					type: 'ERROR',
					payload: { message: 'Error resuming game' },
				}),
			);
		}
	} else {
		connection.send(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Game is not paused' },
			}),
		);
	}
}

async function handleUpdatePlayerState(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	try {
		const state = connection.state as ConnectionState;
		const userId = state.userId;
		const playerStateKey = `userState-${userId}`;

		const gameData = await ctx.storage.get([
			playerStateKey,
			'gameSettings',
			'calledItems',
			'winnerList',
			'bingoRequests',
			'gameStatus',
			'bingoCard',
		]);

		const gameSettings = gameData.get('gameSettings') as GameSettings;
		const gameStatus = gameData.get('gameStatus') as GameStatus;
		const allConnections = Array.from(server.getConnections(`${userId}`));
		const playerState = gameData.get(playerStateKey) as PlayerState;
		const bingoRequests = (gameData.get('bingoRequests') as PlayerState[]) || [];
		const bingoCard = gameData.get('bingoCard') as BingoCard;
		const cardGrid = bingoCard.cardGrid;

		const updatedPlayerState = {
			...playerState,
			...payload,
		};

		const updatedState: {
			gameStatus: GameStatus;
			[key: string]: any;
		} = {
			gameStatus: gameStatus,
		};

		if (payload?.markedKeys && gameSettings?.autoWin === 1) {
			const isWinner = checkWinningPattern(updatedPlayerState.markedKeys, playerState.cardItems, gameSettings.selectedPattern, cardGrid);

			if (isWinner) {
				const callerConnections = Array.from(server.getConnections('caller'));

				bingoRequests.push(playerState);

				callerConnections.forEach((connection: Connection) => {
					connection.send(
						JSON.stringify({
							type: BroadcastEventType.REVIEW_REQUEST_UPDATED,
							payload: { gameStatus: GameStatus.IN_REVIEW, bingoRequests: bingoRequests },
						}),
					);
				});

				const publicReviewRequests = bingoRequests.map((playerState: PlayerState) => {
					return {
						userId: playerState.userId,
						username: playerState.username,
						picture: playerState.picture,
						status: playerState.status,
					};
				});

				broadcast(
					JSON.stringify({
						type: BroadcastEventType.BINGO_IN_REVIEW,
						payload: { gameStatus: GameStatus.IN_REVIEW, bingoRequests: publicReviewRequests },
					}),
					[...callerConnections.map((connection: Connection) => connection.id)],
				);

				updatedState.gameStatus = GameStatus.IN_REVIEW;
			}
		}

		updatedState[playerStateKey] = updatedPlayerState;

		await ctx.storage.put({ ...updatedState, bingoRequests: bingoRequests, gameStatus: updatedState.gameStatus });

		const playerBingoRequests = bingoRequests.map((playerState: PlayerState) => {
			return {
				userId: playerState.userId,
				username: playerState.username,
				picture: playerState.picture,
				status: playerState.status,
			};
		});

		allConnections.forEach((connection: Connection) => {
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.PLAYER_STATE_UPDATED,
					payload: { playerState: updatedPlayerState, gameStatus: updatedState.gameStatus, bingoRequests: playerBingoRequests },
				}),
			);
		});
	} catch (error) {
		console.error('Error updating player state:', error);
		broadcast(
			JSON.stringify({
				type: 'ERROR',
				payload: { message: 'Error updating player state' },
			}),
		);
	}
}

// Helper function to check if marked keys match winning pattern
function checkWinningPattern(markedKeys: number[], cardItems: any[], winningPattern: string, gridSize: number): boolean {
	// Handle 90-ball bingo separately
	if (gridSize === 9) {
		const requiredLines = parseInt(winningPattern); // 1, 2, or 3 lines

		// Group cardItems into tickets (6 tickets, each with 3 rows)
		const tickets = [];
		for (let i = 0; i < cardItems.length; i += 27) {
			tickets.push(cardItems.slice(i, i + 27));
		}

		// Check each ticket
		return tickets.some((ticket) => {
			// Group ticket items into rows (3 rows per ticket)
			const rows = [];
			for (let i = 0; i < ticket.length; i += 9) {
				const row = ticket.slice(i, i + 9);
				// Only consider non-empty cells
				const rowKeys = row.filter((item) => item && item.key !== undefined).map((item) => item.key);
				rows.push(rowKeys);
			}

			// Count how many complete rows are marked
			let completedRows = 0;
			rows.forEach((rowKeys) => {
				if (rowKeys.length > 0 && rowKeys.every((key) => markedKeys.includes(key))) {
					completedRows++;
				}
			});

			// Return true if the number of completed rows matches or exceeds required lines
			return completedRows >= requiredLines;
		});
	}

	// Rest of the code for other grid sizes
	// Create a flat pattern array where 1 means required position
	const patternArray = new Array(gridSize * gridSize).fill(0);
	const indices = winningPattern.split(',').map(Number);
	indices.forEach((index) => {
		if (index >= 0 && index < gridSize * gridSize) {
			patternArray[index] = 1;
		}
	});

	// Create player's marked array
	const playerArray = new Array(gridSize * gridSize).fill(0);
	const hasFreeSpace = markedKeys.includes(-1);
	const centerPosition = gridSize === 4 ? 5 : Math.floor((gridSize * gridSize) / 2);

	// Fill player array based on marked keys
	markedKeys.forEach((key) => {
		if (key === -1) {
			// Handle free space
			playerArray[centerPosition] = 1;
		} else {
			// Find the item in cardItems to get its position
			const cardItem = cardItems.find((item) => item.key === key);
			if (cardItem) {
				const index = cardItems.indexOf(cardItem);
				if (index >= 0 && index < gridSize * gridSize) {
					playerArray[index] = 1;
				}
			}
		}
	});

	// Compare arrays
	for (let i = 0; i < patternArray.length; i++) {
		if (patternArray[i] === 1) {
			// Skip center position if free space is marked
			if (i === centerPosition && hasFreeSpace) {
				continue;
			}
			if (playerArray[i] !== 1) {
				return false;
			}
		}
	}

	return true;
}

async function handleBingoReviewRequest(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	const state = connection.state as ConnectionState;
	const userId = state.userId;

	console.log('userId', userId);

	const gameData = await ctx.storage.get([`userState-${userId}`, 'bingoRequests']);

	const playerState = gameData.get(`userState-${userId}`) as PlayerState;
	const markedKeys = (playerState as PlayerState).markedKeys || [];
	const bingoRequests = gameData.get('bingoRequests') as BingoRequests | [];
	// Check if markedKeys is empty
	if (!markedKeys?.length) {
		connection.send(
			JSON.stringify({
				type: PlayerErrorType.NO_MARKED_KEYS,
				payload: { message: 'No numbers marked on your card' },
			}),
		);
		return;
	}

	const playerBingoRequests = Array.isArray(bingoRequests) ? [...bingoRequests] : [];

	//check here if already in list, send error if in list.

	const isAlreadyInReview = playerBingoRequests.some((request) => request.userId === userId);

	if (isAlreadyInReview) {
		connection.send(
			JSON.stringify({
				type: PlayerErrorType.ALREADY_IN_REVIEW,
				payload: { message: 'You have already requested bingo' },
			}),
		);
		return;
	}

	playerBingoRequests.push(playerState);

	const updatedState = {
		gameStatus: GameStatus.IN_REVIEW,
		bingoRequests: playerBingoRequests,
	};

	await ctx.storage.put(updatedState);

	const callerConnections = Array.from(server.getConnections('caller'));

	const publicReviewRequests = playerBingoRequests.map((playerState: PlayerState) => {
		return {
			userId: playerState.userId,
			username: playerState.username,
			picture: playerState.picture,
			status: playerState.status,
		};
	});

	callerConnections.forEach((connection: Connection) => {
		connection.send(
			JSON.stringify({
				type: BroadcastEventType.REVIEW_REQUEST_UPDATED,
				payload: { gameStatus: GameStatus.IN_REVIEW, bingoRequests: playerBingoRequests },
			}),
		);
	});

	broadcast(
		JSON.stringify({
			type: BroadcastEventType.BINGO_IN_REVIEW,
			payload: { gameStatus: GameStatus.IN_REVIEW, bingoRequests: publicReviewRequests },
		}),
		[...callerConnections.map((connection: Connection) => connection.id)],
	);
}

async function handleUpdateReviewRequest(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	const { userId, action } = payload;
	// remove isWon from here, user is always win here.

	const playerStateKey = `userState-${userId}`;

	try {
		const gameData = await ctx.storage.get([playerStateKey, 'calledItems', 'bingoRequests', 'winnerList', 'gameStatus']);

		const playerState = gameData.get(playerStateKey) as PlayerState;
		const calledItems = gameData.get('calledItems') as CallItems;
		const bingoRequests = gameData.get('bingoRequests') as BingoRequests;
		const winnerList = (gameData.get('winnerList') as WinnerList) || [];

		// Remove player from bingoRequests regardless of outcome
		const updatedBingoRequests = bingoRequests.filter((player: PlayerState) => player.userId !== userId);
		const updatedState: { [key: string]: any } = { bingoRequests: updatedBingoRequests };

		// Add to winner list
		winnerList.push({
			userId,
			username: playerState.username,
			picture: playerState.picture,
			status: playerState.status,
			wonAt: calledItems.length, // update types here so we can send wonAt in winner list.
		});

		if (action === 'CONTINUE_GAME') {
			// Update player state for winner
			const updatedPlayerState = {
				...playerState,
				hasWon: true,
				wonAt: calledItems.length,
			};
			updatedState[playerStateKey] = updatedPlayerState;

			updatedState.winnerList = winnerList;

			// Update game status based on remaining requests
			updatedState.gameStatus = updatedBingoRequests.length > 0 ? GameStatus.IN_REVIEW : GameStatus.IN_PROGRESS;
		} else {
			await ctx.storage.put({ winnerList });

			handleFinishGame(payload, connection, ctx, broadcast, server);

			return;
			// clear gameStatus here same as finish game case, keep winner list here as it is.

			// If not continuing game, finish it

			// in this case we need to broadcast finish game here.

			// send finish game event here with all default data and winner list.
		}

		console.log('updatedState', updatedState);

		// Update storage
		await ctx.storage.put(updatedState);

		// Send updates to caller
		const callerConnections = Array.from(server.getConnections('caller'));
		callerConnections.forEach((conn: Connection) => {
			conn.send(
				JSON.stringify({
					type: BroadcastEventType.REVIEW_REQUEST_UPDATED,
					payload: {
						bingoRequests: updatedBingoRequests,
						winnerList,
						gameStatus: updatedState.gameStatus,
					},
				}),
			);
		});

		// send both player and other player seprate event here.

		const publicReviewRequests = updatedBingoRequests.map((playerState: PlayerState) => {
			return {
				userId: playerState.userId,
				username: playerState.username,
				picture: playerState.picture,
				status: playerState.status,
			};
		});

		// Send result to the reviewed player
		const playerConnections = Array.from(server.getConnections(`${userId}`));
		playerConnections.forEach((conn: Connection) => {
			conn.send(
				JSON.stringify({
					type: BroadcastEventType.BINGO_ACCEPTED,
					payload: {
						playerState: updatedState[playerStateKey] || playerState,
						gameStatus: updatedState.gameStatus,
						bingoRequests: publicReviewRequests,
						winnerList,
					},
				}),
			);
		});

		// Broadcast updated game status to all other players
		broadcast(
			JSON.stringify({
				type: BroadcastEventType.PLAYER_WON,
				payload: {
					gameStatus: updatedState.gameStatus,
					winnerList,
					bingoRequests: publicReviewRequests,
					whoIsWon: {
						userId: updatedState[playerStateKey].userId,
						username: updatedState[playerStateKey].username,
						picture: updatedState[playerStateKey].picture,
					}, // send only name of user who won. userID, username.
				},
			}),
			[...callerConnections, ...playerConnections].map((conn) => conn.id),
		);
	} catch (error) {
		console.error('Error updating review request:', error);
		connection.send(
			JSON.stringify({
				type: ErrorType.REVIEW_REQUEST_ERROR,
				payload: { message: 'Error updating review request', error: (error as Error)?.message || 'Unknown error' },
			}),
		);
	}
}

// bingo request rejected, then send error to player.
// if length is 0 , after removing user again put game status to in progress.
async function handleRejectBingo(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	try {
		// send reject bingo event here.
		const { userId } = payload;

		const playerStateKey = `userState-${userId}`;

		const gameData = await ctx.storage.get([playerStateKey, 'bingoRequests']);

		const bingoRequests = gameData.get('bingoRequests') as BingoRequests | [];

		const updatedBingoRequests = bingoRequests.filter((playerState: PlayerState) => playerState.userId !== userId);

		const updatedState = {
			bingoRequests: updatedBingoRequests,
			gameStatus: updatedBingoRequests?.length > 0 ? GameStatus.IN_REVIEW : GameStatus.IN_PROGRESS,
		};

		await ctx.storage.put(updatedState);

		const playerConnections = Array.from(server.getConnections(`${userId}`));
		const callerConnections = Array.from(server.getConnections('caller'));

		const publicReviewRequests = updatedBingoRequests.map((playerState: PlayerState) => {
			return {
				userId: playerState.userId,
				username: playerState.username,
				picture: playerState.picture,
				status: playerState.status,
			};
		});

		playerConnections.forEach((conn: Connection) => {
			conn.send(
				JSON.stringify({
					type: BroadcastEventType.BINGO_REJECTED,
					payload: {
						gameStatus: updatedState.gameStatus,
						bingoRequests: publicReviewRequests,
					},
				}),
			);
		});

		callerConnections.forEach((conn: Connection) => {
			conn.send(
				JSON.stringify({
					type: BroadcastEventType.REVIEW_REQUEST_UPDATED,
					payload: { gameStatus: updatedState.gameStatus, bingoRequests: updatedBingoRequests },
				}),
			);
		});

		broadcast(
			JSON.stringify({
				type: BroadcastEventType.REVIEW_REQUEST_UPDATED,
				payload: { gameStatus: updatedState.gameStatus, bingoRequests: publicReviewRequests },
			}),
			[...playerConnections.map((conn) => conn.id), ...callerConnections.map((conn) => conn.id)],
		);
	} catch (error) {
		console.error('Error rejecting bingo:', error);
		connection.send(
			JSON.stringify({
				type: ErrorType.REVIEW_REQUEST_ERROR,
				payload: { message: 'Error rejecting bingo', error: (error as Error)?.message || 'Unknown error' },
			}),
		);
	}
}

async function handleRemovePlayer(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	const removePlayerId = payload.userId;
	const playerStateKey = `userState-${removePlayerId}`;

	const gameData = await ctx.storage.get(['playerCapacity', 'isRoomFull', playerStateKey]);

	const allConnections = Array.from(server.getConnections(`${removePlayerId}`));

	const playerState = gameData.get(playerStateKey) || {};
	const isRoomFull = (gameData.get('isRoomFull') as boolean) || false;
	const joinedPlayers = await getJoinedPlayers(ctx);

	// create vacancy here, if is room full is true, then we need to create vacancy.

	const updatedPlayerState: PlayerState = {
		...(playerState as PlayerState),
		status: PlayerStatus.REMOVED,
	};

	const updatedGameData: {
		[key: string]: Player[] | PlayerState | boolean;
	} = {
		[playerStateKey]: updatedPlayerState,
	};

	const playerCapacity = (gameData.get('playerCapacity') as number) || DEFAULT_PLAYER_CAPACITY;

	const isRoomFullAfterRemoval = joinedPlayers.length < playerCapacity ? false : isRoomFull;

	updatedGameData['isRoomFull'] = isRoomFullAfterRemoval;

	await ctx.storage.put(updatedGameData);

	const updatedJoinedPlayers = joinedPlayers.filter((player) => player.userId !== removePlayerId);

	allConnections.forEach((connection: Connection) => {
		connection.send(
			JSON.stringify({
				type: BroadcastEventType.PLAYER_REMOVED,
				payload: {
					playerList: updatedJoinedPlayers,
					isRoomFull: isRoomFullAfterRemoval,
					playerState: updatedPlayerState,
				},
			}),
		);
	});

	broadcast(
		JSON.stringify({
			type: BroadcastEventType.PLAYER_LIST_UPDATED,
			payload: {
				playerList: updatedJoinedPlayers,
				isRoomFull: isRoomFullAfterRemoval,
			},
		}),
		[...allConnections.map((connection: Connection) => connection.id)],
	);

	// neeed to check this case

	if (isRoomFull && !isRoomFullAfterRemoval) {
		broadcast(
			JSON.stringify({
				type: BroadcastEventType.VACANCY_CREATED,
				payload: { isRoomFull: isRoomFullAfterRemoval },
			}),
		);
	}

	// send vancy to connection that us not still connected.
}

// here need to add in list only if player is not already in list. not to add in list multiple times, if request added multiple times.
async function handleRejoinGame(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	// we will add this player to rejoin request list here.
	const rejoinPlayerId = payload.userId;

	const gameData = await ctx.storage.get([
		'playerList',
		'playerCapacity',
		'isRoomFull',
		'rejoinRequestsList',
		`userState-${rejoinPlayerId}`,
	]);

	const rejoinRequestsList = (gameData.get('rejoinRequestsList') as rejoinRequestsList) || [];

	const isAlreadyInRejoinRequestsList = rejoinRequestsList.some((player) => player.userId === rejoinPlayerId);
	const playerState = gameData.get(`userState-${rejoinPlayerId}`) as PlayerState;

	if (isAlreadyInRejoinRequestsList) {
		connection.send(
			JSON.stringify({
				type: PlayerErrorType.REJOIN_REQUEST_ALREADY_EXISTS,
				payload: { message: 'Rejoin request already exists' },
			}),
		);
		return;
	}

	if (playerState?.status === PlayerStatus.BLACKLISTED) {
		connection.send(
			JSON.stringify({
				type: PlayerErrorType.BLACKLISTED,
				payload: { message: 'you are blacklisted from this game' },
			}),
		);
		return;
	}

	rejoinRequestsList.push({
		userId: rejoinPlayerId,
		username: playerState.username,
		picture: playerState.picture,
		status: playerState.status,
	});

	await ctx.storage.put({ rejoinRequestsList });

	const callerConnections = Array.from(server.getConnections('caller'));

	callerConnections.forEach((connection: Connection) => {
		connection.send(
			JSON.stringify({
				type: BroadcastEventType.REJOIN_REQUEST_RECEIVED,
				payload: { rejoinRequestsList },
			}),
		);
	});
}

// caller can accept rejoin request here. send payload of that user here.
// manage blacklist status also here, so if get blacklisted, we mark blacklisted in player state.
// rejoin request list need to update here.
async function handleRejoinRequestProcessed(
	payload: any,
	connection: Connection,
	ctx: DurableObjectState,
	broadcast: (message: Message, excludeConnectionIds?: string[]) => void,
	server: Server,
) {
	const playerId = payload.userId;
	const action = payload.action;
	const playerStateKey = `userState-${playerId}`;

	const gameData = await ctx.storage.get([
		playerStateKey,
		'isRoomFull',
		'rejoinRequestsList',
		'playerCapacity',
		'gameStatus',
		'bingoRequests',
		'winnerList',
		'calledItems',
		'gameSettings',
	]);

	const playerState = gameData.get(playerStateKey) as PlayerState;
	const isRoomFull = gameData.get('isRoomFull') as boolean;
	const rejoinRequestsList = (gameData.get('rejoinRequestsList') as rejoinRequestsList) || [];
	const joinedPlayerList = await getAllPlayers(ctx);
	const playerCapacity = gameData.get('playerCapacity') as number;
	const callerConnections = Array.from(server.getConnections('caller'));
	const gameStatus = gameData.get('gameStatus') as GameStatus;
	const bingoRequests = gameData.get('bingoRequests') as BingoRequests[];
	const winnerList = gameData.get('winnerList') as WinnerList;
	const calledItems = gameData.get('calledItems') as CallItems;
	const gameSettings = gameData.get('gameSettings') as GameSettings;
	// Check if room is full
	if (isRoomFull) {
		callerConnections.forEach((connection: Connection) => {
			connection.send(
				JSON.stringify({
					type: BroadcastEventType.GAME_ROOM_FULL,
					payload: { isRoomFull: true },
				}),
			);
		});
		return;
	}

	// Prepare database updates
	const dbState: { [key: string]: any } = {};

	const updatedPlayerState: PlayerState = {
		...playerState,
		status: action === 'accept' ? PlayerStatus.JOINED : PlayerStatus.BLACKLISTED,
	};

	// Update database state
	dbState['isRoomFull'] = isRoomFull;
	dbState[playerStateKey] = updatedPlayerState;
	dbState['rejoinRequestsList'] = rejoinRequestsList.filter((player: Player) => player.userId !== playerId);
	const updatedJoinedPlayerList = joinedPlayerList.map((player) => (player.userId === playerId ? updatedPlayerState : player));

	if (updatedJoinedPlayerList.length >= playerCapacity) {
		dbState['isRoomFull'] = true;
	}

	// Update storage
	await ctx.storage.put(dbState);

	const joinedPlayersAfterUpdate = updatedJoinedPlayerList.filter((player) => player.status === PlayerStatus.JOINED);
	// Send response to the player
	const playerConnections = Array.from(server.getConnections(`${playerId}`));
	playerConnections.forEach((conn) => {
		conn.send(
			JSON.stringify({
				type: action === 'accept' ? BroadcastEventType.PLAYER_REJOINED : BroadcastEventType.PLAYER_BLACKLISTED,
				payload: {
					playerState: updatedPlayerState,
					playerList: joinedPlayersAfterUpdate,
					isRoomFull: dbState['isRoomFull'],
					rejoinRequestsList: dbState['rejoinRequestsList'],
					gameStatus: gameStatus,
					bingoRequests: bingoRequests,
					winnerList: winnerList,
					calledItems: calledItems,
					gameSettings: gameSettings,
				},
			}),
		);
	});

	// Broadcast update to all other players
	broadcast(
		JSON.stringify({
			type: BroadcastEventType.PLAYER_LIST_UPDATED,
			payload: {
				rejoinRequestsList: dbState['rejoinRequestsList'],
				playerList: joinedPlayersAfterUpdate,
				isRoomFull: dbState['isRoomFull'],
			},
		}),
		playerConnections.map((conn) => conn.id),
	);
}

async function handleSyncGame(connection: Connection, ctx: DurableObjectState) {
	const state = connection.state as ConnectionState;

	try {
		const userId = state.userId;

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
		]);

		const gameState: GameState = {
			gameStatus: (data.get('gameStatus') as number) ?? 0,
			bingoCard: (data.get('bingoCard') ?? {}) as BingoCard,
			callItems: (data.get('callItems') ?? []) as CallItems,
			playerList: (data.get('playerList') ?? []) as Player[],
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

		const updatedGameState = {
			...gameState,
			playerState: (data.get(`userState-${userId}`) ?? {}) as PlayerState | {},
		};

		connection.send(
			JSON.stringify({
				type: BroadcastEventType.GAME_SYNCED,
				payload: updatedGameState,
			}),
		);
	} catch (error) {
		connection.send(
			JSON.stringify({
				type: ErrorType.SYNC_GAME_ERROR,
				payload: { message: 'Error syncing game', error: (error as Error)?.message || 'Unknown error' },
			}),
		);
		console.error('Error syncing game:', error);
	}
}
