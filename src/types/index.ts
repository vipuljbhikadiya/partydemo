import type { ConnectionContext, Connection as PartyKitConnection } from 'partyserver';

export type { ConnectionContext };
export interface Connection extends PartyKitConnection {
	data?: {
		userId: string;
		authenticated: boolean;
	};
}
export type Message = string;

export interface StandardResponse<T> {
	status: boolean;
	data?: T;
	error?: string;
}

export interface BingoCard {
	[key: string]: any;
}

export interface Player {
	userId: string | number;
	username: string;
	picture: string;
	status: PlayerStatus;
}

export interface Caller {
	userId: string;
	username: string;
	status: 'online' | 'offline';
	role: 'caller'; // caller
}

export type BingoRequests = PlayerState[];

export enum PlayerStatus {
	NOT_JOINED = 'NOT_JOINED',
	JOINED = 'JOINED',
	LEFT = 'LEFT',
	REMOVED = 'REMOVED',
	BLACKLISTED = 'BLACKLISTED',
}

export interface CardItem {
	[key: string]: any;
}

export type MarkedKeys = number[];
export type CardItems = CardItem[];

export interface PlayerState {
	hasWon: boolean;
	wonAt: number;
	markedKeys: MarkedKeys;
	cardItems: CardItems;
	userGameSettings: { [key: string]: any };
	userId: string | number;
	status: PlayerStatus;
	username: string;
	picture: string;
}

// Define valid call types
export interface CallItem {
	key: number;
	called: boolean;
	type: 'text' | 'image';
	value: string;
}
export type CallItems = CallItem[];

export enum GameStatus {
	WAITING = 0, // Waiting for caller to create game room
	NOT_STARTED = 1, // Game has been created but not started
	IN_PROGRESS = 2, // Game is in progress
	IN_REVIEW = 3, // Checking for bingo
	PAUSED = 4, // Game has been paused
	SAVED = 5, // Game has been saved
}

export interface GameSettings {
	[key: string]: any;
}

export interface GameState {
	gameStatus: GameStatus;
	bingoCard: BingoCard;
	callItems: CallItems;
	calledItems: CallItems;
	playerList: Player[];
	blackListedPlayers: string[]; // Array of userIds
	winnerList: WinnerList; // Array of userIds
	bingoRequests: BingoRequests[];
	roomId: string; // id of the room
	caller: Caller | null;
	gameSettings: GameSettings;
	playerCapacity: number;
	isRoomFull: boolean;
	gameOptions: { [key: string]: any };
}

export type WinnerPlayer = Player & {
	wonAt: number;
};

export type WinnerList = WinnerPlayer[];

export type rejoinRequestsList = Player[];

export interface TokenPayload {
	id: string;
	username: string;
	picture: string | null;
	createdAt: string;
	iat: number;
	exp: number;
	iss: string;
}

export enum GameEventType {
	CREATE_GAME = 'CREATE_GAME',
	JOIN_GAME = 'JOIN_GAME',
	START_GAME = 'START_GAME',
	PAUSE_GAME = 'PAUSE_GAME',
	RESUME_GAME = 'RESUME_GAME',
	SYNC_GAME = 'SYNC_GAME',
	MARK_NUMBER = 'MARK_NUMBER',
	CLAIM_BINGO = 'CLAIM_BINGO',
	VERIFY_BINGO = 'VERIFY_BINGO',
	NEXT_CALL = 'NEXT_CALL',
	END_GAME = 'END_GAME',
	RESTART_GAME = 'RESTART_GAME',
	FINISH_GAME = 'FINISH_GAME',
	UPDATE_GAME_SETTINGS = 'UPDATE_GAME_SETTINGS',
	SHUFFLE_CALL_ITEMS = 'SHUFFLE_CALL_ITEMS',
	DELETE_GAME = 'DELETE_GAME',
	CALL_REORDER = 'CALL_REORDER',
	UPDATE_PLAYER_STATE = 'UPDATE_PLAYER_STATE',
	BINGO_REVIEW_REQUEST = 'BINGO_REVIEW_REQUEST',
	REMOVE_PLAYER = 'REMOVE_PLAYER',
	BLACKLIST_PLAYER = 'BLACKLIST_PLAYER',
	REJOIN_GAME = 'REJOIN_GAME',
	REJOIN_REQUEST_PROCESSED = 'REJOIN_REQUEST_PROCESSED',
	UPDATE_REVIEW_REQUEST = 'UPDATE_REVIEW_REQUEST',
	REJECT_BINGO = 'REJECT_BINGO',
}

export enum BroadcastEventType {
	GAME_CREATED = 'GAME_CREATED',
	PLAYER_JOINED = 'PLAYER_JOINED',
	SUCCESSFULLY_JOINED = 'SUCCESSFULLY_JOINED',
	GAME_ROOM_FULL = 'GAME_ROOM_FULL',
	UPGRADE_PLAYER_CAPACITY = 'UPGRADE_PLAYER_CAPACITY',
	PLAYER_LEFT = 'PLAYER_LEFT',
	GAME_STARTED = 'GAME_STARTED',
	CALL_PLACED = 'CALL_PLACED',
	BINGO_CLAIMED = 'BINGO_CLAIMED',
	BINGO_VERIFIED = 'BINGO_VERIFIED',
	GAME_ENDED = 'GAME_ENDED',
	ERROR = 'ERROR',
	NEW_GAME_STARTED = 'NEW_GAME_STARTED',
	GAME_RESTARTED = 'GAME_RESTARTED',
	GAME_FINISHED = 'GAME_FINISHED',
	CALL_SHUFFLED = 'CALL_SHUFFLED',
	GAME_SETTINGS_UPDATED = 'GAME_SETTINGS_UPDATED',
	GAME_DELETED = 'GAME_DELETED',
	CALL_REORDERED = 'CALL_REORDERED',
	GAME_PAUSED = 'GAME_PAUSED',
	GAME_RESUMED = 'GAME_RESUMED',
	PLAYER_STATE_UPDATED = 'PLAYER_STATE_UPDATED',
	BINGO_REVIEW_REQUEST = 'BINGO_REVIEW_REQUEST',
	BINGO_IN_REVIEW = 'BINGO_IN_REVIEW',
	PLAYER_REMOVED = 'PLAYER_REMOVED',
	PLAYER_BLACKLISTED = 'PLAYER_BLACKLISTED',
	PLAYER_REJOINED = 'PLAYER_REJOINED',
	GAME_SYNCED = 'GAME_SYNCED',
	PLAYER_LIST_UPDATED = 'PLAYER_LIST_UPDATED',
	PLAYER_REJOIN_REQUEST_RECEIVED = 'PLAYER_REJOIN_REQUEST_RECEIVED',
	REJOIN_REQUEST_SENT_SUCCESSFULLY = 'REJOIN_REQUEST_SENT_SUCCESSFULLY',
	NO_VACANCY = 'NO_VACANCY',
	VACANCY_CREATED = 'VACANCY_CREATED',
	REJOIN_REQUEST_RECEIVED = 'REJOIN_REQUEST_RECEIVED',
	REVIEW_REQUEST_UPDATED = 'REVIEW_REQUEST_UPDATED',
	BINGO_ACCEPTED = 'BINGO_ACCEPTED',
	BINGO_REJECTED = 'BINGO_REJECTED',
	PLAYER_WON = 'PLAYER_WON',
	AUTO_WIN = 'AUTO_WIN',
}

export enum ErrorType {
	SYNC_GAME_ERROR = 'SYNC_GAME_ERROR',
	CALLER_ERROR = 'CALLER_ERROR',
	REVIEW_REQUEST_ERROR = 'REVIEW_REQUEST_ERROR',
}

export enum PlayerErrorType {
	JOIN_ERROR = 'JOIN_ERROR',
	ALREADY_JOINED = 'ALREADY_JOINED',
	BLACKLISTED = 'BLACKLISTED',
	REJOIN_REQUEST_ALREADY_EXISTS = 'REJOIN_REQUEST_ALREADY_EXISTS',
	NO_MARKED_KEYS = 'NO_MARKED_KEYS',
	ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
	ALREADY_IN_REVIEW = 'ALREADY_IN_REVIEW',
}

export interface GameEvent {
	type: GameEventType;
	payload: any;
}

export interface BroadcastEvent {
	type: BroadcastEventType;
	payload: any;
}

export interface ConnectionState {
	userId: string;
	isCaller?: boolean;
	joined?: boolean;
	picture?: string;
	username?: string;
}

export interface Env {
	JWT_SECRET: string;
	WORDPRESS_API_URL: string;
	BingoServer: DurableObjectNamespace<import('../index').BingoServer>;
	[key: string]: unknown;
}

export interface BingoCell {
	type: 'number';
	value: number | '';
}

export type totalGamePlayed = number;
