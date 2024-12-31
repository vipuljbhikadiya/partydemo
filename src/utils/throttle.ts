export function createThrottledBroadcast(broadcast: Function, delay: number = 1000) {
	let queued = false;
	let lastBroadcastData: any = null;

	return (message: any) => {
		lastBroadcastData = message;

		if (queued) return;

		queued = true;
		setTimeout(() => {
			broadcast(JSON.stringify(lastBroadcastData));
			queued = false;
		}, delay);
	};
}
