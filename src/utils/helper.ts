import { GameEventType, BingoCell, CallItems } from '@/types';
import { Ticket } from 'bingo-card-generator';

export const CALLER_ONLY_EVENTS = [GameEventType.START_GAME, GameEventType.END_GAME] as const;

export function isCallerOnlyEvent(eventType: GameEventType): boolean {
	return (CALLER_ONLY_EVENTS as readonly GameEventType[]).includes(eventType);
}

export function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array]; // Create a copy to avoid mutating the original array
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export function createHeaderText(headerText: string[], cardGrid: number) {
	const labels =
		headerText && headerText.length > 0
			? [...headerText.map((text) => (text === '' ? ' ' : text)), ...Array(Math.max(cardGrid - headerText.length, 0)).fill(' ')]
			: ['B', 'I', 'N', 'G', 'O'];
	return labels;
}

export const gettraditionalArr = (cardGrid: number, cardItems: any[], headerText: string[], count: number) => {
	const finalGrid = cardGrid === 9 ? 5 : cardGrid;
	const numberLimit = Math.floor(count / finalGrid);

	const labels = createHeaderText(headerText, finalGrid);
	let finalArray = [];

	for (let i = 0; i < numberLimit; i++) {
		for (let j = 0; j < finalGrid; j++) {
			const itemIndex = j * numberLimit + i;
			if (itemIndex < cardItems.length) {
				finalArray.push({ ...cardItems[itemIndex], head: labels[j] });
			}
		}
	}

	return shuffleArray(finalArray);
};

export function generateNumberArray(cardGrid: number, isEmpty = false, headerText: string[] = []) {
	const limit = getLimit(cardGrid);
	const numberArray = [];
	for (let i = 1; i <= limit; i++) {
		numberArray.push({ type: 'number', value: !isEmpty ? i : '' });
	}

	const traditionalArr = gettraditionalArr(cardGrid, numberArray, headerText, limit);
	return traditionalArr;
}

const generate90ballBingo = (): BingoCell[][][] => {
	let ball90Array: BingoCell[][][] = [];
	try {
		const ballArray = Ticket.generateStrip();
		ball90Array = ballArray.map((subArray) => {
			return subArray.map((row) => {
				return row.map((cell) => ({
					type: 'number',
					value: cell === undefined ? '' : cell,
				}));
			});
		});
	} catch (error) {}
	return ball90Array;
};

export const createCardItems = (bingoCard: any, callItems: CallItems) => {
	const { cardGrid, cardType, cardStyle, cardSettings } = bingoCard;
	const { freeSpaceImg } = cardStyle;
	const { freeSpace, freeSpaceText, traditionalRandomization } = cardSettings;

	const count = getLimit(cardGrid);
	let limit = Math.pow(cardGrid, 2);

	if (cardGrid === 9) {
		const playerCardItems = generate90ballBingo();
		return playerCardItems;
	}

	let playerCardItems;
	if (traditionalRandomization || cardType === 'traditional') {
		playerCardItems = traditionalRandomizationArray(cardGrid, count, callItems);
	} else {
		const shuffledCardItems = shuffleArray(callItems);
		playerCardItems = shuffledCardItems.slice(0, limit);
	}

	// Add free space if enabled
	if (freeSpace) {
		const freeSpaceIndex = getFreeSpaceIndex(cardGrid);
		if (freeSpaceImg?.value) {
			playerCardItems[freeSpaceIndex] = {
				type: 'image',
				value: freeSpaceImg.value,
				head: ' ',
				key: -1,
			};
		} else if (freeSpaceText.length > 0) {
			playerCardItems[freeSpaceIndex] = {
				type: 'text',
				value: freeSpaceText,
				head: ' ',
				key: -1,
			};
		}
	}

	return playerCardItems;
};

function getFreeSpaceIndex(cardGrid: number): number {
	switch (cardGrid) {
		case 3: // 3x3 grid - center position
			return 4; // index 4 is center (0-based index)
		case 4: // 4x4 grid - upper center-right position
			return 5; // index 5 is upper center-right
		case 5: // 5x5 grid - center position
			return 12; // index 12 is center
		default:
			return 0;
	}
}

const randomizedCol = (cardGrid: number, cardItems: any[]) => {
	let randiomiseArrayItems: any[] = [];
	randiomiseArrayItems = shuffleArray(cardItems);
	return randiomiseArrayItems.slice(0, cardGrid).map((item) => item);
};

export function traditionalRandomizationArray(cardGrid: number, count: number, cardItems: any[]) {
	const numberLimit = count / cardGrid;

	let numbersArray_B = randomizedCol(cardGrid, cardItems.slice(0, numberLimit));
	let numbersArray_I = randomizedCol(cardGrid, cardItems.slice(1 * numberLimit, numberLimit + 1 * numberLimit));
	let numbersArray_N = randomizedCol(cardGrid, cardItems.slice(2 * numberLimit, numberLimit + 2 * numberLimit));

	let numbersArray_G: any[] = [];
	let numbersArray_O: any[] = [];

	if (cardGrid > 3) {
		numbersArray_G = randomizedCol(cardGrid, cardItems.slice(3 * numberLimit, numberLimit + 3 * numberLimit));
	}

	if (cardGrid > 4) {
		numbersArray_O = randomizedCol(cardGrid, cardItems.slice(4 * numberLimit, numberLimit + 4 * numberLimit));
	}

	const tradiotnalBingoItemsArray = [...numbersArray_B, ...numbersArray_I, ...numbersArray_N, ...numbersArray_G, ...numbersArray_O];

	return tradiotnalBingoItemsArray;
}

export function getLimit(cardGrid: number) {
	return cardGrid === 9 ? 90 : cardGrid === 5 ? 75 : cardGrid === 4 ? 80 : 30;
}

export function traditionalRandomizationArrayWithHeaders(cardGrid: number, textItems: any[], imageItems: any[], headerText: string[]) {
	const limit = getLimit(cardGrid);
	const numberLimit = limit / cardGrid;
	const labels = createHeaderText(headerText, cardGrid);

	let allCallItems = [];

	const maxLength = Math.max(textItems.length, imageItems.length);

	for (let i = 0; i < maxLength; i++) {
		if (i < textItems.length) {
			allCallItems.push({
				...textItems[i],
				key: i,
			});
		}
		if (i < imageItems.length) {
			allCallItems.push({
				...imageItems[i],
				key: textItems.length + i,
			});
		}
	}

	const callItemsArray = allCallItems.slice(0, limit);

	// Add headers based on number ranges
	const callItemsArrayWithHeaders = callItemsArray.map((item, index) => {
		const columnIndex = Math.floor(index / numberLimit);
		return {
			...item,
			head: columnIndex < labels.length ? labels[columnIndex] : ' ',
		};
	});

	const textItemsInLimit = callItemsArrayWithHeaders.filter((item) => item.type === 'text');
	const imageItemsInLimit = callItemsArrayWithHeaders.filter((item) => item.type === 'image');

	return { callItemsArrayWithHeaders, textItemsInLimit, imageItemsInLimit };
}
