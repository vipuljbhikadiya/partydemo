import { GQ_QUERY_IDS } from '@/utils/constants';
import type { Env } from '@/types';
import ky from 'ky';

interface GameSettingsResponse {
	message?: string;
	status: boolean;
	data?: any;
}

// Add interface for API response
interface WordPressResponse {
	data: any;
}

export async function getGameOptions(env: Env): Promise<GameSettingsResponse> {
	const queryId = GQ_QUERY_IDS.gameSettings;

	try {
		// Type the response
		const response = await ky
			.get(env.WORDPRESS_API_URL, {
				searchParams: {
					queryId,
				},
			})
			.json<WordPressResponse>();

		return {
			status: true,
			data: response?.data ?? {},
		};
	} catch (error: any) {
		console.error('Error fetching game settings:', error);
		return {
			message: error?.message || 'Failed to fetch game settings',
			status: false,
		};
	}
}
