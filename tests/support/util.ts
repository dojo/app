import Promise from 'dojo-shim/Promise';

/**
 * Thenable represents any object with a callable `then` property.
 */
export interface Thenable<T> {
	then<U>(onFulfilled?: (value?: T) => U | Thenable<U>, onRejected?: (error?: any) => U | Thenable<U>): Thenable<U>;
}

export function isEventuallyRejected<T>(promise: Thenable<T>): Thenable<boolean> {
	return promise.then<any>(function () {
		throw new Error('unexpected code path');
	}, function () {
		return true; // expect rejection
	});
}

export function throwImmediatly() {
	throw new Error('unexpected code path');
}

export function defer(): { promise: Promise<any>; resolve(value: any): void; reject(reason: any): void; } {
	let resolve: any;
	let reject: any;
	const promise = new Promise((...args: ((v: any) => void)[]) => {
		[resolve, reject] = args;
	});
	return { promise, resolve, reject };
}
